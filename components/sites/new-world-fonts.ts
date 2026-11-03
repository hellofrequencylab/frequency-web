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
const instrument = localFont({ src: '../../app/fonts/instrument-serif/instrument-serif-italic.woff2', variable: '--font-nw-instrument', weight: '400', style: 'italic', display: 'swap', preload: false })

/** The class that sets the three `--font-nw-*` variables; put it on the New World site root. */
export const NEW_WORLD_FONT_CLASS = [unbounded, hanken, instrument].map((f) => f.variable).join(' ')
