# Dataset setup and provenance

## Pinned browser artifacts

`data/manifest.json` is the versioned source of truth: artifact sizes, SHA-256 hashes, source commit, upstream hashes, graph counts and coordinate transform. The setup tool never trusts a manifest downloaded from the mirror.

```sh
npm run data:fetch
npm run data:verify
```

The default mirror is `https://koodio.fi/demot/aivokonsertti/data/`. An alternative mirror can be supplied with the `DATA_BASE_URL` environment variable (a directory URL ending in `/`). `DATA_OUTPUT_DIR` changes the destination. Run `node tools/fetch-data.mjs --verify-only` to reject missing or corrupt data without downloading anything.

Files are verified before replacing a local artifact. If a mirror later changes its data, setup fails instead of silently accepting a new dataset. The current demo URL is not an immutable archival host; if it becomes unavailable, use an alternative mirror with the same verified artifacts or rebuild from the pinned upstream sources below.

All six payloads total 132,274,764 uncompressed bytes. They remain outside Git history; so do raw upstream files, build products and evidence captures.

## Rebuild from upstream data

Inputs:

1. `Completeness_783.csv` and `Connectivity_783.parquet` from [Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) at commit `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`. Obtain the actual data files, not Git LFS pointer text, if using an LFS checkout.
2. The [archived Schlegel et al. 2024 supplementary annotation table](https://media.springernature.com/original/springer-static/esm/art%3A10.1038%2Fs41586-024-07686-5/MediaObjects/41586_2024_7686_MOESM5_ESM.tsv), saved as a TSV file.
3. The small `data/sensory-seeds.json` in this repository. It preserves the existing notebook-derived taste and vibration populations as string IDs, extracted from the pinned input mask. Visual and olfactory populations are selected from the annotation table.

Use Python 3.11 or newer in a virtual environment, install `requirements-data.txt`, then:

```sh
python tools/prepare_full.py --raw-dir data-source/model --annotations data-source/annotations-2024.tsv
npm run data:verify
```

The converter rejects incorrect connectivity and annotation source hashes before processing. It preserves neuron order and string IDs, uses stable source-sorted CSR edges, writes exact signed integer weights, and transforms 4 × 4 × 40 nm voxels using the pinned anatomical transform. It checks **every output artifact** against the published manifest, so different input ordering or labels cannot pass unnoticed. `--output` can select a separate staging directory.

## Binary layout

- `offsets.bin`: little-endian uint32, neuron count + 1 CSR row offsets.
- `targets.bin`: little-endian uint32, target indices per directed edge row.
- `weights.bin`: little-endian int32, signed synapse counts; simulation scales delivery by 0.275.
- `inputs.bin`: little-endian uint32 sensory bitmask: taste 1, vibration 2, light 4, scent 8.
- `positions.bin`: little-endian float32, four values per neuron: x, y, z, valid-anchor flag.
- `metadata.json`: string IDs, labels, classes, transmitters and sides.

Counts: 138,639 neurons; 15,091,983 connection rows; 54,492,922 synapses represented. Every model neuron has an anchor in this archived annotation source. The larger annotation atlas is not the model population.

See [credits](../CREDITS.md) for scientific citations and licenses. This transformation changes representation, coordinates and display labels; it does not reconstruct axon trajectories.
