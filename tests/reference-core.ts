export interface Circuit {
  schemaVersion: number;
  dataset: string;
  nodeIds: string[];
  labels: string[];
  positions: number[][];
  offsets: number[];
  targets: number[];
  weights: number[];
  inputs: Record<string, number[]>;
  outputs: Record<string, number[]>;
  sourceCommit?: string;
  annotationCommit?: string;
  selection?: { hops: number; nodes: number; edges: number };
}
export interface Sample {
  step: number;
  timeMs: number;
  rates: Record<string, number>;
  spikes: number;
  activity: number[];
  computeMs: number;
}
export const MODEL = {
  dt: 0.2,
  rest: -52,
  threshold: -45,
  reset: -52,
  tauM: 20,
  tauS: 5,
  refractory: 2.2,
  delay: 1.8,
  externalWeight: 68.75,
};
export function validateCircuit(g: Circuit) {
  const n = g.nodeIds.length;
  if (
    g.schemaVersion !== 1 ||
    !n ||
    g.offsets.length !== n + 1 ||
    g.targets.length !== g.weights.length ||
    g.offsets[0] !== 0 ||
    g.offsets[n] !== g.targets.length
  )
    throw Error('Invalid network package');
  if (
    g.labels.length !== n ||
    g.positions.length !== n ||
    g.positions.some((p) => p.length !== 3 || p.some((v) => !Number.isFinite(v)))
  )
    throw Error('Invalid cell position');
  if (new Set(g.nodeIds).size !== n || g.nodeIds.some((id) => !/^\d+$/.test(id)))
    throw Error('Invalid cell ID');
  for (let i = 0; i < n; i++)
    if (g.offsets[i] > g.offsets[i + 1] || !Number.isInteger(g.offsets[i]))
      throw Error('Invalid CSR');
  for (let i = 0; i < g.targets.length; i++)
    if (
      !Number.isInteger(g.targets[i]) ||
      g.targets[i] < 0 ||
      g.targets[i] >= n ||
      !Number.isFinite(g.weights[i])
    )
      throw Error('Invalid synapse');
  for (const list of [...Object.values(g.inputs), ...Object.values(g.outputs)])
    for (const i of list)
      if (!Number.isInteger(i) || i < 0 || i >= n) throw Error('Invalid population');
}
export class Random {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  exponential(rate: number) {
    return rate > 0 ? (-Math.log(Math.max(1e-12, 1 - this.next())) * 1000) / rate : Infinity;
  }
}
export class Brain {
  readonly graph: Circuit;
  n: number;
  v: Float64Array;
  g: Float64Array;
  refractory: Int32Array;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Float32Array;
  arrivals: Float64Array[];
  inputMask: Uint8Array;
  silenced: Uint8Array;
  stepIndex = 0;
  rng: Random;
  channels: Record<string, { rate: number; next: Float64Array }> = {};
  rates: Record<string, number> = {};
  counts: Record<string, number> = {};
  recentActivity: number[] = [];
  totalSpikes = 0;
  onSpike?: (index: number, timeMs: number) => void;
  constructor(graph: Circuit, seed = 742) {
    validateCircuit(graph);
    this.graph = graph;
    this.n = graph.nodeIds.length;
    this.v = new Float64Array(this.n);
    this.v.fill(MODEL.rest);
    this.g = new Float64Array(this.n);
    this.refractory = new Int32Array(this.n);
    this.offsets = new Uint32Array(graph.offsets);
    this.targets = new Uint32Array(graph.targets);
    this.weights = new Float32Array(graph.weights);
    this.arrivals = Array.from({ length: 11 }, () => new Float64Array(this.n));
    this.inputMask = new Uint8Array(this.n);
    this.silenced = new Uint8Array(this.n);
    this.rng = new Random(seed);
    for (const [name, list] of Object.entries(graph.inputs)) {
      this.channels[name] = { rate: 0, next: new Float64Array(list.length).fill(Infinity) };
      for (const i of list) this.inputMask[i] = 1;
    }
    for (const name of Object.keys(graph.outputs)) {
      this.rates[name] = 0;
      this.counts[name] = 0;
    }
  }
  setInput(name: string, rate: number) {
    const c = this.channels[name];
    if (!c || !Number.isFinite(rate) || rate < 0 || rate > 300)
      throw Error('Invalid sensory input');
    if (Math.abs(c.rate - rate) < 0.05) return;
    c.rate = rate;
    for (let j = 0; j < c.next.length; j++) c.next[j] = this.timeMs + this.rng.exponential(rate);
  }
  silence(list: number[], enable: boolean) {
    for (const i of list) {
      this.silenced[i] = enable ? 1 : 0;
      if (enable) {
        this.v[i] = MODEL.rest;
        this.g[i] = 0;
      }
    }
  }
  get timeMs() {
    return this.stepIndex * MODEL.dt;
  }
  advance(ms: number): Sample {
    const start = performance.now();
    const steps = Math.round(ms / MODEL.dt);
    const counts: Record<string, number> = {};
    for (const k of Object.keys(this.rates)) counts[k] = 0;
    const em = Math.exp(-MODEL.dt / MODEL.tauM),
      es = Math.exp(-MODEL.dt / MODEL.tauS),
      factor = (MODEL.tauS / (MODEL.tauM - MODEL.tauS)) * (em - es);
    const outputMap = new Map<number, string[]>();
    for (const [name, ids] of Object.entries(this.graph.outputs))
      for (const id of ids) outputMap.set(id, [...(outputMap.get(id) || []), name]);
    let spikes = 0;
    this.recentActivity = [];
    for (let s = 0; s < steps; s++) {
      const delivery = this.arrivals[this.stepIndex % 11];
      for (let i = 0; i < this.n; i++) {
        this.g[i] += delivery[i];
        delivery[i] = 0;
      }
      for (const [name, channel] of Object.entries(this.channels)) {
        const ids = this.graph.inputs[name];
        for (let j = 0; j < ids.length; j++)
          while (channel.next[j] <= this.timeMs) {
            this.v[ids[j]] += MODEL.externalWeight;
            channel.next[j] += this.rng.exponential(channel.rate);
          }
      }
      for (let i = 0; i < this.n; i++) {
        if (this.silenced[i]) {
          this.v[i] = MODEL.rest;
          this.g[i] = 0;
          continue;
        }
        if (this.refractory[i] > this.stepIndex) continue;
        const gi = this.g[i];
        this.v[i] = MODEL.rest + (this.v[i] - MODEL.rest) * em + gi * factor;
        this.g[i] = gi * es;
        if (this.v[i] > MODEL.threshold) {
          this.v[i] = MODEL.reset;
          this.g[i] = 0;
          this.refractory[i] = this.stepIndex + (this.inputMask[i] ? 0 : 11);
          spikes++;
          this.totalSpikes++;
          if (this.recentActivity.length < 160) this.recentActivity.push(i);
          this.onSpike?.(i, this.timeMs);
          for (const name of outputMap.get(i) || []) counts[name]++;
          const pending = this.arrivals[(this.stepIndex + 10) % 11];
          for (let e = this.offsets[i]; e < this.offsets[i + 1]; e++)
            pending[this.targets[e]] += this.weights[e];
        }
      }
      this.stepIndex++;
    }
    const smoothing = 1 - Math.exp(-ms / 100);
    for (const [name, ids] of Object.entries(this.graph.outputs)) {
      const instant = ms ? ((counts[name] / ids.length) * 1000) / ms : 0;
      this.rates[name] += smoothing * (instant - this.rates[name]);
      if (ids.every((i) => this.silenced[i])) this.rates[name] = 0;
      this.counts[name] += counts[name];
    }
    return {
      step: this.stepIndex,
      timeMs: this.timeMs,
      rates: { ...this.rates },
      spikes,
      activity: this.recentActivity,
      computeMs: performance.now() - start,
    };
  }
}
