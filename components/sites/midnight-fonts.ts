import { Bodoni_Moda, Marcellus, Geist } from 'next/font/google'

// THE MIDNIGHT FACES. Drop-in at components/sites/midnight-fonts.ts. Loaded ONLY on a Midnight website
// (components/sites/site-page.tsx), never from app/layout.tsx, following components/sites/temple-fonts.ts.
// next/font self-hosts them and sets the --font-mn-* variables on the site root through MIDNIGHT_FONT_CLASS;
// lib/theme/midnight.ts reads those with the named faces as fallbacks.
//
// Bodoni Moda carries display lines and numerals, roman and italic. Marcellus carries every label: eyebrows,
// buttons, badges, index numbers. Geist carries body and UI.
//
// ⛔ Not imported by components/sites/site-chrome.tsx, which the suite renders: next/font needs Next's
// compiler, so the class is applied one level up, on the site page.

const bodoni = Bodoni_Moda({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-mn-bodoni', display: 'swap', preload: false })
const marcellus = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-mn-marcellus', display: 'swap', preload: false })
const geist = Geist({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-mn-geist', display: 'swap', preload: false })

/** The class that sets the three --font-mn-* variables; put it on the Midnight site root. */
export const MIDNIGHT_FONT_CLASS = [bodoni, marcellus, geist].map((f) => f.variable).join(' ')
