import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Network, GPUFrame } from './gpu';
export type VisualPalette = 'aurora' | 'prism' | 'ember';
export interface SceneOptions {
  transparent?: boolean;
  palette?: VisualPalette;
  pixelRatio?: number;
  interactive?: boolean;
}
const MAX_PACKETS = 6000,
  SEGMENTS = 3;
const VS = `attribute float pulse;attribute float located;uniform float pointSize;uniform float bloomMode;uniform float resolution;varying float heat;varying float depth;varying float lateral;varying float valid;void main(){heat=pulse;valid=located;vec4 mv=modelViewMatrix*vec4(position,1.);depth=clamp((position.z+75.)/150.,0.,1.);lateral=clamp((position.x+130.)/260.,0.,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((pointSize+pulse*(2.4+bloomMode*1.6))*resolution*400./-mv.z,resolution,22.*resolution);}`;
const FS = `varying float heat;varying float depth;varying float lateral;varying float valid;uniform float palette;void main(){if(valid<.5)discard;float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;vec3 hue=mix(vec3(.08,.8,.85),vec3(.72,.16,1.),lateral);hue=mix(hue,vec3(.22,1.,.57),depth*.4);if(palette>.5&&palette<1.5)hue=.5+.5*cos(6.28318*(vec3(0.,.33,.67)+lateral*.7+depth*.25));if(palette>1.5)hue=mix(vec3(1.,.13,.1),vec3(1.,.7,.22),depth);float activityLevel=clamp(heat,0.,1.);vec3 col=mix(hue*.8,hue,activityLevel);float glow=exp(-r*r*6.);float core=exp(-r*r*55.);gl_FragColor=vec4(col,(.42+depth*.3+activityLevel*.65)*(glow*.65+core*.85));}`;
export class Scene {
  renderer: T.WebGLRenderer;
  camera = new T.PerspectiveCamera(42, 1, 0.1, 2200);
  scene = new T.Scene();
  controls: OrbitControls;
  private heat: Float32Array;
  private material: T.ShaderMaterial;
  private cells: T.Points;
  private traces: T.LineSegments;
  private tracePosition = new Float32Array(MAX_PACKETS * 6 * SEGMENTS);
  private traceColor = new Float32Array(MAX_PACKETS * 6 * SEGMENTS);
  private particles: T.Points;
  private packets: { a: number; b: number; born: number; sign: number }[] = [];
  private clock = 0;
  private selection = new T.Group();
  private selected = -1;
  private labelRing: T.LineLoop | null = null;
  private lastAspect = 0;
  private observer: ResizeObserver;
  private palette: VisualPalette = 'aurora';
  private disposed = false;
  mode = 'bloom';
  running = false;
  gentle = false;
  drift = true;
  fps = 60;
  onSelect: (i: number) => void = () => {};
  constructor(
    readonly host: HTMLElement,
    readonly net: Network,
    readonly options: SceneOptions = {},
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(1.5, Math.max(1, devicePixelRatio)));
    this.renderer.setClearColor(0x030810, options.transparent ? 0 : 1);
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = options.interactive !== false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.04;
    this.controls.autoRotateSpeed = 0.32;
    this.controls.minDistance = 45;
    this.controls.maxDistance = 1000;
    this.camera.position.set(8, -8, 350);
    this.controls.target.set(0, -2, 0);
    const positions = new Float32Array(net.n * 3),
      located = new Float32Array(net.n);
    for (let i = 0; i < net.n; i++) {
      positions.set(net.positions.subarray(i * 4, i * 4 + 3), i * 3);
      located[i] = net.positions[i * 4 + 3];
    }
    this.heat = new Float32Array(net.n);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(positions, 3));
    g.setAttribute('located', new T.BufferAttribute(located, 1));
    g.setAttribute('pulse', new T.BufferAttribute(this.heat, 1));
    this.material = new T.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        pointSize: { value: 1.8 },
        bloomMode: { value: 1 },
        resolution: { value: this.renderer.getPixelRatio() },
        palette: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    this.cells = new T.Points(g, this.material);
    this.scene.add(this.cells);
    const backdrop = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.ShaderMaterial({
        vertexShader: `varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,1.,1.);}`,
        fragmentShader: `varying vec2 uvv;
float glow(vec2 p,vec2 center,float radius){return max(0.,1.-length(p-center)/radius);}
void main(){vec2 p=vec2(uvv.x,1.-uvv.y);vec3 color=vec3(3.,8.,16.)/255.;
color=mix(color,vec3(0.,46.,50.)/255.,glow(p,vec2(.69,.09),.36)*.333);
color=mix(color,vec3(19.,19.,49.)/255.,glow(p,vec2(.58,.80),.35)*.533);
color=mix(color,vec3(0.,55.,52.)/255.,glow(p,vec2(.28,.71),.39)*.49);
color=mix(color,vec3(22.,16.,55.)/255.,glow(p,vec2(.28,.28),.45)*.69);
color=mix(color,vec3(1.,4.,7.)/255.,glow(p,vec2(.75,.47),.38));
color*=1.-smoothstep(.25,.72,length(p-vec2(.51,.48)));
gl_FragColor=vec4(color,1.);}`,
        depthWrite: false,
        depthTest: false,
      }),
    );
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -100;
    backdrop.visible = !options.transparent;
    this.scene.add(backdrop);
    this.setPalette(options.palette ?? 'aurora');
    const tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(this.tracePosition, 3));
    tg.setAttribute('color', new T.BufferAttribute(this.traceColor, 3));
    tg.setDrawRange(0, 0);
    this.traces = new T.LineSegments(
      tg,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.scene.add(this.traces);
    this.particles = new T.Points(
      tg,
      new T.PointsMaterial({
        size: 1.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.scene.add(this.particles);
    this.scene.add(this.selection);
    const ray = new T.Raycaster();
    ray.params.Points = { threshold: 1.3 };
    let down = [0, 0];
    this.renderer.domElement.addEventListener(
      'pointerdown',
      (e) => (down = [e.clientX, e.clientY]),
    );
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = this.renderer.domElement.getBoundingClientRect();
      if (options.interactive === false) return;
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = ray
        .intersectObject(this.cells)
        .find((h) => h.index !== undefined && net.positions[h.index * 4 + 3] > 0);
      if (hit?.index !== undefined) this.onSelect(hit.index);
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  setPalette(palette: VisualPalette) {
    this.palette = palette;
    this.material.uniforms.palette.value = ['aurora', 'prism', 'ember'].indexOf(palette);
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.lastAspect) this.home();
    this.lastAspect = w / h;
  }
  home() {
    this.controls.target.set(0, -2, 0);
    this.camera.position.set(
      8,
      -8,
      Math.max(345, 170 / (Math.tan((21 * Math.PI) / 180) * this.camera.aspect)),
    );
    this.select(-1);
  }
  setMode(mode: string) {
    this.mode = mode;
    this.material.uniforms.bloomMode.value = mode === 'bloom' ? 1 : 0;
    this.material.uniforms.pointSize.value = mode === 'threads' ? 1.3 : 1.8;
    this.traces.visible = mode !== 'anatomy';
    this.particles.visible = mode !== 'anatomy';
  }
  quality(profile: boolean | 'low' | 'balanced' | 'high') {
    const mode = typeof profile === 'boolean' ? (profile ? 'low' : 'high') : profile;
    this.renderer.setPixelRatio(
      mode === 'low'
        ? 1
        : mode === 'balanced'
          ? Math.min(1.5, Math.max(1, devicePixelRatio))
          : (this.options.pixelRatio ?? Math.min(2.5, Math.max(1, devicePixelRatio))),
    );
    this.material.uniforms.resolution.value = this.renderer.getPixelRatio();
    this.resize();
  }
  receive(frame: GPUFrame, cut: boolean) {
    let budget = 0;
    const n = this.net.n,
      start = frame.step % n;
    for (let j = 0; j < n; j++) {
      const i = (start + j) % n,
        c = frame.counts[i];
      if (!c) continue;
      this.heat[i] = Math.min(2, 0.65 + Math.log2(1 + c) * 0.38);
      if (this.gentle || cut || budget >= 400 || !this.net.positions[i * 4 + 3]) continue;
      const a = this.net.offsets[i],
        b = this.net.offsets[i + 1];
      if (b <= a) continue;
      for (
        let k = 0;
        k < Math.min(3, b - a) && budget < 400 && this.packets.length < MAX_PACKETS;
        k++
      ) {
        const e = a + ((frame.step + k * 997) % (b - a)),
          target = this.net.targets[e];
        if (!this.net.positions[target * 4 + 3]) continue;
        this.packets.push({ a: i, b: target, born: this.clock, sign: this.net.weights[e] });
        budget++;
      }
    }
  }
  clear() {
    this.heat.fill(0);
    this.packets = [];
    this.traces.geometry.setDrawRange(0, 0);
  }
  select(index: number) {
    this.selected = index;
    while (this.selection.children.length) {
      const c = this.selection.children[0] as T.Line;
      this.selection.remove(c);
      c.geometry.dispose();
      (c.material as T.Material).dispose();
    }
    this.labelRing = null;
    if (index < 0 || !this.net.positions[index * 4 + 3]) return;
    const lines: number[] = [],
      colors: number[] = [];
    const a = this.net.positions.subarray(index * 4, index * 4 + 3);
    for (let e = this.net.offsets[index]; e < this.net.offsets[index + 1]; e++) {
      const target = this.net.targets[e];
      if (!this.net.positions[target * 4 + 3]) continue;
      lines.push(...a, ...this.net.positions.subarray(target * 4, target * 4 + 3));
      const c = new T.Color(this.net.weights[e] > 0 ? 0xe8f59c : 0xec326b);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    this.selection.add(
      new T.LineSegments(
        g,
        new T.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      ),
    );
    const ring = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(
        Array.from(
          { length: 80 },
          (_, i) =>
            new T.Vector3(
              Math.cos((i / 80) * Math.PI * 2) * 3,
              Math.sin((i / 80) * Math.PI * 2) * 3,
              0,
            ),
        ),
      ),
      new T.LineBasicMaterial({ color: 0xefffac }),
    );
    ring.position.fromArray(a);
    this.selection.add(ring);
    this.labelRing = ring;
  }
  focus() {
    if (this.selected < 0 || !this.net.positions[this.selected * 4 + 3]) return;
    this.controls.target.fromArray(
      this.net.positions.subarray(this.selected * 4, this.selected * 4 + 3),
    );
    this.camera.position.copy(this.controls.target).add(new T.Vector3(0, 0, 65));
  }
  update(dt: number) {
    this.fps = this.fps * 0.96 + Math.min(120, 1 / Math.max(dt, 0.001)) * 0.04;
    if (this.running) {
      this.clock += Math.min(dt, 0.1);
      const decay = Math.exp(-dt * 2.2);
      for (let i = 0; i < this.heat.length; i++) this.heat[i] *= decay;
    }
    this.controls.autoRotate = this.drift && !this.gentle;
    this.controls.update(dt);
    this.labelRing?.quaternion.copy(this.camera.quaternion);
    (this.cells.geometry.getAttribute('pulse') as T.BufferAttribute).needsUpdate = true;
    this.packets = this.packets.filter((p) => this.clock - p.born < 1.3);
    for (let i = 0; i < this.packets.length; i++) {
      const p = this.packets[i],
        u = (this.clock - p.born) / 1.3,
        a = p.a * 4,
        b = p.b * 4;
      const hue =
        this.palette === 'ember'
          ? p.sign > 0
            ? [1, 0.55, 0.15]
            : [1, 0.12, 0.3]
          : this.palette === 'prism'
            ? p.sign > 0
              ? [0.3, 0.9, 1]
              : [1, 0.3, 0.65]
            : p.sign > 0
              ? [0.12, 1, 0.72]
              : [0.7, 0.2, 1];
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const head = Math.max(0, u - segment * 0.045),
          tail = Math.max(0, u - (segment + 1) * 0.045),
          o = (i * SEGMENTS + segment) * 6;
        for (let k = 0; k < 3; k++) {
          const bend = this.mode === 'bloom' ? Math.sin(p.a * 0.71 + k * 2) * 14 : 0;
          this.tracePosition[o + k] =
            this.net.positions[a + k] +
            (this.net.positions[b + k] - this.net.positions[a + k]) * head +
            bend * Math.sin(head * Math.PI);
          this.tracePosition[o + 3 + k] =
            this.net.positions[a + k] +
            (this.net.positions[b + k] - this.net.positions[a + k]) * tail +
            bend * Math.sin(tail * Math.PI);
          const strength = Math.sin(Math.PI * u) * (1 - segment / SEGMENTS) * 0.65;
          this.traceColor[o + k] = hue[k] * strength;
          this.traceColor[o + 3 + k] = hue[k] * strength * 0.5;
        }
      }
    }
    this.traces.geometry.setDrawRange(0, this.packets.length * 2 * SEGMENTS);
    for (const key of ['position', 'color']) {
      const attribute = this.traces.geometry.getAttribute(key) as T.BufferAttribute;
      attribute.clearUpdateRanges();
      if (this.packets.length) {
        attribute.addUpdateRange(0, this.packets.length * 6 * SEGMENTS);
        attribute.needsUpdate = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  get diagnostics() {
    return {
      pixelRatio: this.renderer.getPixelRatio(),
      palette: this.palette,
      renderWidth: this.renderer.domElement.width,
      renderHeight: this.renderer.domElement.height,
      fps: Math.round(this.fps),
      packets: this.packets.length,
      geometries: this.renderer.info.memory.geometries,
      drawCalls: this.renderer.info.render.calls,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.controls.dispose();
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    this.scene.traverse((o) => {
      const mesh = o as T.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material)
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          materials.add(m);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
