# Brain Concert — Credits

**Concept:** Miku, Skädä's sonification idea, Sirpa. Implementation: Sirpa, 2026. No third-party audio samples, images or fonts. Artwork, interface and procedural audio are project work. Original application code and documentation: MIT, copyright 2026 Resnais-Beefhair and contributors. See `LICENSE` in the source repository or `licenses/brain-concert-MIT.txt` in the built site. Data and third-party components retain their separate licenses below.

## Data

- FlyWire Consortium, Dorkenwald et al. (2024), *Neuronal wiring diagram of an adult brain*. https://doi.org/10.1038/s41586-024-07558-y
- FlyWire Whole-brain Connectome Connectivity Data, https://doi.org/10.5281/zenodo.10676866 — CC BY 4.0, verified in the preceding project on 2026-10-03.
- Shiu et al. (2024), *A Drosophila computational brain model reveals sensorimotor processing*. https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/
- Philip Shiu & Nico Spiller, Drosophila_brain_model, commit `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`. https://github.com/philshiu/Drosophila_brain_model — MIT, original notice in public/licenses/brain-model-MIT.txt.
- Philipp Schlegel et al. (2024), *Whole-brain annotation and multi-connectome cell typing of Drosophila*, https://doi.org/10.1038/s41586-024-07686-5. Archived Supplementary Data 1 (`41586_2024_7686_MOESM5_ESM.tsv`), https://media.springernature.com/original/springer-static/esm/art%3A10.1038%2Fs41586-024-07686-5/MediaObjects/41586_2024_7686_MOESM5_ESM.tsv — CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . The article's open-access notice covers its supplementary material without a separate exclusion for this table.

**Public-release provenance:** the public demo uses the archived 2024 supplement, not the later annotation repository revisions used in the initial private preview. We select computational IDs, transform coordinates, choose display labels, and derive visual/olfactory input masks. Source digest is recorded in `data/manifest.json`. All 138,639 model neurons have matching anchors in this source; the visual sensory mask contains 10,855 cells. Connectivity arrays are unchanged. These annotations remain CC BY 4.0, separate from the application's MIT license.

## Adaptation

All 138,639 computational neuron IDs and all 15,091,983 connection rows are retained, representing 54,492,922 synapses. Signed integer synapse counts accumulate exactly within the model's bounded per-step range; delivered input is scaled by 0.275. LIF state uses float32 WebGPU arithmetic and 0.2 ms integration. External inputs use deterministic seeded Bernoulli trials instead of the preceding version's exponential event scheduler. This is a computational adaptation, not a validated whole-brain behavioural replica.

All model cells are computed. All cells have matching anatomical anchors in the archived source. Anchor coordinates are transformed from 4 × 4 × 40 nm voxels, preserving anisotropic physical scale. Visual transmission paths and timing are artistic, not anatomical axon trajectories or measured conduction speed.

Sensory populations: the original notebook-defined taste and mechanosensory seeds are preserved; visual and olfactory cells are selected only where annotations specify `flow=afferent`, `super_class=sensory`, and the corresponding cell_class. No cell class is silently invented. Source IDs and file hashes are in `data/manifest.json`.

## Software

three.js — MIT, three.js authors. @noble/hashes — MIT, Paul Miller. See `public/licenses/` (or `licenses/` in the built site). Development uses TypeScript, Vite, Vitest and Playwright; exact versions in package-lock.json. The finished site has no third-party runtime requests, remote compute service, analytics, external fonts or audio library.
