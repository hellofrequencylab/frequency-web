# Nunito

`Nunito-Bold.ttf` (700) is from the **Nunito** family,
licensed under the **SIL Open Font License, Version 1.1**.

- Copyright © The Nunito Project Authors (https://github.com/googlefonts/nunito).
- License: https://scripts.sil.org/OFL

The full TrueType face is bundled as the Stage share cards' glyph fallback, read locally by
`lib/og/load-stage-fonts.ts`. `stage-fonts.test.ts` checks its TrueType header and bundled path.
The unused Nunito Black and Liberation Sans Bold faces left with the retired loader.

---

# Sofia Sans Extra Condensed and Barlow

`SofiaSansExtraCondensed-ExtraBold.ttf` (800) and `Barlow-Medium.ttf` (500) are the Menswork
theme's display and body faces, both licensed under the **SIL Open Font License, Version 1.1**.

- Sofia Sans: Copyright © The Sofia Sans Project Authors (https://github.com/lettersoup/Sofia-Sans).
- Barlow: Copyright © The Barlow Project Authors (https://github.com/jpt/barlow).
- License: https://scripts.sil.org/OFL

`lib/og/load-menswork-fonts.ts` opens them for the Menswork website share card (LIVE-870) only.

---

# Stage share-card faces (`public/fonts/stage/`)

`Unbounded-Bold.ttf`, `HankenGrotesk-Medium.ttf`, `HankenGrotesk-Bold.ttf` and
`InstrumentSerif-Italic.ttf` are from the **Unbounded**, **Hanken Grotesk** and **Instrument Serif**
families, licensed under the **SIL Open Font License, Version 1.1** (https://scripts.sil.org/OFL).

They are the Latin subsets the app already ships under `app/fonts/*.woff2`, converted to plain
TrueType (Satori cannot parse WOFF2) and cut to one weight each (Satori draws a variable font at its
default instance only). `lib/og/load-stage-fonts.ts` opens them for every share card.
