import localFont from 'next/font/local'

// THE TEMPLE FACES, loaded ONLY on a Temple website (components/sites/site-page.tsx), never from the root
// layout: a face registered in app/layout.tsx rides every route (DEPLOY-SAFETY, SCAN-676), and these four are
// worn by one theme. next/font self-hosts them and sets the `--font-tp-*` variables on the site root through
// TEMPLE_FONT_CLASS; the theme's token block (lib/theme/temple.ts) reads those with the named faces as
// fallbacks, so the editor canvas and a test render fall back to Marcellus and Georgia.
//
// Branch is the house's own display face (supplied by Royal Temple): wordmark, numerals and short display
// lines. Marcellus carries titles, Jost 300 to 500 the body and UI, Cormorant Garamond italic the quotes.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's
// compiler, so the class is applied one level up, on the site page.

const branch = localFont({ src: '../../app/fonts/temple/branch.woff2', variable: '--font-tp-branch', weight: '400', display: 'swap', preload: false })
const marcellus = localFont({ src: '../../app/fonts/temple/marcellus.woff2', variable: '--font-tp-marcellus', weight: '400', display: 'swap', preload: false })
const jost = localFont({ src: '../../app/fonts/temple/jost.woff2', variable: '--font-tp-jost', weight: '100 900', display: 'swap', preload: false })
const cormorant = localFont({
  src: '../../app/fonts/temple/cormorant-garamond-italic.woff2',
  variable: '--font-tp-cormorant',
  weight: '300 700',
  style: 'italic',
  display: 'swap',
  preload: false,
})

/** The class that sets the four `--font-tp-*` variables; put it on the Temple site root. */
export const TEMPLE_FONT_CLASS = [branch, marcellus, jost, cormorant].map((f) => f.variable).join(' ')
