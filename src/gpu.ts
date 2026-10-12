/// <reference types="@webgpu/types" />
export interface Network {
  n: number;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Int32Array;
  inputs: Uint32Array;
  positions: Float32Array;
  ids: string[];
  labels: string[];
  classes: string[];
}
export interface GPUFrame {
  step: number;
  timeMs: number;
  counts: Uint32Array;
  computeMs: number;
}
export const WGSL = /* wgsl */ `
struct Cell { v:f32, g:f32, refractory:u32, fired:u32 }
struct Params { n:u32, step:u32, seed:u32, cut:u32, mute:u32, pad:u32, taste:f32, vibration:f32, light:f32, scent:f32, pad2:u32, pad3:u32 }
@group(0) @binding(0) var<storage,read_write> cells:array<Cell>;
@group(0) @binding(1) var<storage,read_write> arrivals:array<atomic<i32>>;
@group(0) @binding(2) var<storage,read_write> counts:array<atomic<u32>>;
@group(0) @binding(3) var<storage,read> inputs:array<u32>;
@group(0) @binding(4) var<storage,read> muted:array<u32>;
@group(0) @binding(5) var<storage,read> offsets:array<u32>;
@group(0) @binding(6) var<storage,read> targets:array<u32>;
@group(0) @binding(7) var<storage,read> weights:array<i32>;
@group(0) @binding(8) var<uniform> p:Params;
fn hash(value:u32)->u32 { var x=value; x=(x^(x>>16u))*0x7feb352du; x=(x^(x>>15u))*0x846ca68bu; return x^(x>>16u); }
fn noise(i:u32,channel:u32)->f32 { return f32(hash(p.seed ^ (i*0x9e3779b9u) ^ (p.step*0x85ebca6bu) ^ channel)>>8u)/16777216.; }
@compute @workgroup_size(128) fn integrate(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.n){return;}var c=cells[i];c.fired=0u;
 c.g+=f32(atomicExchange(&arrivals[p.pad*p.n+i],0))*.275;
 if(p.mute!=0u||muted[i]!=0u){c.v=-52.;c.g=0.;cells[i]=c;return;}
 let mask=inputs[i];
 if((mask&1u)!=0u&&noise(i,1u)<p.taste*.0002){c.v+=68.75;}
 if((mask&2u)!=0u&&noise(i,2u)<p.vibration*.0002){c.v+=68.75;}
 if((mask&4u)!=0u&&noise(i,4u)<p.light*.0002){c.v+=68.75;}
 if((mask&8u)!=0u&&noise(i,8u)<p.scent*.0002){c.v+=68.75;}
 if(c.refractory==0u){
 c.v=-52.+(c.v+52.)*0.9900498337491681+c.g*0.009753464865614975
 ;c.g*=0.9607894391523232;
 if(c.v> -45.){c.v=-52.;c.g=0.;c.fired=1u;c.refractory=select(10u,0u,mask!=0u);atomicAdd(&counts[i],1u);}
 }else{c.refractory-=1u;}
 cells[i]=c;
}
@compute @workgroup_size(128) fn transmit(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.n||p.cut!=0u){return;}if(cells[i].fired==0u){return;}
 let slot=((p.pad+10u)%11u)*p.n;
 for(var e=offsets[i];e<offsets[i+1u];e++){atomicAdd(&arrivals[slot+targets[e]],weights[e]);}
}
`;
export class GPUBrain {
  readonly device: GPUDevice;
  readonly net: Network;
  private buffers: GPUBuffer[] = [];
  private group: GPUBindGroup;
  private integrate: GPUComputePipeline;
  private transmit: GPUComputePipeline;
  private parameters: GPUBuffer;
  private readback: GPUBuffer;
  private busy = false;
  step = 0;
  seed = 742;
  cut = false;
  mute = false;
  readonly maxSteps = 64;
  lost = false;
  private constructor(
    device: GPUDevice,
    net: Network,
    pipelines: {
      integrate: GPUComputePipeline;
      transmit: GPUComputePipeline;
      layout: GPUBindGroupLayout;
    },
  ) {
    this.device = device;
    this.net = net;
    this.integrate = pipelines.integrate;
    this.transmit = pipelines.transmit;
    const buffer = (data: ArrayBufferView | number, usage: number) => {
      const size = typeof data === 'number' ? data : data.byteLength;
      const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage });
      if (typeof data !== 'number')
        device.queue.writeBuffer(
          b,
          0,
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        );
      return b;
    };
    const state = new Float32Array(net.n * 4);
    for (let i = 0; i < net.n; i++) state[i * 4] = -52;
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.buffers = [
      buffer(state, storage),
      buffer(net.n * 11 * 4, storage),
      buffer(net.n * 4, storage),
      buffer(net.inputs, storage),
      buffer(net.n * 4, storage),
      buffer(net.offsets, storage),
      buffer(net.targets, storage),
      buffer(net.weights, storage),
    ];
    this.parameters = buffer(this.maxSteps * 256, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.readback = buffer(net.n * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
    this.group = device.createBindGroup({
      layout: pipelines.layout,
      entries: [
        ...this.buffers.map((b, binding) => ({ binding, resource: { buffer: b } })),
        { binding: 8, resource: { buffer: this.parameters, size: 48 } },
      ],
    });
    device.lost.then(() => {
      this.lost = true;
    });
  }
  static async create(net: Network) {
    if (!navigator.gpu) throw Error('WEBGPU_UNAVAILABLE');
    const adapter =
      (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
      (await navigator.gpu.requestAdapter());
    if (!adapter) throw Error('WEBGPU_ADAPTER_UNAVAILABLE');
    const largest = Math.max(net.targets.byteLength, net.weights.byteLength, net.n * 11 * 4);
    if (adapter.limits.maxStorageBufferBindingSize < largest) throw Error('GPU_BUFFER_LIMIT');
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: Math.max(134217728, largest),
        maxBufferSize: Math.max(268435456, largest),
        maxStorageBuffersPerShaderStage: 8,
      },
    });
    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: WGSL });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length) {
      device.destroy();
      throw Error('GPU_SHADER ' + errors.map((e) => e.message).join('\n'));
    }
    const layout = device.createBindGroupLayout({
      entries: [
        ...Array.from({ length: 8 }, (_, binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: (binding <= 2 ? 'storage' : 'read-only-storage') as GPUBufferBindingType,
          },
        })),
        {
          binding: 8,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 },
        },
      ],
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const [integrate, transmit] = await Promise.all(
      ['integrate', 'transmit'].map((entryPoint) =>
        device.createComputePipelineAsync({ layout: pl, compute: { module, entryPoint } }),
      ),
    );
    const err = await device.popErrorScope();
    if (err) {
      device.destroy();
      throw Error('GPU_VALIDATION ' + err.message);
    }
    return new GPUBrain(device, net, { integrate, transmit, layout });
  }
  async advance(steps: number, rates: number[]): Promise<GPUFrame> {
    if (this.busy) throw Error('GPU_BUSY');
    if (this.lost) throw Error('GPU_DEVICE_LOST');
    if (
      !Number.isInteger(steps) ||
      steps < 1 ||
      steps > this.maxSteps ||
      rates.length !== 4 ||
      rates.some((r) => !Number.isFinite(r) || r < 0 || r > 300)
    )
      throw Error('INVALID_ADVANCE');
    this.busy = true;
    const start = performance.now();
    try {
      const data = new ArrayBuffer(steps * 256),
        u = new Uint32Array(data),
        f = new Float32Array(data);
      for (let k = 0; k < steps; k++) {
        const o = k * 64;
        u[o] = this.net.n;
        u[o + 1] = this.step + k;
        u[o + 2] = this.seed;
        u[o + 3] = Number(this.cut);
        u[o + 4] = Number(this.mute);
        u[o + 5] = (this.step + k) % 11;
        for (let j = 0; j < 4; j++) f[o + 6 + j] = rates[j];
      }
      this.device.queue.writeBuffer(this.parameters, 0, data);
      const encoder = this.device.createCommandEncoder();
      encoder.clearBuffer(this.buffers[2]);
      const pass = encoder.beginComputePass();
      for (let k = 0; k < steps; k++) {
        pass.setBindGroup(0, this.group, [k * 256]);
        pass.setPipeline(this.integrate);
        pass.dispatchWorkgroups(Math.ceil(this.net.n / 128));
        pass.setPipeline(this.transmit);
        pass.dispatchWorkgroups(Math.ceil(this.net.n / 128));
      }
      pass.end();
      encoder.copyBufferToBuffer(this.buffers[2], 0, this.readback, 0, this.net.n * 4);
      this.device.queue.submit([encoder.finish()]);
      await this.readback.mapAsync(GPUMapMode.READ);
      const counts = new Uint32Array(this.readback.getMappedRange().slice(0));
      this.readback.unmap();
      this.step += steps;
      return {
        step: this.step,
        timeMs: this.step * 0.2,
        counts,
        computeMs: performance.now() - start,
      };
    } finally {
      this.busy = false;
    }
  }
  silence(index: number, value: boolean) {
    if (index < 0 || index >= this.net.n || !Number.isInteger(index)) throw Error('INVALID_CELL');
    this.device.queue.writeBuffer(this.buffers[4], index * 4, new Uint32Array([Number(value)]));
  }
  async reset() {
    if (this.busy) throw Error('GPU_BUSY');
    const state = new Float32Array(this.net.n * 4);
    for (let i = 0; i < this.net.n; i++) state[i * 4] = -52;
    this.device.queue.writeBuffer(this.buffers[0], 0, state);
    const e = this.device.createCommandEncoder();
    for (const i of [1, 2, 4]) e.clearBuffer(this.buffers[i]);
    this.device.queue.submit([e.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    this.step = 0;
    this.cut = false;
    this.mute = false;
  }
  async inspectState() {
    const b = this.device.createBuffer({
      size: this.net.n * 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const e = this.device.createCommandEncoder();
    e.copyBufferToBuffer(this.buffers[0], 0, b, 0, this.net.n * 16);
    this.device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    const data = b.getMappedRange().slice(0);
    b.unmap();
    b.destroy();
    return data;
  }
  inject(index: number, v: number) {
    this.device.queue.writeBuffer(this.buffers[0], index * 16, new Float32Array([v]));
  }
  dispose() {
    for (const b of [...this.buffers, this.parameters, this.readback]) b.destroy();
    this.device.destroy();
  }
}
