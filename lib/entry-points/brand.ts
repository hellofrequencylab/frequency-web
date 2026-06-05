// Brand palette for GENERATED PRINT ASSETS (the entry-point flyer, ADR-126).
//
// A flyer is an exported SVG/PNG file, not a React component — it can't read the
// Tailwind design tokens, so it needs literal colors. These mirror the brand's warm
// ink/canvas/amber and live in ONE place so the flyer stays on-brand and tunable.
// (The "no hardcoded hex in UI" rule is about components; generated assets are the
// documented exception — same as lib/qr/style.ts's DEFAULT_STYLE.)

export const FLYER_BRAND = {
  ink: '#16130f',
  canvas: '#fbf7f0',
  surface: '#ffffff',
  primary: '#e8923a',
  onPrimary: '#1a150e',
  muted: '#6f665a',
  hairline: '#e7ddcd',
} as const

export const FLYER_WORDMARK = 'FREQUENCY'
