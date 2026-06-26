// Shared field atoms + style resolvers for the standardized Puck block library.
// Every block composes from THESE — so the editor offers one consistent set of
// "adjust" controls (background, width, alignment, spacing, visibility) and the
// design system can't drift. The block components live in
// `components/page-editor/blocks/*`; this module is their common vocabulary.
//
// Design tokens (DAWN): surface = white, marketing-canvas = cream, slat = warm
// ink (dark). Never raw colors — selects compile to a fixed Tailwind set.

import { ImageField } from './image-field'

// ── Universal "adjust" fields ────────────────────────────────────────────────

// Background tone. The fourth, 'none', lets a block sit transparently inside a
// Section container that already paints the band.
export const toneField = {
  type: 'select' as const,
  label: 'Background',
  options: [
    { label: 'White', value: 'surface' },
    { label: 'Cream', value: 'canvas' },
    { label: 'Dark', value: 'ink' },
    { label: 'Transparent', value: 'none' },
  ],
}
export type Tone = 'surface' | 'canvas' | 'ink' | 'none'

// Content max-width. Distinct from image "Size" — this is the text column.
export const widthField = {
  type: 'select' as const,
  label: 'Content width',
  options: [
    { label: 'Narrow', value: 'narrow' },
    { label: 'Default', value: 'default' },
    { label: 'Wide', value: 'wide' },
    { label: 'Full', value: 'full' },
  ],
}
export type Width = 'narrow' | 'default' | 'wide' | 'full'

export const alignField = {
  type: 'radio' as const,
  label: 'Align',
  options: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
  ],
}

// Image picker (upload / pick / paste URL) — the project's custom control.
export const imgField = {
  type: 'custom' as const,
  render: ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => (
    <ImageField value={value} onChange={onChange} />
  ),
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

const BG: Record<Tone, string> = {
  surface: 'bg-surface',
  canvas: 'bg-marketing-canvas',
  ink: 'bg-slat text-on-ink',
  none: '',
}
export function toneBg(tone?: string): string {
  return BG[(tone as Tone) ?? 'surface'] ?? BG.surface
}
export function isInk(tone?: string): boolean {
  return tone === 'ink'
}

const WIDTH: Record<Width, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-3xl',
  wide: 'max-w-5xl',
  full: 'max-w-7xl',
}
export function widthClass(width?: string): string {
  return WIDTH[(width as Width) ?? 'default'] ?? WIDTH.default
}

export function alignClass(align?: string): string {
  return align === 'center' ? 'text-center' : ''
}

// ── Option-group field builders ───────────────────────────────────────────────
// Reusable "object" field groups (modeled on layoutField) that marketing blocks
// can opt into. Each export pairs a builder — spread into a block's `fields` —
// with a resolver that maps the value to a fixed Tailwind/DAWN class set. Like
// layoutField, the controls collapse into one tidy section in the editor instead
// of scattering top-level fields, and the resolver never emits a raw colour.
//
// CONTRACT: every option below is consumed by its resolver (no dead fields).

// ── (1) Emphasis / typography ──────────────────────────────────────────────────
// Heading size scale + optional accent tone. Use to let a block dial its
// editorial weight without re-authoring type styles. Resolver returns a class
// string for the heading element.

// Fluid display scale: clamp(min, viewport-relative, max). The max equals the old
// desktop size, so large screens are unchanged; the min is a smaller mobile floor so
// long headlines stop swallowing the viewport on phones (they scale smoothly between).
const EMPHASIS_SCALE: Record<string, string> = {
  sm: 'text-[clamp(1.375rem,3.5vw,1.875rem)]',
  default: 'text-[clamp(1.875rem,5.5vw,3rem)]',
  lg: 'text-[clamp(2rem,7vw,4.5rem)] leading-[0.95]',
}

const EMPHASIS_ACCENT: Record<string, string> = {
  none: '',
  primary: 'text-primary',
  signal: 'text-signal-strong',
}

export const emphasisField = {
  type: 'object' as const,
  label: 'Emphasis',
  objectFields: {
    scale: {
      type: 'select' as const,
      label: 'Heading size',
      options: [
        { label: 'Small', value: 'sm' },
        { label: 'Default', value: 'default' },
        { label: 'Large', value: 'lg' },
      ],
    },
    accent: {
      type: 'select' as const,
      label: 'Accent tone',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Primary', value: 'primary' },
        { label: 'Signal', value: 'signal' },
      ],
    },
  },
}

export type EmphasisValue = {
  scale?: string
  accent?: string
}

export const emphasisDefault: EmphasisValue = {
  scale: 'default',
  accent: 'none',
}

// Returns { scale, accent } class strings. `accent` is empty when 'none' so the
// heading keeps its inherited colour. On an ink (dark) band, the 'primary' accent
// already reads correctly; pass nothing special.
export function emphasisClasses(value?: EmphasisValue): { scale: string; accent: string } {
  return {
    scale: EMPHASIS_SCALE[value?.scale ?? 'default'] ?? EMPHASIS_SCALE.default,
    accent: EMPHASIS_ACCENT[value?.accent ?? 'none'] ?? EMPHASIS_ACCENT.none,
  }
}

// ── (2) Surface / card style ───────────────────────────────────────────────────
// For collection-style blocks (cards, tiles, feature grids): border vs elevated
// vs plain treatment + corner radius. Resolver returns one class string to spread
// on the card element. `ink` swaps the light-band border/fill for the dark-band
// equivalents so cards stay legible on a dark Section.

const CARD_STYLE_LIGHT: Record<string, string> = {
  border: 'border border-border bg-surface',
  elevated: 'border border-border bg-surface shadow-pop',
  plain: 'bg-transparent',
}

const CARD_STYLE_INK: Record<string, string> = {
  border: 'border border-white/10 bg-white/5',
  elevated: 'border border-white/10 bg-white/5 shadow-pop',
  plain: 'bg-transparent',
}

const CARD_RADIUS: Record<string, string> = {
  sm: 'rounded-lg',
  md: 'rounded-2xl',
  lg: 'rounded-3xl',
}

export const cardStyleField = {
  type: 'object' as const,
  label: 'Card style',
  objectFields: {
    style: {
      type: 'radio' as const,
      label: 'Treatment',
      options: [
        { label: 'Border', value: 'border' },
        { label: 'Elevated', value: 'elevated' },
        { label: 'Plain', value: 'plain' },
      ],
    },
    radius: {
      type: 'select' as const,
      label: 'Corner radius',
      options: [
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ],
    },
  },
}

export type CardStyleValue = {
  style?: string
  radius?: string
}

export const cardStyleDefault: CardStyleValue = {
  style: 'border',
  radius: 'md',
}

// Returns a single class string (treatment + radius) for the card element. Pass
// `ink` true on dark bands so the border/fill recolor for legibility.
export function cardStyleClass(value?: CardStyleValue, ink?: boolean): string {
  const styles = ink ? CARD_STYLE_INK : CARD_STYLE_LIGHT
  const treatment = styles[value?.style ?? 'border'] ?? styles.border
  const radius = CARD_RADIUS[value?.radius ?? 'md'] ?? CARD_RADIUS.md
  return `${treatment} ${radius}`.trim()
}

// ── (3) Density (gap + inner padding nuance) ────────────────────────────────────
// Complements layout.ts (which owns the BAND's vertical rhythm + visibility):
// this governs the INTERNAL rhythm of multi-item blocks — the gap between items
// and the padding inside each card. Resolver returns both classes.

const DENSITY_GAP: Record<string, string> = {
  compact: 'gap-4',
  cozy: 'gap-6 sm:gap-8',
  roomy: 'gap-8 sm:gap-12',
}

const DENSITY_PAD: Record<string, string> = {
  compact: 'p-5',
  cozy: 'p-7 sm:p-8',
  roomy: 'p-8 sm:p-10',
}

export const densityField = {
  type: 'object' as const,
  label: 'Density',
  objectFields: {
    spacing: {
      type: 'radio' as const,
      label: 'Item spacing',
      options: [
        { label: 'Compact', value: 'compact' },
        { label: 'Cozy', value: 'cozy' },
        { label: 'Roomy', value: 'roomy' },
      ],
    },
  },
}

export type DensityValue = {
  spacing?: string
}

export const densityDefault: DensityValue = {
  spacing: 'cozy',
}

// Returns { gap, pad } class strings: `gap` for the grid/stack wrapper, `pad` for
// each item's inner padding. Both move together off one control.
export function densityClasses(value?: DensityValue): { gap: string; pad: string } {
  const key = value?.spacing ?? 'cozy'
  return {
    gap: DENSITY_GAP[key] ?? DENSITY_GAP.cozy,
    pad: DENSITY_PAD[key] ?? DENSITY_PAD.cozy,
  }
}

// Wrap an accent word in the brand colour (one accent occurrence, first match).
export function accentize(text?: string, accent?: string): React.ReactNode {
  if (!text) return null
  if (!accent || !text.includes(accent)) return text
  const i = text.indexOf(accent)
  return (
    <>
      {text.slice(0, i)}
      <span className="text-primary">{accent}</span>
      {text.slice(i + accent.length)}
    </>
  )
}
