import localFont from 'next/font/local'

// THE NEW WORLD FACES, loaded ONLY on a New World website (components/sites/site-page.tsx), never from the root layout (a face
// registered in app/layout.tsx rides every route, DEPLOY-SAFETY). next/font self-hosts them and sets the `--font-nw-*` variables on
// the site root through NEW_WORLD_FONT_CLASS. Unbounded speaks, Hanken Grotesk explains and Instrument Serif italic is the one soft
// phrase (the Frequency core set, lib/theme/new-world.ts). The skin (components/sites/new-world-css.ts) reads these with the named
// faces as fallbacks, so the editor canvas and a test render fall back to the named stacks.
//
// Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's compiler, so the class is
// applied one level up, on the site page.

const unbounded = localFont({ src: '../../app/fonts/unbounded/unbounded.woff2', variable: '--font-nw-unbounded', weight: '200 900', display: 'swap', preload: false })
const hanken = localFont({ src: '../../app/fonts/hanken-grotesk/hanken-grotesk.woff2', variable: '--font-nw-hanken', weight: '100 900', display: 'swap', preload: false })
// The upright cut is the Editorial Type voice's headline face (LIVE-2175, new-world-dials-css.ts); a browser fetches it only on a page that uses it.
const instrument = localFont({
  src: [
    { path: '../../app/fonts/instrument-serif/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
    { path: '../../app/fonts/instrument-serif/instrument-serif.woff2', weight: '400', style: 'normal' },
  ],
  variable: '--font-nw-instrument',
  display: 'swap',
  preload: false,
})

// The Detail pairing (Bricolage Grotesque, Lora, DM Mono; NEW_WORLD_DETAIL_CSS in lib/theme/new-world.ts) used to ask Google Fonts. These
// three self-host the same way, under `--font-nwd-*`, so the Look needs no third-party request (BLD-214).
const bricolage = localFont({ src: '../../app/fonts/bricolage-grotesque/bricolage-grotesque.woff2', variable: '--font-nwd-bricolage', weight: '200 800', display: 'swap', preload: false })
const lora = localFont({
  src: [
    { path: '../../app/fonts/lora/lora.woff2', weight: '400 700', style: 'normal' },
    { path: '../../app/fonts/lora/lora-italic.woff2', weight: '400 700', style: 'italic' },
  ],
  variable: '--font-nwd-lora',
  display: 'swap',
  preload: false,
})
const dmMono = localFont({
  src: [
    { path: '../../app/fonts/dm-mono/dm-mono-400.woff2', weight: '400' },
    { path: '../../app/fonts/dm-mono/dm-mono-500.woff2', weight: '500' },
  ],
  variable: '--font-nwd-mono',
  display: 'swap',
  preload: false,
})

/** The class that sets the three `--font-nw-*` variables and the three Detail `--font-nwd-*` ones; put it on the New World site root. */
export const NEW_WORLD_FONT_CLASS = [unbounded, hanken, instrument, bricolage, lora, dmMono].map((f) => f.variable).join(' ')
