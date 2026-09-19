# Liberation Sans

`LiberationSans-Bold.ttf` is part of the **Liberation™ Fonts** family, licensed
under the **SIL Open Font License, Version 1.1**.

- Copyright © Red Hat, Inc., with Reserved Font Name "Liberation".
- License: https://scripts.sil.org/OFL
- Project: https://github.com/liberationfonts/liberation-fonts

It is metric-compatible with Arial Bold and is the disk fallback
`lib/og/load-nunito.ts` opens beside the Nunito pair for Open Graph share cards.
`LiberationSans-Regular.ttf` left with the flyer builder (LIVE-216). Do not put
it back, and do not remove Bold from `OG_CARD_FONTS`.

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
