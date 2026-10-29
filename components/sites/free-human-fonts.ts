import localFont from 'next/font/local'

// THE FREE HUMAN FACES, loaded ONLY on a Free Human website (components/sites/site-page.tsx), never from the root
// layout: a face registered in app/layout.tsx rides every route (DEPLOY-SAFETY, SCAN-676), and these three are worn
// by one theme. next/font self-hosts them and sets the `--font-fh-*` variables on the site root through
// FREE_HUMAN_FONT_CLASS; the theme's token block (lib/theme/free-human.ts) reads those with the named faces as
// fallbacks, so the editor canvas and a test render fall back to Cormorant Garamond's named stack and Georgia.
//
// Cormorant Garamond carries the display (500 upright) and the sung line (400 italic), Marcellus the inscriptional
// caps (eyebrows, badges) and Hanken Grotesk the body and UI. Marcellus and Hanken are the files Temple and
// Wildheart already ship; only the upright and italic Cormorant (latin subset, OFL) are the kit's own.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's
// compiler, so the class is applied one level up, on the site page.

const cormorant = localFont({
  src: [
    { path: '../../app/fonts/free-human/cormorant-garamond.woff2', weight: '300 700', style: 'normal' },
    { path: '../../app/fonts/free-human/cormorant-garamond-italic.woff2', weight: '300 700', style: 'italic' },
  ],
  variable: '--font-fh-cormorant',
  display: 'swap',
  preload: false,
})
const marcellus = localFont({ src: '../../app/fonts/temple/marcellus.woff2', variable: '--font-fh-marcellus', weight: '400', display: 'swap', preload: false })
const hanken = localFont({ src: '../../app/fonts/hanken-grotesk/hanken-grotesk.woff2', variable: '--font-fh-hanken', weight: '100 900', display: 'swap', preload: false })

/** The class that sets the three `--font-fh-*` variables; put it on the Free Human site root. */
export const FREE_HUMAN_FONT_CLASS = [cormorant, marcellus, hanken].map((f) => f.variable).join(' ')
