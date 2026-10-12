## Brain Concert 2.6.0

- Share validated settings links, including an exact FlyWire neuron ID. Sound stays off.
- Reset restores all experiment/view settings, including colour, quality and motion.
- Plain-language English/Finnish error messages and translated language-selector labels.
- Formatted, linted source, automatic CI and synthetic browser tests, documented diagnostics.
- Streaming dataset setup, release checksums, contribution/security guidance and issue templates.

The full graph, neural equations and sound synthesis are unchanged. This is not new
biological validation. Sampled networks and randomized-control experiments remain
separate work; see the audit decision document.

The site archive excludes the scientific dataset. Extract it and run
`node setup-data.mjs` with Node.js 22.20+ (22.x) or 24.12+, then serve on localhost or trusted HTTPS.
The downloader verifies all payloads against the pinned manifest. Dataset licensing
remains CC BY 4.0; application code is MIT.
