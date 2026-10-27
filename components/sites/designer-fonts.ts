import { Cormorant, Jost } from 'next/font/google'

// THE DESIGNER FACES. Loaded ONLY on a Designer website (components/sites/site-page.tsx), never from
// app/layout.tsx, following midnight-fonts.ts. next/font self-hosts them and sets the --font-dz-* variables on
// the site root through DESIGNER_FONT_CLASS; lib/theme/designer.ts reads those with the named faces as fallbacks.
//
// Cormorant carries display lines, quotes and numerals, roman and italic. Jost carries body, UI and the tracked
// caps labels. Both stand in for the logo's faces until the brand supplies licensed files.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's compiler.

const cormorant = Cormorant({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-dz-cormorant', display: 'swap', preload: false })
const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-dz-jost', display: 'swap', preload: false })

/** The class that sets the two --font-dz-* variables; put it on the Designer site root. */
export const DESIGNER_FONT_CLASS = [cormorant, jost].map((f) => f.variable).join(' ')
