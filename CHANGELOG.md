# Changelog

Notable changes follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
structure. Versions follow Semantic Versioning for this application, not for the
scientific model.

## [2.6.0] - 2026-10-12

### Added

- Validated settings links, including exact FlyWire neuron IDs; sound remains opt-in.
- SHA-pinned GitHub Actions CI, synthetic browser coverage, Dependabot and contribution templates.
- Localized, plain-language errors with separate technical details.
- Contribution, security, community, release and audit-decision documentation.

### Fixed

- Reset now restores all model/view controls, including colour, quality and motion.
- Narrow-screen drawers no longer cover the wrapped header controls.
- Language selector's accessible name follows the selected language.
- Dataset downloads and local verification use bounded-memory streaming; invalid
  downloads never replace an existing file.

### Changed

- Formatted source in a standalone, blame-ignored commit; added formatting/lint gates.
- Extracted resettable state, sensory inputs, UI markup, inspector and event log.
- Kept diagnostics publicly available as immutable snapshots.
- Split Three.js from application code; retained the production GitHub link.
- Preserved the full dataset, GPU equations, integration step and sound synthesis.

## [2.5.1] - 2026-10-11

### Added

- First public repository release with English-default UI, optional Finnish,
  MIT-licensed application code and separate CC BY 4.0 data notices.
- Pinned dataset setup and verification tools, full-network browser/GPU checks.

This entry describes the first GitHub publication, not a reconstruction of all
pre-publication artwork revisions.

[2.6.0]: https://github.com/Resnais-Beefhair/brain-concert/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/Resnais-Beefhair/brain-concert/tree/v2.5.1
