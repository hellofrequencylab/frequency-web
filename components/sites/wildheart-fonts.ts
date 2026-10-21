import localFont from 'next/font/local'

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

const garamond = localFont({
  src: [
    { path: '../../app/fonts/eb-garamond/eb-garamond.woff2', weight: '400 800', style: 'normal' },
    { path: '../../app/fonts/eb-garamond/eb-garamond-italic.woff2', weight: '400 800', style: 'italic' },
  ],
  variable: '--font-wh-garamond',
  display: 'swap',
  preload: false,
})
const hanken = localFont({ src: '../../app/fonts/hanken-grotesk/hanken-grotesk.woff2', variable: '--font-wh-hanken', weight: '100 900', display: 'swap', preload: false })
const symbols = localFont({ src: '../../app/fonts/noto-sans-symbols/noto-sans-symbols.woff2', variable: '--font-wh-symbols', weight: '100 900', display: 'swap', preload: false })

/** The class that sets the four `--font-wh-*` variables; put it on the Wildheart site root. */
export const WILDHEART_FONT_CLASS = [fell, garamond, hanken, symbols].map((f) => f.variable).join(' ')
