# Embedding the visual component

The application is self-contained, not a published general-purpose library. The visual component receives an existing `Network` and `GPUFrame`; it does not load data, start computation, create audio or inject controls.

```ts
import {Scene} from './src/scene';
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
