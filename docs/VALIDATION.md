# Verification record

## Publication checks — 2026-10-11

- Original code and documentation licensed under MIT; data and third-party notices remain separate.
- `npm test`: all 6 unit tests passed.
- `npm run data:verify`: all 6 dataset payloads match the pinned sizes and SHA-256 hashes.
- `npm run test:data`: all 6 setup, corruption, rejection and repair checks passed; the temporary local mirror closed on completion.
- `npm run build`: TypeScript and production bundle passed, with the unchanged >500 kB chunk warning.
- Local Markdown links, package license metadata and the source/built-site license notices checked.
- Large data, dependencies and generated evidence remain outside the publication file set.

Publication changes are limited to licensing, repository metadata and documentation. Application behavior is unchanged; the browser/GPU checks below were not rerun for these documentation-only changes. The existing live artwork was not redeployed.

## Application and dataset verification — 2026-10-07

- Clean `npm ci`: passed, using this repository's own lockfile and dependencies.
- `npm test`: 6 tests passed (language selection, translation coverage and valid/invalid network structure).
- `npm run build`: TypeScript and production bundle passed. Vite reports the existing >500 kB application chunk warning; bundle splitting was not changed for this packaging task.
- `npm run data:verify`: all six dataset payloads match the pinned sizes and SHA-256 hashes.
- Fresh download from the default HTTPS artifact mirror: all six payloads verified.
- `npm run test:data`: six setup/failure/repair checks passed against a temporary local HTTP mirror.
- Raw-data conversion: all six generated artifacts match the pinned hashes byte for byte. Invalid annotation input was rejected before output creation.
- Browser interaction suite: passed on both the development server and built production site, including English default with Finnish browser locale, muted startup, full graph, spikes, controls and no-WebGPU fallback.
- GPU reference fixtures: all four signed-weight cases agreed with CPU spike counts and voltage/conductance tolerance.
- Full-network GPU checks: reset determinism, batch invariance, disconnect, global mute, individual silence, clock rollover and finite state passed.
- Visual review: English screenshot reviewed; included as `docs/preview.png`.

Browser and GPU checks used isolated headless Chromium and SwiftShader software rendering. They are correctness evidence, not a physical-GPU benchmark or a mobile compatibility certification. Recording was not revalidated in this localization/package pass; its implementation is unchanged.

Large data, dependencies, evidence and build products are ignored. A scoped scan of versioned text found no local machine paths, private network addresses or credential-pattern matches. This is not a formal security audit.

The original application and live deployment were not modified by this standalone packaging work.
