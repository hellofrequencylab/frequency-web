import { Archivo, Cormorant_Garamond, Grenze_Gotisch } from 'next/font/google'

// THE AIDEN TYACK FACES (the handoff's fonts.json), loaded ONLY on an Aiden Tyack website (components/sites/site-page.tsx), never from
// app/layout.tsx (a face registered there rides every route, DEPLOY-SAFETY). All three are SIL OFL 1.1; next/font self-hosts them and
// sets the --font-at-* variables on the site root through AIDEN_TYACK_FONT_CLASS. lib/theme/aiden-tyack.ts reads those with the named
// faces as fallbacks. Grenze Gotisch 700 is the display (Title Case, 28px and up), Archivo carries body, buttons, labels and numbers,
// Cormorant Garamond italic is the voice (one aside per section).
//
// Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's compiler.

const display = Grenze_Gotisch({ subsets: ['latin'], weight: ['700'], variable: '--font-at-display', display: 'swap', preload: false })
const body = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-at-body', display: 'swap', preload: false })
const voice = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500'], style: ['italic'], variable: '--font-at-voice', display: 'swap', preload: false })

/** The class that sets the three --font-at-* variables; put it on the Aiden Tyack site root. */
export const AIDEN_TYACK_FONT_CLASS = [display, body, voice].map((f) => f.variable).join(' ')
