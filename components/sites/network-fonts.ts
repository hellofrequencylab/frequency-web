import { Bricolage_Grotesque, Instrument_Serif, Outfit } from 'next/font/google'

// THE NETWORK FACES, loaded ONLY on a Network website (components/sites/site-page.tsx), never from the root
// layout: a face registered in app/layout.tsx rides every route (DEPLOY-SAFETY, SCAN-676), and these three
// are worn by one theme. next/font self-hosts them and sets the `--font-nw-*` variables on the site root
// through NETWORK_FONT_CLASS; the theme's token block (lib/theme/network.ts) reads those with the named faces
// as fallbacks, so the editor canvas and a test render fall back to system faces. The signature face, Caveat,
// is already on the root layout (`--font-caveat`), so the theme reads that one rather than a second copy.
//
// Bricolage Grotesque is the display face (700 to 800, the optical size axis on), Outfit the body and UI,
// Instrument Serif italic the one-word voice inside a headline, Caveat a signature line only.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's
// compiler, so the class is applied one level up, on the site page.

const bricolage = Bricolage_Grotesque({ variable: '--font-nw-bricolage', subsets: ['latin'], weight: 'variable', axes: ['opsz'], display: 'swap', preload: false })
const outfit = Outfit({ variable: '--font-nw-outfit', subsets: ['latin'], weight: 'variable', display: 'swap', preload: false })
const instrument = Instrument_Serif({ variable: '--font-nw-instrument', subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap', preload: false })

/** The class that sets the three `--font-nw-*` variables; put it on the Network site root. */
export const NETWORK_FONT_CLASS = [bricolage, outfit, instrument].map((f) => f.variable).join(' ')
