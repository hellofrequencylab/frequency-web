// FREQUENCY's own faces (ADR-1737). Registered here, never in app/layout.tsx, so a DAWN deploy never
// imports this module and never ships a byte of them: app/layout.tsx reads ./active, and only a build with
// NEXT_PUBLIC_SITE_DESIGN=frequency points ./active at this file (scripts/write-design-assets.mjs).
//
// STATUS: empty until the Frequency export lands. The kit names Instrument Serif for display. To add it:
//
//   import { Instrument_Serif } from 'next/font/google'
//   const instrumentSerif = Instrument_Serif({
//     variable: '--font-instrument-serif', subsets: ['latin'], weight: '400', style: ['normal', 'italic'],
//     display: 'swap',
//   })
//   export const DESIGN_FONT_CLASS = [instrumentSerif].map((f) => f.variable).join(' ')
//
// then point the design layer at it in app/themes/frequency.css:
//   :root[data-design="frequency"] { --design-font-display: var(--font-instrument-serif); }
//
// Rules: a module-scope `const` per face (next/font requires it); `preload: false` on any face only
// some routes draw (a preloaded face rides every route's <head>, SCAN-676); and a `variable` name that
// no DAWN face already uses.
import type { DesignId } from '../design'

export const FONTS_DESIGN: DesignId = 'frequency'

/** The next/font `variable` classes this design adds to <html>, beyond DAWN's base faces. */
export const DESIGN_FONT_CLASS = ''
