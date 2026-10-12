# Verification

## Fast checks

```sh
npm ci
npm run data:fetch
npm run data:verify
npm test
npm run test:data
npm run build
```

## Browser and GPU checks

Install the Playwright Chromium browser once (`npx playwright install chromium`), or set `CHROME_PATH` to an existing compatible Chromium executable. Start `npm run dev` in another terminal, then:

```sh
npm run test:browser
npm run test:gpu
```

Set `REVIEW_URL` if the development server is not at `http://127.0.0.1:5173/`. The GPU test page is development-only and is not part of the production build. The two-cell synthetic fixtures run first, followed by the full network; no smaller graph is substituted into the artwork.

The test tools launch isolated headless Chromium with **software WebGPU (SwiftShader)** test flags. These are not recommendations for changing your regular browser. Passing tests do not establish hardware performance, mobile compatibility or real-time speed.

The browser check covers English startup even with Finnish browser locale, muted autostart, graph counts, actual spikes, controls, language persistence, and the unsupported-WebGPU explanation without downloading data. GPU checks cover CPU reference agreement, signed excitation/inhibition, reset determinism, batch invariance, disconnected inputs, global and individual silence, and uint32 clock crossing.

Evidence is written to `evidence/` (ignored by Git). Processes close their test browser in `finally`; stop your development server when finished. Recording quality and physical-device performance require manual testing.

`npm run test:data` exercises a local HTTP mirror: missing files, corrupt downloads, clean installation, verification, local corruption and repair. It requires the prepared dataset but no internet connection.

## Automated checks without scientific data

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:ci-browser
```

The browser harness starts and closes its own Vite server and Chromium in `finally`.
It intercepts dataset requests with a 16-cell synthetic fixture **only inside the
test browser**. It exercises missing WebGPU, localized data failures, reset, settings
links, exact neuron IDs, translated accessible labels, read-only diagnostics and
JSON export. Screenshots and result JSON go to `evidence/ci-browser/`; CI uploads
that directory even on failure. No synthetic dataset goes into a public build.
