# DAWN assets — where the heavy files live

This folder vendors the DAWN design system's **structural** files (components, guideline
cards, tokens, ui_kits, templates, badge SVGs, manifest) so every session and every clone
has the reference set. The **photography library** (`assets/images/`, ~44 MB) and the
`uploads/` scratch (~21 MB) are deliberately NOT in git — `main` should not carry 65 MB of
reference JPEGs in every clone.

## Where the full export lives

The complete project export (everything in this folder PLUS the photography) is a release
asset on this repo:

- **Release:** https://github.com/hellofrequencylab/frequency-web/releases/tag/DAWN
- **Asset:** `DAWN.Frequency.Design.System-handoff.zip` (2026-08-03 export, 71 MB)
- **sha256:** `0a5be0dc11d25ad0d44e6348c902e90341f6e811e68c0cb59716c08998ab8d18`

Fetch + verify:

```bash
curl -sSL -o dawn.zip \
  "https://github.com/hellofrequencylab/frequency-web/releases/download/DAWN/DAWN.Frequency.Design.System-handoff.zip"
sha256sum dawn.zip   # must match the digest above
unzip dawn.zip       # photography under dawn-frequency-design-system/project/assets/images/
```

## When a page adopts a photo

Copy that specific image out of the release zip into `public/images/site/` (the SYNC.md
mapping) in the adopting PR — the shipped set stays curated, the library stays in the
release. When DAWN publishes a NEW export, upload it as a new asset on the same release
(or a new tag), update the digest here, and refresh this folder from the new zip's
structural files.
