import { parseUrlState, serializeUrlState } from './url-state';
import { mountUI, $, text, syncControls } from './ui';
import { createDefaultState, type AppState } from './state';
import { inputs } from './inputs';
import { EventLog } from './event-log';
import { errorKey } from './errors';
import { renderCell, searchCells } from './inspector';
import { loadingProgress } from './loading';
import './style.css';
import { GPUBrain, type Network, type GPUFrame } from './gpu';
import { loadNetwork, type Manifest } from './data';
import { Scene } from './scene';
import { Sound } from './sound';
import { t, setLanguage, language, type Key, type Language } from './i18n';
mountUI();
let net: Network,
  manifest: Manifest,
  gpu: GPUBrain,
  scene: Scene,
  sound: Sound,
  frame: GPUFrame | null = null;
let ready = false,
  running = false,
  entered = false,
  busy = false;
const state = createDefaultState(matchMedia('(prefers-reduced-motion: reduce)').matches);
const events = new EventLog<Record<string, unknown>>(2000);
const commands: { type: string; value?: unknown; index?: number }[] = [];
let runTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
let recorder: MediaRecorder | null = null,
  recordTimer: ReturnType<typeof setTimeout> | undefined;
let captureTracks: MediaStreamTrack[] = [];
let lastBatchTime = 0;
let actualRate = 0;
let obstacleKey: Key | null = null;
const diagnostics = {
  ready: false,
  running: false,
  neurons: 0,
  edges: 0,
  timeMs: 0,
  totalSpikes: 0,
  active: 0,
  computeMs: 0,
  actualRate: 0,
  fps: 0,
  voices: 0,
  notes: 0,
  packets: 0,
  geometries: 0,
  errors: [] as string[],
  language,
  recordings: 0,
  backend: 'WebGPU',
  allNeurons: true,
};
Object.defineProperty(window, 'brainConcertDiagnostics', {
  get: () => Object.freeze({ ...diagnostics, errors: Object.freeze([...diagnostics.errors]) }),
});
function toast(message: string) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
}
function localize(value: Language) {
  setLanguage(value);
  $<HTMLSelectElement>('language').value = value;
  diagnostics.language = value;
  document.title = 'Brain Concert — ' + t('track');
  text('status', running ? 'live' : entered ? 'paused' : 'waiting');
  if (obstacleKey) text('reason', obstacleKey);
  if (state.selected >= 0) inspect(state.selected);
  $('play').setAttribute('aria-label', t(running ? 'pause' : 'resume'));
  for (const id of ['cut', 'mute'])
    text(
      id,
      id === 'cut'
        ? $(id).getAttribute('aria-pressed') === 'true'
          ? 'reconnect'
          : 'cut'
        : $(id).getAttribute('aria-pressed') === 'true'
          ? 'unmute'
          : 'mute',
    );
  if (recorder?.state === 'recording') text('record', 'recording');
  text('sound', sound?.enabled ? 'soundOff' : 'soundOn');
}
for (const id of ['language'])
  $(id).onchange = () => localize($<HTMLSelectElement>(id).value as Language);
localize(language);
function fail(error: unknown) {
  const message = String(error);
  diagnostics.errors.push(message);
  running = false;
  diagnostics.running = false;
  if (scene) scene.running = false;
  if (sound) {
    sound.playing = false;
    sound.apply();
  }
  clearTimeout(runTimer);
  toast(t(errorKey(error)));
  $('error-code').textContent = message.replace(/^Error: /, '');
  if (!entered) {
    obstacleKey = errorKey(error);
    text('reason', obstacleKey);
    $('obstacle').hidden = false;
    $('loadline').hidden = true;
  }
  text('status', 'error');
}
function queue(type: string, value?: unknown, index?: number) {
  commands.push({ type, value, index });
  if (!busy) void applyCommands().catch(fail);
}
let commandChain: Promise<void> = Promise.resolve();
function applyCommands() {
  if (!gpu || busy) return Promise.resolve();
  commandChain = commandChain.then(async () => {
    while (commands.length) {
      const c = commands.shift()!;
      events.push({ step: gpu.step, ...c });
      switch (c.type) {
        case 'environment':
          state.environment = c.value as AppState['environment'];
          break;
        case 'input': {
          const i = c.index!;
          state.impulses[i] = Number(c.value);
          state.pulsesUntil[i] = gpu.step * 0.2 + 200;
          break;
        }
        case 'cut':
          gpu.cut = Boolean(c.value);
          break;
        case 'mute':
          gpu.mute = Boolean(c.value);
          break;
        case 'silence':
          gpu.silence(c.index!, Boolean(c.value));
          break;
        case 'reset':
          stopRecording();
          await gpu.reset();
          frame = null;
          scene.clear();
          sound.reset();
          Object.assign(
            state,
            createDefaultState(matchMedia('(prefers-reduced-motion: reduce)').matches),
          );
          events.clear();
          diagnostics.totalSpikes = 0;
          diagnostics.timeMs = 0;
          diagnostics.active = 0;
          diagnostics.computeMs = 0;
          lastBatchTime = 0;
          actualRate = 0;
          syncSettings();
          scene.home();
          scene.select(-1);
          $('inspector').hidden = true;
          $<HTMLInputElement>('search').value = '';
          $('results').replaceChildren();
          break;
      }
    }
  });
  return commandChain;
}
async function pump() {
  if (!running || busy) return;
  clearTimeout(runTimer);
  await applyCommands().catch(fail);
  if (!running) return;
  busy = true;
  const begin = performance.now();
  try {
    const next = await gpu.advance(
      10,
      inputs(gpu.step, state.environment, state.impulses, state.pulsesUntil),
    );
    frame = next;
    diagnostics.timeMs = next.timeMs;
    diagnostics.computeMs = next.computeMs;
    diagnostics.totalSpikes += next.counts.reduce((a, b) => a + b, 0);
    diagnostics.active = next.counts.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
    if (lastBatchTime) actualRate = actualRate * 0.9 + 0.1 * (2 / (begin - lastBatchTime));
    lastBatchTime = begin;
    if (running) {
      scene.receive(next, gpu.cut);
      sound.schedule(next);
    }
    if (state.selected >= 0 && $('cell-spikes'))
      $('cell-spikes').textContent = String(next.counts[state.selected]);
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
  }
  await applyCommands().catch(fail);
  if (running)
    runTimer = setTimeout(
      () => void pump(),
      Math.max(0, 2 / state.speed - (performance.now() - begin)),
    );
}
async function play(value: boolean) {
  if (!ready) return;
  if (value && sound.enabled) {
    try {
      await sound.start();
    } catch {
      sound.enabled = false;
      sound.apply();
      $('sound').setAttribute('aria-pressed', 'false');
      toast(t('noAudio'));
    }
  }
  running = value;
  diagnostics.running = value;
  scene.running = value;
  sound.playing = value;
  sound.apply();
  $('play').textContent = value ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', t(value ? 'pause' : 'resume'));
  text('status', value ? 'live' : 'paused');
  if (value) {
    lastBatchTime = 0;
    void pump();
  } else {
    clearTimeout(runTimer);
    if (recorder?.state === 'recording') stopRecording();
  }
}
async function enter(audio: boolean) {
  if (!ready) return;
  entered = true;
  sound.enabled = audio;
  $('sound').setAttribute('aria-pressed', String(audio));
  document.body.classList.remove('startup');
  $('intro').hidden = true;
  await play(true);
  $('play').focus();
}
$('play').onclick = () => void play(!running);
$('sound').onclick = async () => {
  sound.enabled = !sound.enabled;
  $('sound').setAttribute('aria-pressed', String(sound.enabled));
  text('sound', sound.enabled ? 'soundOff' : 'soundOn');
  try {
    if (sound.enabled) await sound.start();
  } catch {
    sound.enabled = false;
    $('sound').setAttribute('aria-pressed', 'false');
    text('sound', 'soundOn');
    toast(t('noAudio'));
  }
  sound.playing = running;
  sound.apply();
};
$('volume').oninput = () => {
  sound.volume = Number($<HTMLInputElement>('volume').value) / 100;
  sound.apply();
};
document.querySelectorAll<HTMLButtonElement>('[data-input]').forEach(
  (b) =>
    (b.onclick = () => {
      if (!running) {
        toast(t('startFirst'));
        return;
      }
      const i = Number(b.dataset.input);
      queue('input', [130, 120, 10, 12][i], i);
      toast(t('inputSent'));
    }),
);
$('settings').onclick = () => {
  $('settings-panel').hidden = !$('settings-panel').hidden;
  $('inspector').hidden = true;
};
$('inspect').onclick = () => {
  $('inspector').hidden = !$('inspector').hidden;
  $('settings-panel').hidden = true;
  if (!$('inspector').hidden) $('search').focus();
};
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(
  (b) =>
    (b.onclick = () => {
      $(b.dataset.close!).hidden = true;
      if (b.dataset.close === 'inspector') {
        scene.select(-1);
        state.selected = -1;
      }
    }),
);
$('environment').onchange = () => queue('environment', $<HTMLSelectElement>('environment').value);
$('palette').onchange = () => {
  state.palette = $<HTMLSelectElement>('palette').value as AppState['palette'];
  sound.palette = state.palette;
  queue('palette', sound.palette);
};
$('speed').oninput = () => {
  state.speed = Number($<HTMLInputElement>('speed').value) / 100;
  $('speed-value').textContent = state.speed.toFixed(2) + '×';
  queue('speed', state.speed);
};
for (const id of ['colour', 'quality'] as const)
  $(id).onchange = () => {
    Object.assign(state, { [id]: $<HTMLSelectElement>(id).value });
    if (id === 'colour') scene.setPalette(state.colour);
    else scene.quality(state.quality);
  };
for (const id of ['gentle', 'drift'] as const)
  $(id).onchange = () => {
    state[id] = $<HTMLInputElement>(id).checked;
    scene[id] = state[id];
  };
for (const id of ['cut', 'mute'])
  $(id).onclick = () => {
    const value = $(id).getAttribute('aria-pressed') !== 'true';
    queue(id, value);
    $(id).setAttribute('aria-pressed', String(value));
    text(id, id === 'cut' ? (value ? 'reconnect' : 'cut') : value ? 'unmute' : 'mute');
    if (id === 'mute' && value) toast(t('allQuiet'));
  };
$('reset').onclick = () => queue('reset');
$('home').onclick = () => {
  scene.home();
  state.selected = -1;
  $('inspector').hidden = true;
};
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(
  (b) =>
    (b.onclick = () => {
      state.mode = b.dataset.mode as AppState['mode'];
      scene.setMode(state.mode);
      document
        .querySelectorAll('[data-mode]')
        .forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
    }),
);
function inspect(index: number) {
  state.selected = index;
  scene.select(index);
  renderCell(
    net,
    index,
    frame,
    state.silent.has(index),
    () => scene.focus(),
    () => {
      const value = !state.silent.has(index);
      if (value) state.silent.add(index);
      else state.silent.delete(index);
      queue('silence', value, index);
      inspect(index);
    },
  );
}
$('search').oninput = () => searchCells(net, inspect);
function cinema(value: boolean) {
  document.body.classList.toggle('cinematic', value);
  document
    .querySelectorAll<HTMLElement>('header,.nameplate,.mode-switch,.tools,.transport')
    .forEach((el) => (el.inert = value));
  if (value) {
    $('settings-panel').hidden = true;
    $('inspector').hidden = true;
    $('exit-cinema').focus();
  } else $('cinema').focus();
}
$('cinema').onclick = () => cinema(true);
$('exit-cinema').onclick = () => cinema(false);
$('about').onclick = () => $<HTMLDialogElement>('about-dialog').showModal();
$('close-about').onclick = () => $<HTMLDialogElement>('about-dialog').close();
function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
$('export').onclick = () =>
  download(
    new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 2,
            seed: gpu.seed,
            step: gpu.step,
            model: 'WebGPU-LIF-f32-dt0.2ms-Bernoulli',
            manifest,
            events: events.toArray(),
            droppedEvents: events.dropped,
            diagnostics,
            notes:
              'Commands are stamped at the GPU integration boundary. A truncated log cannot replay from the initial seed. Float32 GPU execution may differ across hardware.',
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    'aivokonsertti-v2-session.json',
  );
function stopRecording() {
  clearTimeout(recordTimer);
  if (recorder?.state === 'recording') recorder.stop();
  text('record', 'record');
  $('record').classList.remove('recording');
}
$('record').onclick = async () => {
  if (recorder?.state === 'recording') {
    stopRecording();
    return;
  }
  if (!running) {
    toast(t('startFirst'));
    return;
  }
  try {
    if (!('MediaRecorder' in window) || !scene.renderer.domElement.captureStream)
      throw Error('RECORD_UNAVAILABLE');
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
      (x) => MediaRecorder.isTypeSupported(x),
    );
    if (!mime) throw Error('RECORD_UNAVAILABLE');
    const stream = scene.renderer.domElement.captureStream(30);
    captureTracks = [
      ...stream.getVideoTracks(),
      ...(sound.enabled && sound.stream
        ? sound.stream.stream.getAudioTracks().map((t) => t.clone())
        : []),
    ];
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(new MediaStream(captureTracks), {
      mimeType: mime,
      videoBitsPerSecond: 7_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      download(new Blob(chunks, { type: mime }), 'Brain Concert-2-' + Date.now() + '.webm');
      captureTracks.forEach((t) => t.stop());
      captureTracks = [];
      diagnostics.recordings++;
      toast(t('recorded'));
    };
    recorder.start(1000);
    text('record', 'recording');
    $('record').classList.add('recording');
    recordTimer = setTimeout(stopRecording, 30000);
  } catch {
    captureTracks.forEach((t) => t.stop());
    toast(t('recordUnsupported'));
  }
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && entered) {
    cinema(false);
    $('settings-panel').hidden = true;
    $('inspector').hidden = true;
    return;
  }
  if (
    !entered ||
    ['INPUT', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName) ||
    $<HTMLDialogElement>('about-dialog').open
  )
    return;
  if (e.code === 'Space') {
    e.preventDefault();
    void play(!running);
  }
  if (['1', '2', '3', '4'].includes(e.key))
    document.querySelector<HTMLButtonElement>(`[data-input="${Number(e.key) - 1}"]`)?.click();
  if (e.key.toLowerCase() === 'h') cinema(!document.body.classList.contains('cinematic'));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    void play(false);
    toast(t('autoPause'));
  }
});
window.addEventListener('pagehide', () => {
  running = false;
  clearTimeout(runTimer);
  gpu?.dispose();
  scene?.dispose();
  sound?.dispose();
  captureTracks.forEach((t) => t.stop());
});
function syncSettings() {
  syncControls(state);
  sound.palette = state.palette;
  scene.setPalette(state.colour);
  scene.setMode(state.mode);
  scene.quality(state.quality);
  scene.gentle = state.gentle;
  scene.drift = state.drift;
}
$('share').onclick = async () => {
  await applyCommands().catch(fail);
  const url = new URL(location.href);
  url.hash = serializeUrlState(state, net.ids[state.selected]);
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url.href);
    toast(t('linkCopied'));
  } catch {
    toast(t('linkFailed'));
  }
};
async function init() {
  if (!isSecureContext || !navigator.gpu) {
    obstacleKey = !isSecureContext ? 'local' : 'unsupported';
    text('reason', obstacleKey);
    $('obstacle').hidden = false;
    $('loadline').hidden = true;
    return;
  }
  try {
    const a =
      (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
      (await navigator.gpu.requestAdapter());
    if (!a) throw Error('WEBGPU_ADAPTER_UNAVAILABLE');
    const data = await loadNetwork(loadingProgress);
    net = data.net;
    manifest = data.manifest;
    text('loading', 'loadStart');
    await new Promise((r) => setTimeout(r, 0));
    scene = new Scene($('stage'), net, { palette: 'ember' });
    scene.onSelect = inspect;

    gpu = await GPUBrain.create(net);
    gpu.device.addEventListener('uncapturederror', (e) =>
      fail((e as GPUUncapturedErrorEvent).error.message),
    );
    gpu.device.lost.then((info) => {
      if (info.reason !== 'destroyed') fail(Error('GPU_DEVICE_LOST'));
    });
    sound = new Sound(net);
    const { neuron, ...shared } = parseUrlState(location.hash);
    Object.assign(state, shared);
    syncSettings();
    if (neuron) {
      const index = net.ids.indexOf(neuron);
      if (index >= 0) inspect(index);
    }
    ready = true;
    diagnostics.ready = true;
    diagnostics.neurons = net.n;
    diagnostics.edges = net.targets.length;
    document
      .querySelectorAll<HTMLButtonElement>('button[data-await-ready]')
      .forEach((b) => (b.disabled = false));
    text('loading', 'ready');
    let last = performance.now(),
      acc = 0;
    const context = $<HTMLCanvasElement>('wave').getContext('2d')!;
    function render(now: number) {
      if (!scene) return;
      requestAnimationFrame(render);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene.update(dt);
      acc += dt;
      if (acc > 0.15) {
        acc = 0;
        const wave = sound.waveform();
        context.clearRect(0, 0, 240, 60);
        context.beginPath();
        context.strokeStyle = '#e7fba2';
        context.lineWidth = 1;
        for (let i = 0; i < 240; i++) {
          const y = 30 + wave[i * 2] * 65;
          if (i) context.lineTo(i, y);
          else context.moveTo(i, y);
        }
        context.stroke();
        $('model-time').textContent = ((frame?.timeMs ?? 0) / 1000).toFixed(2) + ' s';
        $('active').textContent = new Intl.NumberFormat(language).format(diagnostics.active);
        $('rate').textContent = actualRate.toFixed(3) + '×';
        $('fps').textContent = String(Math.round(scene.fps));
        Object.assign(diagnostics, scene.diagnostics, {
          actualRate,
          voices: sound.voices,
          notes: sound.notes,
        });
      }
    }
    requestAnimationFrame(render);
    await enter(false);
  } catch (e) {
    fail(e);
  }
}
document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  if (!['about', 'close-about'].includes(b.id)) {
    b.disabled = true;
    b.dataset.awaitReady = 'true';
  }
});
void init();
