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
export type Align = 'left' | 'center'

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
