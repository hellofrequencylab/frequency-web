// FREQUENCY's own faces (ADR-1737, ADR-1740). Registered here, never in app/layout.tsx, so a DAWN deploy
// never imports this module and never ships a byte of them: app/layout.tsx reads ./active, and only a build
// with NEXT_PUBLIC_SITE_DESIGN=frequency points ./active at this file (scripts/write-design-assets.mjs).
//
// The export's type (design_handoff/frequency/tokens/typography.css): Unbounded for display (400-800),
// Instrument Serif italic for the "temple voice", Hanken Grotesk for UI and body (400-700). The alias layer
// (app/themes/frequency.css) points --fq-font-display / -serif / -sans at these variables.
import { Hanken_Grotesk, Instrument_Serif, Unbounded } from 'next/font/google'
import type { DesignId } from '../design'

export const FONTS_DESIGN: DesignId = 'frequency'

const unbounded = Unbounded({
  variable: '--font-unbounded',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  // Only the italic accents draw it; keep it off every route's preload list (SCAN-676).
  preload: false,
})
const hanken = Hanken_Grotesk({
  variable: '--font-hanken',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

/** The next/font `variable` classes this design adds to <html>, beyond DAWN's base faces. */
export const DESIGN_FONT_CLASS = [unbounded, instrumentSerif, hanken].map((f) => f.variable).join(' ')
