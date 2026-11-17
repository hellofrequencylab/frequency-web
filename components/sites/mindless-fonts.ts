import localFont from 'next/font/local'

// THE MINDLESS FACES, loaded ONLY on a Mindless website (components/sites/site-page.tsx) and its Spotlight, never from the root layout
// (a face registered in app/layout.tsx rides every route, DEPLOY-SAFETY). Rubik Wet Paint is the drip display, Archivo does everything
// else including the tracked caps (lib/theme/mindless.ts --ml-font-*). Both are SIL OFL 1.1. next/font self-hosts the files and sets the
// `--font-ml-*` variables on the site root through MINDLESS_FONT_CLASS. Pieces NFI, the logotype face, is not a web font here: the
// wordmark ships as the design's own SVG. Not imported by components/sites/site-chrome.tsx, which the suite renders.

const paint = localFont({ src: '../../app/fonts/rubik-wet-paint/rubik-wet-paint-400.woff2', variable: '--font-ml-paint', weight: '400', display: 'swap', preload: false })
const archivo = localFont({
  src: [
    { path: '../../app/fonts/archivo/archivo-400.woff2', weight: '400', style: 'normal' },
    { path: '../../app/fonts/archivo/archivo-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-ml-archivo',
  display: 'swap',
  preload: false,
})

/** The class that sets the two `--font-ml-*` variables; put it on the Mindless site root. */
export const MINDLESS_FONT_CLASS = [paint, archivo].map((f) => f.variable).join(' ')
