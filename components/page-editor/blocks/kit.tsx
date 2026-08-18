import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ComponentConfig } from '@/lib/page-editor/types'
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

// THE eyebrow, and the only one this kit declares.
//
// Until 2026-08-18 this atom hand-rolled the role at `text-body-sm font-bold uppercase tracking-eyebrow`
// — 0.875rem, DAWN's DECLARED eyebrow size, and precisely the half of DAWN's own split that
// `app/globals.css` resolved DOWN to 0.75rem on 2026-08-05 (ADR-1072). So the product carried two
// eyebrow registers 17% apart and neither was a mistake: the `eyebrow` utility rendered what this repo
// chose, this component rendered what DAWN published, and which one you got depended on whether you
// wrote a class or an import. The owner settled it on 2026-08-18 — **0.75rem wins** (ADR-1075) — and
// this component stopped declaring the role and started composing it.
//
// What each class is doing, because three of them look alike and only one sets type:
//   `eyebrow`     — the ROLE, whole, from globals.css: 0.75rem / 0.18em / bold / uppercase / grotesk.
//                   Nothing here may re-state any of those; a size class beside this one IS the second
//                   register coming back, and `lib/theme/eyebrow-role.test.ts` fails by name on it.
//   `font-eyebrow` — the SEPARATE Space page theme hook (ADR-578): a bare marker with no base rule, so
//                   per-theme kicker treatment attaches without touching the default computed style.
//   `data-text-role="eyebrow"` — the PER-ELEMENT text-styling marker (ADR-580, item 4): the block
//                   editor's Eyebrow controls target it alone, and the Body controls skip it.
export function Eyebrow({ children, ink }: { children: React.ReactNode; ink?: boolean }) {
  return (
    <p
      data-text-role="eyebrow"
      className={`eyebrow font-eyebrow mb-4 ${ink ? 'text-primary' : 'text-primary-strong'}`}
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
  return <p className={`mt-4 text-lead italic ${ink ? 'text-on-ink-muted' : 'text-muted'}`}>{children}</p>
}

export type CtaVariant = 'primary' | 'secondary' | 'ghost'

// One canonical CTA button — locked padding, three variants. `onInk` recolors the secondary/ghost
// outlines for dark backgrounds. `rounded-card` (was rounded-2xl, the same 1rem at baseline): inside a
// Space subtree the page theme shapes it (ADR-578) while the [data-space-theme] baseline pin keeps
// `bold` at exactly today's 16px — kept on the CARD token, not rounded-control, precisely because
// mapping this big CTA to the 0.5rem control baseline would shrink bold's corners.
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
  const base = 'inline-flex items-center gap-2 rounded-card px-8 py-3.5 text-body font-bold transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-primary text-on-primary hover:bg-primary-hover shadow-pop'
      : variant === 'secondary'
        ? onInk
          ? 'border border-on-ink/30 text-on-ink hover:bg-on-ink/10 hover:border-on-ink/50'
          : 'border border-border-strong text-text hover:bg-surface-elevated'
        : onInk
          ? 'text-on-ink/80 hover:text-on-ink'
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
            {accentize(title, titleAccent, ink)}
          </h2>
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </Band>
      )
    },
  },
}
