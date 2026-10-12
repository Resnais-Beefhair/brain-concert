# Embedding the visual component

The application is self-contained, not a published general-purpose library. The visual component receives an existing `Network` and `GPUFrame`; it does not load data, start computation, create audio or inject controls.

```ts
import { Scene } from './src/scene';
const visual = new Scene(container, network, {
  transparent: true,
  palette: 'aurora', // aurora | prism | ember
  interactive: false,
  pixelRatio: 1.5,
});
visual.running = true;
visual.receive(frame, false);
visual.update(deltaSeconds); // host owns the animation loop
// Stop the host's animation loop before teardown:
visual.dispose();
```

The container needs a nonzero layout size. ResizeObserver follows it. Transparent mode removes the solid background and artistic backdrop. Do not call update after disposal.

For another website, defer the large data load until requested, preserve useful page content without WebGPU, start audio only after user interaction, and handle visibility and reduced-motion preferences. Label prerecorded fallbacks as recordings, not live simulation.

The standalone app defaults to balanced resolution: device pixel ratio capped at 1.5. Full detail uses the device ratio; reduced detail uses 1. These settings change rendering, not the computation graph.

## Read-only browser diagnostics

`window.brainConcertDiagnostics` is intentionally available in development and
production for local inspection and bug reports. Each access returns a frozen
snapshot (including a copied, frozen `errors` array), not a simulation-control API.
Read it again for current values. Existing fields include `ready`, `running`,
`neurons`, `edges`, `timeMs`, `totalSpikes`, `errors` and `language`; render metrics
may appear after the first frame. It contains no credentials and sends nothing.

Do not depend on specific frame rates or use this as a stable control interface.
The JSON event export is bounded to the latest 2,000 chronological commands and
includes an explicit dropped-event count.
