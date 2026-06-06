// Studio accent palette — the quick "give it a face" color a creator picks for a
// journey (and, later, any Studio-built entity). Keys map to the brand rank color
// tokens registered in app/globals.css (@theme --color-rank-*), so accents stay on
// the design system. We resolve them to CSS-var strings for inline styles rather
// than Tailwind classes, so every key works without JIT class-safelisting and we
// never hardcode a hex. Shared (client + server safe; no imports).

export const STUDIO_ACCENTS = [
  { key: 'jade', label: 'Jade' },
  { key: 'teal', label: 'Teal' },
  { key: 'indigo', label: 'Indigo' },
  { key: 'gold', label: 'Gold' },
  { key: 'plum', label: 'Plum' },
  { key: 'rose', label: 'Rose' },
  { key: 'clay', label: 'Clay' },
] as const

export type AccentKey = (typeof STUDIO_ACCENTS)[number]['key']

export const DEFAULT_ACCENT: AccentKey = 'jade'

function safeKey(key: string | null | undefined): AccentKey {
  return key && STUDIO_ACCENTS.some((a) => a.key === key) ? (key as AccentKey) : DEFAULT_ACCENT
}

/** The accent's solid color as a CSS var (for text, dots, borders). */
export function accentColor(key: string | null | undefined): string {
  return `var(--color-rank-${safeKey(key)})`
}

/** A soft tint of the accent (for fills behind an emoji/title). `pct` = strength. */
export function accentTint(key: string | null | undefined, pct = 14): string {
  return `color-mix(in srgb, ${accentColor(key)} ${pct}%, transparent)`
}
