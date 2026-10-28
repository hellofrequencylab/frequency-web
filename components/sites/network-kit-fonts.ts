import { Bricolage_Grotesque, Outfit, Instrument_Serif, Caveat } from 'next/font/google'

// THE NETWORK THEME KIT FACES. Loaded ONLY on a Network Theme Kit website (components/sites/site-page.tsx, wired with
// the kit's render), never from the root layout: a face registered in app/layout.tsx rides every route
// (DEPLOY-SAFETY, SCAN-676), and these four are worn by one theme. next/font self-hosts them and sets the
// `--font-nk-*` variables on the site root through NETWORK_KIT_FONT_CLASS; the token block
// (lib/theme/network-kit.ts) reads those with the named faces as fallbacks, so the editor canvas and a test render
// fall back to system faces. They are a different set of variables from the earlier Network theme's `--font-nw-*`, so
// the two themes never share or shadow a face.
//
// ONE TYPE SYSTEM for all thirteen profiles (Daniel's ruling): Bricolage Grotesque (the variable file, the optical size
// axis on; the kit sets it at 700 to 800) for display, Outfit 300 to 700 for body and labels, Instrument Serif italic for the one-word voice inside a
// headline, Caveat 600 to 700 for a signature line only. The per-profile pairs in the design's tokens/kits.css are
// not loaded.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's compiler, so
// the class is applied one level up, on the site page.

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: 'variable', axes: ['opsz'], variable: '--font-nk-bricolage', display: 'swap', preload: false })
const outfit = Outfit({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-nk-outfit', display: 'swap', preload: false })
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: 'italic', variable: '--font-nk-instrument', display: 'swap', preload: false })
const caveat = Caveat({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-nk-caveat', display: 'swap', preload: false })

/** The class that sets the four `--font-nk-*` variables; put it on the Network Theme Kit site root. */
export const NETWORK_KIT_FONT_CLASS = [bricolage, outfit, instrument, caveat].map((f) => f.variable).join(' ')
