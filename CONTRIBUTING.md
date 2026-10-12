# Contributing

Use Node.js **22.20+ (22.x) or 24.12+** and npm. `nvm use` selects the maintained Node 22 line;
`engine-strict` rejects older runtimes. Install with `npm ci`.

Before submitting a change:

```sh
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:ci-browser
```

Install the test browser first with `npx playwright install chromium`.
The CI browser harness owns its server and browser lifecycle and uses an intercepted,
synthetic dataset. It does not download the scientific dataset or substitute that
fixture into a published build.

For simulation, data, rendering or audio changes, also fetch and verify the full
dataset and run the relevant [browser/GPU checks](docs/TESTING.md).
See [data provenance](docs/DATA.md) before changing any artifacts or model claims.
Never commit datasets, credentials, local paths, builds or evidence captures.

Keep changes focused. New validation needs both valid and invalid-path checks.
Translations and external data go into `textContent` or DOM properties, never into
`innerHTML`. The only HTML strings are trusted bundled markup and the numerical
loader illustration. Keep Finnish and English translation keys in sync.

Formatting-only history is listed in `.git-blame-ignore-revs`. Enable it locally:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

Use issues for bugs and focused feature proposals; Discussions remains disabled
until there is a concrete community need. Security reports must use the
[private reporting route](SECURITY.md). Please follow the [community guidelines](CODE_OF_CONDUCT.md).
