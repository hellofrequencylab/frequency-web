import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'
import {
  toneBg,
  isInk,
  widthClass,
  alignClass,
  accentize,
  toneField,
  widthField,
  alignField,
  emphasisField,
  emphasisDefault,
  emphasisClasses,
  type EmphasisValue,
} from '@/lib/page-editor/fields'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeHref } from '@/lib/page-editor/richtext'

// Re-export the full helper set so block files can import everything they need
// from one place (`@/components/page-editor/blocks/kit`).
export { toneBg, isInk, widthClass, alignClass }

// ─────────────────────────────────────────────────────────────────────────────
// THE BLOCK KIT — the frozen contract every standardized block composes from.
//
// • <Band> is the universal section wrapper: it paints the background, applies
//   vertical spacing + responsive visibility, and caps the content column to the
//   chosen width/alignment. Content-only blocks (Heading, Text, CTA, Quote,
//   Stats, FAQ…) render their guts INSIDE a <Band>. Full-bleed blocks (Hero,
//   Gallery, Media+Text) manage their own <section> but still reuse the atoms.
// • Eyebrow / DisplayHeading / Kicker / CtaButton are the shared typographic
//   atoms so every block speaks the same DAWN editorial language.
// • blockLayoutFields()/blockLayout is the standard trailing field group so the
//   "adjust" controls (background, width, align, spacing, visibility) are
//   identical on every block.
//
// Re-exported helpers (accentize, padClass…) keep block files importing from one
// place. See lib/page-editor/fields.tsx for the field atoms + resolvers.
// ─────────────────────────────────────────────────────────────────────────────

export { accentize, toneField, widthField, alignField, layoutField, layoutDefault, padClass, visClass }
export { emphasisField, emphasisDefault, emphasisClasses }
export type { LayoutValue, EmphasisValue }
export type { ComponentConfig }

// The standard "adjust" field set, trailing on a content block. Spread into a
// block's `fields`. Use `blockLayoutDefaults` in defaultProps.
export function blockFields() {
  return {
    tone: toneField,
    width: widthField,
    align: alignField,
    layout: layoutField,
  }
}
export const blockLayoutDefaults = {
  tone: 'surface',
  width: 'default',
  align: 'left',
  layout: layoutDefault,
}

export type BandProps = {
  tone?: string
  width?: string
  align?: string
  layout?: LayoutValue
  /** Override the default vertical rhythm (e.g. tighter CTA bands). */
  defaultPad?: string
  children: React.ReactNode
}

// Universal section wrapper.
export function Band({ tone, width, align, layout, defaultPad, children }: BandProps) {
  return (
    <section
      className={`px-6 ${padClass(layout) ?? defaultPad ?? 'py-16 sm:py-20'} ${toneBg(tone)} ${visClass(layout)}`}
    >
      <div className={`${widthClass(width)} mx-auto ${alignClass(align)}`}>{children}</div>
    </section>
  )
}

// ── Typographic atoms ─────────────────────────────────────────────────────────

export function Eyebrow({ children, ink }: { children: React.ReactNode; ink?: boolean }) {
  return (
    <p
      className={`text-sm font-bold uppercase tracking-[0.25em] mb-4 ${
        ink ? 'text-primary' : 'text-primary-strong'
      }`}
    >
      {children}
    </p>
  )
}

export function DisplayHeading({
  children,
  ink,
  size = 'default',
  as: Tag = 'h2',
}: {
  children: React.ReactNode
  ink?: boolean
  size?: 'default' | 'lg'
  as?: 'h1' | 'h2' | 'h3'
}) {
  // Fluid scale, matching lib/page-editor/fields.tsx EMPHASIS_SCALE (clamp min→max):
  // unchanged on desktop, smaller mobile floor so headlines stay balanced on phones.
  const scale =
    size === 'lg'
      ? 'text-[clamp(2rem,7vw,4.5rem)] leading-[0.95]'
      : 'text-[clamp(1.875rem,5.5vw,3rem)]'
  return (
    <Tag className={`font-display uppercase text-balance ${scale} ${ink ? 'text-on-ink' : 'text-text'}`}>
      {children}
    </Tag>
  )
}

export function Kicker({ children, ink }: { children: React.ReactNode; ink?: boolean }) {
  return <p className={`mt-4 text-xl italic ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{children}</p>
}

export type CtaVariant = 'primary' | 'secondary' | 'ghost'

// One canonical CTA button — locked padding/radius, three variants. `onInk`
// recolors the secondary/ghost outlines for dark backgrounds.
export function CtaButton({
  href,
  label,
  variant = 'primary',
  onInk = false,
  withArrow = true,
}: {
  href: string
  label: string
  variant?: CtaVariant
  onInk?: boolean
  withArrow?: boolean
}) {
  const base = 'inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-bold transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-primary text-on-primary hover:bg-primary-hover shadow-pop'
      : variant === 'secondary'
        ? onInk
          ? 'border border-white/30 text-white hover:bg-white/10 hover:border-white/50'
          : 'border border-border-strong text-text hover:bg-surface-elevated'
        : onInk
          ? 'text-white/80 hover:text-white'
          : 'text-primary-strong hover:underline'
  return (
    <Link href={safeHref(href) ?? '#'} className={`${base} ${styles}`}>
      {label}
      {withArrow && <ArrowRight className="w-5 h-5" aria-hidden />}
    </Link>
  )
}

// ── REFERENCE BLOCK ──────────────────────────────────────────────────────────
// Copy this exact shape for new blocks: a presentational component that takes
// resolved props, plus a ComponentConfig with fields → defaultProps → render.
// The render maps editor field values to the component and threads the standard
// `blockFields()` adjust controls through <Band>.

export function HeadingBlock({
  eyebrow,
  title,
  kicker,
  ink,
  size,
}: {
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
  ink?: boolean
  size?: 'default' | 'lg'
}) {
  return (
    <>
      {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
      <DisplayHeading ink={ink} size={size}>
        {title}
      </DisplayHeading>
      {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
    </>
  )
}

export const headingComponents: Record<string, ComponentConfig> = {
  Heading: {
    label: 'Heading',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      emphasis: emphasisField,
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'Eyebrow',
      title: 'Section heading',
      titleAccent: '',
      kicker: '',
      emphasis: emphasisDefault,
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, kicker, emphasis, tone, width, align, layout }) => {
      const ink = isInk(tone)
      const { scale, accent } = emphasisClasses(emphasis as EmphasisValue)
      return (
        <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          <h2
            className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}
          >
            {accentize(title, titleAccent)}
          </h2>
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </Band>
      )
    },
  },
}
