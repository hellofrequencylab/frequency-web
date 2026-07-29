# Liberation Sans

`LiberationSans-Regular.ttf` and `LiberationSans-Bold.ttf` are part of the
**Liberation™ Fonts** family, licensed under the **SIL Open Font License, Version 1.1**.

- Copyright © Red Hat, Inc., with Reserved Font Name "Liberation".
- License: https://scripts.sil.org/OFL
- Project: https://github.com/liberationfonts/liberation-fonts

They are metric-compatible with Arial and are bundled here so the server can rasterize
the entry-point **flyer** (`lib/entry-points/flyer.ts`, ADR-126) to PNG with text — the
flyer's SVG targets the Arial/Helvetica metrics, so Liberation Sans matches exactly.

---

# Nunito

`Nunito-Bold.ttf` (700) and `Nunito-Black.ttf` (900) are from the **Nunito** family,
licensed under the **SIL Open Font License, Version 1.1**.

- Copyright © The Nunito Project Authors (https://github.com/googlefonts/nunito).
- License: https://scripts.sil.org/OFL

They are bundled so Satori can rasterize the Open Graph share cards (`lib/og/`) WITHOUT
a network fetch. They previously came from `fonts.googleapis.com` at render time, which
cost **~3.4 seconds per card** (a CSS request plus a TTF request, per weight, twice) and
made Apple Mail's link preview time out and fall back to an icon-only card while iMessage,
which waits longer, showed the full image. See `lib/og/load-nunito.ts`.

⚠️ These are **TrueType**, and they have to be. Google Fonts serves `woff` to a modern
browser User-Agent and `truetype` only when the request sends **no** User-Agent at all —
Satori cannot parse woff, so re-downloading these with a browser UA silently breaks every
share card. `lib/og/og-fonts.test.ts` checks the magic bytes for exactly that reason.
