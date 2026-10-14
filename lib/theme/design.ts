// The DESIGN SYSTEM switch: the one setting that decides which design system the whole platform wears
// (ADR-1737). It sits ABOVE every other theme axis in docs/THEME.md:
//
//   design (dawn | frequency)      the platform's whole look, chosen at build time, one per deploy
//     └ mode (.dark)               light or dark, the member's choice
//     └ skin, generation,          the DAWN-era axes. Under DAWN they work as they always have. Under
//       occasion, Space font set,  Frequency they are switched OFF, because Frequency overrides
//       Theme Studio themes        everything (owner, 2026-10-13); a skin returns under Frequency only
//                                  when it is authored for it (SkinDef.designs).
//
// HOW IT APPLIES. app/layout.tsx stamps `data-design` on <html> from SITE_DESIGN. The root layout stays
// static (no cookie, no request read), so every prerendered page keeps prerendering and the first paint
// is already the right system. DAWN's tokens are the unscoped `:root` / `.dark` blocks in app/globals.css;
// every other design scopes its own tokens under `:root[data-design="<id>"]` in app/themes/<id>.css,
// which outranks the unscoped blocks without an !important anywhere.
//
// THE ONE BUTTON. `NEXT_PUBLIC_SITE_DESIGN` (Vercel env, or .env.local for a local build). Unset or
// unknown reads as DAWN, so a missing variable can never ship a half-built system.
//
// NO URL PREVIEW (SCAN-850). A `?design=` switch used to store a preview in localStorage and stamp it
// on <html>. A design's sheets load per design (app/themes/active/, written by
// scripts/write-design-assets.mjs), so on a Frequency build `?design=dawn` switched every Frequency rule
// off and left the visitor on an unstyled site on every later visit. The pre-paint script now only
// clears that stale key. To check a design, run it locally: `pnpm design:use <id>` and restart dev.

/**
 * Every design system the platform can wear. Add one = a CSS file in app/themes/, an entry here and a
 * font module in lib/theme/design-fonts/<id>.ts (OG cards draw in Nunito for every design, lib/og/load-nunito.ts). The manifest
 * colours and the active font module are written from SITE_DESIGN by scripts/write-design-assets.mjs.
 */
export type DesignId = 'dawn' | 'frequency'

interface DesignDef {
  id: DesignId
  /** Owner-facing name. */
  label: string
  /**
   * The browser-chrome colours (`<meta name="theme-color">`, the PWA manifest). These are set before any
   * CSS applies, so they cannot read a variable; each mirrors the design's canvas (light) and ink (dark).
   */
  chrome: { light: string; dark: string }
  /** Do the DAWN-era axes (skins, generations, occasions, Space font sets, Theme Studio) apply? */
  legacyAxes: boolean
}

export const DESIGNS: readonly DesignDef[] = [
  {
    id: 'dawn',
    label: 'DAWN',
    chrome: { light: '#FBFAF6', dark: '#16130E' }, // token-ok: browser chrome; set before CSS applies
    legacyAxes: true,
  },
  {
    id: 'frequency',
    label: 'Frequency',
    // Commons canvas (sand) and Commons-at-night canvas (Thermal), from the installed export (ADR-1740).
    chrome: { light: '#FAF4EA', dark: '#0E0B09' }, // token-ok: browser chrome; set before CSS applies
    legacyAxes: false,
  },
]

export const DEFAULT_DESIGN: DesignId = 'dawn'

/** The localStorage key the retired `?design=` preview wrote. The pre-paint script clears it (SCAN-850). */
export const DESIGN_PREVIEW_KEY = 'freq-design'

export function isDesignId(id: unknown): id is DesignId {
  return typeof id === 'string' && DESIGNS.some((d) => d.id === id)
}

export function resolveDesign(raw: string | null | undefined): DesignId {
  return isDesignId(raw) ? raw : DEFAULT_DESIGN
}

export function designDef(id: DesignId): DesignDef {
  return DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]
}

/** The design this deploy wears. Read once, at build (NEXT_PUBLIC_ is inlined), so it is static. */
export const SITE_DESIGN: DesignId = resolveDesign(process.env.NEXT_PUBLIC_SITE_DESIGN)

/** Do skins, generations, occasions, Space font sets and Theme Studio themes apply on this deploy? */
export const LEGACY_THEME_AXES: boolean = designDef(SITE_DESIGN).legacyAxes
