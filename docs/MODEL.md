# Model and interpretation

The WebGPU model in `src/gpu.ts` is a leaky integrate-and-fire adaptation of the Shiu/Spiller Drosophila brain model, using 0.2 ms integration steps, float32 state, and integer atomic accumulation of signed synapse counts. External stimulation uses deterministic seeded Bernoulli trials. GPU results can differ across hardware in floating-point details.

The whole computational network is simulated. Rendering and audio deliberately present bounded samples of its spikes. A moving light trace follows a real graph connection from a firing source but does not prove that its target fired. Its curve and travel speed are artistic, not a traced axon or measured conduction delay.

`src/sound.ts` maps selected activity into authored scales, registers and timbres. Cell identifiers participate in pitch selection; an identifier is not a biological pitch property. The automatic sensory environment also has authored temporal structure. Consequently, musical structure cannot be attributed solely to the measured connectome.

Useful starting points for reuse:

- `src/gpu.ts`: GPU simulation and network interface.
- `src/data.ts`: dataset loading, hashes and structural validation.
- `src/scene.ts`: externally driven visual component.
- `src/sound.ts`: activity-to-sound mapping.
- `tests/reference-core.ts`: small CPU reference for deterministic two-cell fixtures, not an equivalent implementation of the full GPU input scheduler.

Controls allow silencing individual cells, muting the whole network and disconnecting synapses. These are debugging/experimental operations, not validated predictions of interventions in living flies. Event logs are bounded to 2,000 control events; truncated logs are marked and cannot replay a session from the initial seed.

A scientific extension could compare dynamics against degree/weight-constrained randomized networks and timing-shuffled activity, before evaluating sound under several mappings. Those control experiments are not implemented or claimed by this release.
