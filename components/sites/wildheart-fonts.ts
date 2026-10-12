import localFont from 'next/font/local'
import { EB_Garamond, Hanken_Grotesk, Noto_Sans_Symbols } from 'next/font/google'

// THE WILDHEART FACES, loaded ONLY on a Wildheart website (components/sites/site-page.tsx), never from the
// root layout: a face registered in app/layout.tsx rides every route (DEPLOY-SAFETY, SCAN-676), and these
// four are worn by one theme. next/font self-hosts them and sets the `--font-wh-*` variables on the site
// root through WILDHEART_FONT_CLASS; the theme's token block (lib/theme/wildheart.ts) reads those with the
// named faces as fallbacks, so the editor canvas and a test render fall back to Georgia and system faces.
//
// IM Fell English is the owner's own files (public/fonts/wildheart/, from the design handoff), regular and
// italic at 400: the display face is never bold. EB Garamond is the body, Hanken Grotesk the labels and
// controls, Noto Sans Symbols the one family every zodiac, alchemical and festival glyph is drawn in.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's
// compiler, so the class is applied one level up, on the site page.

const fell = localFont({
  src: [
    { path: '../../public/fonts/wildheart/IMFellEnglish-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/wildheart/IMFellEnglish-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-wh-fell',
  display: 'swap',
  preload: false,
})

const garamond = EB_Garamond({ variable: '--font-wh-garamond', subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], display: 'swap', preload: false })
const hanken = Hanken_Grotesk({ variable: '--font-wh-hanken', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', preload: false })
const symbols = Noto_Sans_Symbols({ variable: '--font-wh-symbols', subsets: ['latin'], weight: ['300', '400'], display: 'swap', preload: false })

/** The class that sets the four `--font-wh-*` variables; put it on the Wildheart site root. */
export const WILDHEART_FONT_CLASS = [fell, garamond, hanken, symbols].map((f) => f.variable).join(' ')
