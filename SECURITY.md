# Security policy

## Supported versions

Security fixes target the latest tagged release on `main`. Earlier versions are
not maintained as separate release branches.

## Private reports

Use [GitHub private vulnerability reporting](https://github.com/Resnais-Beefhair/brain-concert/security/advisories/new).
Private reporting is enabled for this repository. Do not post exploit details,
credentials or private data in public issues. Describe a minimal reproduction,
affected version and browser, and expected impact. No response-time guarantee is made.

## Scope

This is a static browser application. Relevant areas include unsafe rendering,
malicious dependency changes, corrupted dataset delivery, and resource misuse.
The app has no account system or telemetry backend. Diagnostic snapshots stay in
the browser; nothing is submitted automatically. A settings link includes chosen
settings and an optional public FlyWire ID, never audio consent or simulation state.

Artifacts are verified with size and SHA-256 checks. The command-line downloader
uses a pinned, versioned manifest; the browser trusts the manifest served by the
site. These checks catch corruption, not a compromise of the entire origin and
its manifest. Scientific/model validity is separate from security.
