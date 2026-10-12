# Releasing

1. Update `package.json`, its lockfile, `CHANGELOG.md` and `docs/RELEASE-NOTES.md`.
2. Run formatting, lint, typecheck, unit and synthetic browser checks. With the
   verified full dataset, also run the browser and GPU release gates.
3. Commit and push; verify both CI jobs on the exact commit.
4. Create an annotated `v<package version>` tag. The tag-triggered workflow checks
   version equality, builds the app and creates a **draft** GitHub release. It can
   also be invoked manually with an existing tag. It does not deploy the website.
5. Download the built site and SHA256SUMS, check the checksum, contents and tagged
   version, then publish the draft. The site archive intentionally excludes dataset
   payloads; `node setup-data.mjs` installs pinned data beside the built site.
6. Deploy the tested site's hashed assets first and replace the index atomically,
   keeping the previous index/assets for rollback. Verify real HTTPS cold/warm startup,
   data integrity, mute by default, explicit sound, language and link behaviour.

No GitHub Pages deployment is added. The existing artwork host already serves the
full dataset with HTTPS and precompression; another site/data origin would add CORS,
cache and maintenance obligations without improving the artwork.

The repository defaults to English. Hosts that need the original browser-language
selection can build with `VITE_BROWSER_LANGUAGE=true`. Explicit saved language still
wins. Host-specific social metadata, data sidecars and HTTP configuration are not
part of the portable release and must be preserved during deployment.
