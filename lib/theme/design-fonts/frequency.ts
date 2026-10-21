// FREQUENCY's own faces (ADR-1737, ADR-1740). Registered here, never in app/layout.tsx, so a DAWN deploy
// never imports this module and never ships a byte of them: app/layout.tsx reads ./active, and only a build
// with NEXT_PUBLIC_SITE_DESIGN=frequency points ./active at this file (scripts/write-design-assets.mjs).
//
// The export's type (design_handoff/frequency/tokens/typography.css): Unbounded for display (400-800),
// Instrument Serif italic for the "temple voice", Hanken Grotesk for UI and body (400-700). The alias layer
// (app/themes/frequency.css) points --fq-font-display / -serif / -sans at these variables.
import localFont from 'next/font/local'
import type { DesignId } from '../design'

// SELF-HOSTED (no build-time fetch from Google Fonts): the latin woff2 files of Google's Unbounded,
// Instrument_Serif and Hanken_Grotesk are committed under app/fonts/ and loaded with next/font/local, so a
// Google outage cannot fail a deploy (DEPLOY-SAFETY rule 9).
export const FONTS_DESIGN: DesignId = 'frequency'

const unbounded = localFont({
  src: '../../../app/fonts/unbounded/unbounded.woff2',
  variable: '--font-unbounded',
  weight: '200 900',
  display: 'swap',
})
const instrumentSerif = localFont({
  src: [
    { path: '../../../app/fonts/instrument-serif/instrument-serif.woff2', weight: '400', style: 'normal' },
    { path: '../../../app/fonts/instrument-serif/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
  // Only the italic accents draw it; keep it off every route's preload list (SCAN-676).
  preload: false,
})
const hanken = localFont({
  src: '../../../app/fonts/hanken-grotesk/hanken-grotesk.woff2',
  variable: '--font-hanken',
  weight: '100 900',
  display: 'swap',
})

/** The next/font `variable` classes this design adds to <html>, beyond DAWN's base faces. */
export const DESIGN_FONT_CLASS = [unbounded, instrumentSerif, hanken].map((f) => f.variable).join(' ')
