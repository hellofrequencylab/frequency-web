// DAWN's own faces (ADR-1737). DAWN is the BASE every design falls back to: a name another design's
// sheet leaves alone keeps DAWN's value, and several of those values read DAWN's faces (--design-font-*
// -> --font-nunito / --font-anton / --font-geist-mono, the Space font sets, the Spotlight faces). So
// DAWN's registrations stay where they have always been, in app/layout.tsx, on <html> for every design,
// and lib/theme/space-themes.test.ts keeps reading them there. This module adds nothing on top.
import type { DesignId } from '../design'

export const FONTS_DESIGN: DesignId = 'dawn'

/** The next/font `variable` classes this design adds to <html>, beyond DAWN's base faces. */
export const DESIGN_FONT_CLASS = ''
