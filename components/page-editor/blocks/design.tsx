// THE FIVE DESIGN BLOCKS (Design Blocks, 2026) — reusable, member-light content blocks any Space,
// Spotlight, or marketing page composes from the Blocks palette. They are the light, bolder pass of
// the marketing story blocks: Anton headers by default with a per-header FONT choice, an accent word
// that reads from the member's chosen accent token, and the warm-light palette throughout. Ink stays
// on the marketing theme; these NEVER go dark (a photo sits under a light CREAM scrim, not an ink one).
//
// Keys:  PhotoHero | EditorialSection | CardGrid | Zigzag | AccentBeat
// Category: Blocks
//
// Every block follows the frozen kit contract (fields -> defaultProps -> render), composes the shared
// kit atoms (Band / Eyebrow / CtaButton / accentize), and uses SEMANTIC DAWN tokens only — no hex, no
// arbitrary type sizes for content. Copy is voice-canon (docs/CONTENT-VOICE.md): plain sentences,
// proper nouns carry the magic, no em or en dashes. See the design scope report for the full spec.

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ComponentConfig } from '@/lib/page-editor/types'

import {
  Band,
  Eyebrow,
  CtaButton,
  accentize,
  blockFields,
  blockLayoutDefaults,
  padClass,
  visClass,
  type LayoutValue,
} from './kit'
import {
  imgField,
  headerFontField,
  headerFontDefault,
  headerFontStyle,
} from '@/lib/page-editor/fields'
import { richParagraphs, safeHref } from '@/lib/page-editor/richtext'
import { SiteImage } from '@/components/marketing/site-image'

// ── Shared header-font select ───────────────────────────────────────────────
// Every design block's heading offers the same per-header font choice, defaulting to the Anton
// display face. `headerFontStyle` turns the chosen id into an inline fontFamily off the validated
// CSS-variable stacks (lib/page-editor/fields), so no raw font string reaches the DOM.

// A design-block heading: the accent word reads from the member accent token (text-primary), the rest
// stays warm text (text-text). The chosen face applies via inline style so the picker is per-header.
function DesignHeading({
  title,
  accentWord,
  headerFont,
  size = 'default',
  as: Tag = 'h2',
}: {
  title?: string
  accentWord?: string
  headerFont?: string
  size?: 'default' | 'lg'
  as?: 'h1' | 'h2' | 'h3'
}) {
  if (!title) return null
  // Fluid scale mirrors the kit DisplayHeading so a design block sits in the same type rhythm.
  const scale =
    size === 'lg'
      ? 'text-[clamp(2rem,7vw,4.5rem)] leading-[0.95]'
      : 'text-[clamp(1.875rem,5.5vw,3rem)]'
  return (
    <Tag className={`font-display uppercase text-balance text-text ${scale}`} style={headerFontStyle(headerFont)}>
      {accentWord ? accentize(title, accentWord) : title}
    </Tag>
  )
}

// ── The header-font field group, shared by every design block. ──
const designHeaderFontField = headerFontField

// ─────────────────────────────────────────────────────────────────────────────
// 01 · PhotoHero — the opener at the top of a page.
// A full-width photograph under a light cream scrim (canvas ~82%) so the Anton headline + accent CTA
// read WITHOUT going dark. Centered eyebrow, headline with an accent word, optional subtitle, up to two
// actions. `variant` image | wash | text-only; no image falls back to an accent wash.
// ─────────────────────────────────────────────────────────────────────────────

type PhotoHeroVariant = 'image' | 'wash' | 'text-only'
type ScrimStep = 'light' | 'medium'

const SCRIM_CLASS: Record<ScrimStep, string> = {
  // Cream veil (the page canvas) at two strengths so legibility holds on any photo; tokenized, never ink.
  light: 'bg-canvas/80',
  medium: 'bg-canvas/90',
}

export function PhotoHeroBlock({
  variant = 'image',
  image,
  alt,
  eyebrow,
  title,
  accentWord,
  subtitle,
  actionPrimaryLabel,
  actionPrimaryHref,
  actionSecondaryLabel,
  actionSecondaryHref,
  scrim = 'light',
  headerFont,
  layout,
}: {
  variant?: PhotoHeroVariant
  image?: string
  alt?: string
  eyebrow?: string
  title?: string
  accentWord?: string
  subtitle?: string
  actionPrimaryLabel?: string
  actionPrimaryHref?: string
  actionSecondaryLabel?: string
  actionSecondaryHref?: string
  scrim?: ScrimStep
  headerFont?: string
  layout?: LayoutValue
}) {
  const showPhoto = variant === 'image' && !!image
  const actions = (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {actionPrimaryLabel && actionPrimaryHref && (
        <CtaButton href={actionPrimaryHref} label={actionPrimaryLabel} variant="primary" />
      )}
      {actionSecondaryLabel && actionSecondaryHref && (
        <CtaButton href={actionSecondaryHref} label={actionSecondaryLabel} variant="secondary" />
      )}
    </div>
  )
  const hasActions =
    (actionPrimaryLabel && actionPrimaryHref) || (actionSecondaryLabel && actionSecondaryHref)

  const inner = (
    <div className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <DesignHeading title={title} accentWord={accentWord} headerFont={headerFont} size="lg" as="h1" />
      {subtitle && <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{subtitle}</p>}
      {hasActions ? actions : null}
    </div>
  )

  return (
    <section className={`relative overflow-hidden rounded-2xl ${padClass(layout) ?? ''} ${visClass(layout)}`}>
      {showPhoto ? (
        <>
          {/* Alt text is required in the editor; the photo sits under a CREAM veil, never an ink scrim. */}
          <SiteImage src={image!} alt={alt ?? ''} aspect="16/9" className="absolute inset-0 h-full w-full" preload />
          <div className={`absolute inset-0 ${SCRIM_CLASS[scrim]}`} aria-hidden />
        </>
      ) : (
        // Forgiving: no image (or the wash / text-only variants) falls back to a pale accent wash so the
        // page still opens loud. text-only reads as a utility opener with no photo.
        <div className={variant === 'text-only' ? 'bg-surface' : 'bg-primary-bg'} aria-hidden />
      )}
      {inner}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 02 · EditorialSection — the text workhorse. A fixed heading lockup over a flexible body.
// body: lead | prose | faq | stats. surface: open | soft-card. Open by default so the page is not
// wall-to-wall boxes. Prose constrains the measure to ~62ch; stats runs Anton numbers with tiny labels.
// ─────────────────────────────────────────────────────────────────────────────

type EditorialBody = 'lead' | 'prose' | 'faq' | 'stats'
type EditorialSurface = 'open' | 'soft-card'

type StatItem = { value?: string; label?: string }
type FaqItem = { q?: string; a?: string }

export function EditorialSectionBlock({
  eyebrow,
  title,
  accentWord,
  kicker,
  body = 'lead',
  surface = 'open',
  lead,
  stats,
  faqs,
  headerFont,
}: {
  eyebrow?: string
  title?: string
  accentWord?: string
  kicker?: string
  body?: EditorialBody
  surface?: EditorialSurface
  lead?: string
  stats?: StatItem[]
  faqs?: FaqItem[]
  headerFont?: string
}) {
  const heading = (
    <div className="mb-8">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <DesignHeading title={title} accentWord={accentWord} headerFont={headerFont} />
      {kicker && <p className="mt-4 text-xl italic text-muted">{kicker}</p>}
    </div>
  )

  let content: React.ReactNode = null
  if (body === 'stats') {
    const shown = (stats ?? []).filter((s) => s?.value || s?.label)
    content = shown.length ? (
      <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {shown.map((s, i) => (
          <div key={i}>
            <dt className="font-display text-[clamp(2.5rem,6vw,4rem)] leading-none text-primary-strong">
              {s.value}
            </dt>
            <dd className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted">{s.label}</dd>
          </div>
        ))}
      </dl>
    ) : null
  } else if (body === 'faq') {
    const shown = (faqs ?? []).filter((f) => f?.q || f?.a)
    content = shown.length ? (
      <div className="divide-y divide-border border-y border-border">
        {shown.map((f, i) => (
          <details key={i} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-text">
              {f.q}
              <ArrowRight
                className="h-5 w-5 shrink-0 text-primary transition-transform group-open:rotate-90"
                aria-hidden
              />
            </summary>
            {f.a && <div className="mt-3 space-y-3 text-base leading-relaxed text-muted">{richParagraphs(f.a)}</div>}
          </details>
        ))}
      </div>
    ) : null
  } else {
    // lead + prose share the paragraph renderer; prose caps the reading measure to ~62 characters.
    const measure = body === 'prose' ? 'max-w-[62ch]' : 'max-w-2xl'
    content = lead ? (
      <div className={`${measure} space-y-4 text-lg leading-relaxed text-muted`}>{richParagraphs(lead)}</div>
    ) : (
      // Never a blank block: an empty body shows a quiet writing prompt (editor guidance).
      <p className="text-base italic text-subtle">Add your words here. Tell the story in plain sentences.</p>
    )
  }

  // Open by default (no card, so the page is not wall-to-wall boxes); soft-card wraps the beat in a
  // hairline warm card for the rare section that wants to stand apart from its neighbours.
  const inner = (
    <>
      {heading}
      {content}
    </>
  )
  return surface === 'soft-card' ? (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-pop sm:p-10">{inner}</div>
  ) : (
    inner
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 · CardGrid — what you get, and browse. A centered heading over a 1/2/3-up row + an optional link.
// role feature | list | step | testimonial | media. Cards keep a hairline warm border + a soft shadow.
// Icon chips use the accent wash. One item renders a single card, never a broken grid.
// ─────────────────────────────────────────────────────────────────────────────

type CardRole = 'feature' | 'list' | 'step' | 'testimonial' | 'media'
type GridCard = {
  icon?: string
  image?: string
  alt?: string
  title?: string
  body?: string
  by?: string
}

const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
}

export function CardGridBlock({
  eyebrow,
  title,
  accentWord,
  role = 'feature',
  columns = 3,
  cards,
  browseLabel,
  browseHref,
  headerFont,
}: {
  eyebrow?: string
  title?: string
  accentWord?: string
  role?: CardRole
  columns?: number
  cards?: GridCard[]
  browseLabel?: string
  browseHref?: string
  headerFont?: string
}) {
  const shown = (cards ?? []).filter((c) => c?.title || c?.body || c?.image || c?.by)
  const n = Math.min(Math.max(columns, 1), 3)
  const cols = shown.length === 1 ? GRID_COLS[1] : GRID_COLS[n] ?? GRID_COLS[3]
  const browseSafe = safeHref(browseHref)

  return (
    <div className="text-center">
      <div className="mb-10">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <DesignHeading title={title} accentWord={accentWord} headerFont={headerFont} />
      </div>
      {shown.length > 0 && (
        <div className={`grid grid-cols-1 gap-6 text-left ${cols}`}>
          {shown.map((card, i) => (
            <article
              key={i}
              className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop"
            >
              {(role === 'media' || role === 'testimonial') && card.image && (
                <SiteImage src={card.image} alt={card.alt ?? ''} aspect="4/3" className="w-full" />
              )}
              <div className="flex flex-1 flex-col gap-3 p-6">
                {role === 'feature' && card.icon && (
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-xl leading-none text-primary-strong" aria-hidden>
                    {card.icon}
                  </span>
                )}
                {role === 'step' && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg font-display text-lg text-primary-strong" aria-hidden>
                    {i + 1}
                  </span>
                )}
                {card.title && (
                  <h3
                    className={
                      role === 'feature' || role === 'step'
                        ? 'font-display text-xl uppercase text-text'
                        : 'text-lg font-bold text-text'
                    }
                  >
                    {card.title}
                  </h3>
                )}
                {card.body && (
                  <p className={`text-base leading-relaxed text-muted ${role === 'testimonial' ? 'italic' : ''}`}>
                    {card.body}
                  </p>
                )}
                {role === 'testimonial' && card.by && (
                  <p className="mt-auto text-sm font-semibold text-text">{card.by}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {browseLabel && browseSafe && (
        <div className="mt-10">
          <Link
            href={browseSafe}
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary-strong hover:underline"
          >
            {browseLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 · Zigzag — the story beat. A soft framed photo beside a text column, reversible.
// mediaSide left | right. background canvas | accent-wash (never ink). body lead | list | quote.
// Alt text required on the framed media.
// ─────────────────────────────────────────────────────────────────────────────

type ZigzagBg = 'canvas' | 'accent-wash'
type ZigzagBody = 'lead' | 'list' | 'quote'

export function ZigzagBlock({
  image,
  alt,
  eyebrow,
  title,
  accentWord,
  body = 'lead',
  lead,
  items,
  quoteBy,
  ctaLabel,
  ctaHref,
  mediaSide = 'left',
  background = 'canvas',
  headerFont,
}: {
  image?: string
  alt?: string
  eyebrow?: string
  title?: string
  accentWord?: string
  body?: ZigzagBody
  lead?: string
  items?: { text?: string }[]
  quoteBy?: string
  ctaLabel?: string
  ctaHref?: string
  mediaSide?: 'left' | 'right'
  background?: ZigzagBg
  headerFont?: string
}) {
  const ctaSafe = safeHref(ctaHref)
  const list = (items ?? []).map((it) => it?.text).filter((t): t is string => !!t)

  const media = image ? (
    <div className="overflow-hidden rounded-[1.25rem] border border-border shadow-pop">
      <SiteImage src={image} alt={alt ?? ''} aspect="4/3" className="w-full" />
    </div>
  ) : (
    <div className="aspect-[4/3] w-full rounded-[1.25rem] border border-border bg-primary-bg" aria-hidden />
  )

  const text = (
    <div>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <DesignHeading title={title} accentWord={accentWord} headerFont={headerFont} />
      <div className="mt-5">
        {body === 'quote' ? (
          <figure>
            <blockquote className="border-l-2 border-primary pl-5 text-xl font-medium italic text-text">
              {lead}
            </blockquote>
            {quoteBy && <figcaption className="mt-3 text-sm font-semibold text-muted">{quoteBy}</figcaption>}
          </figure>
        ) : body === 'list' ? (
          <ul className="space-y-3">
            {list.map((t, i) => (
              <li key={i} className="flex gap-3 text-lg text-muted">
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4 text-lg leading-relaxed text-muted">{richParagraphs(lead)}</div>
        )}
      </div>
      {ctaLabel && ctaSafe && (
        <Link
          href={ctaSafe}
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-primary-strong hover:underline"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )

  return (
    <div className={`rounded-2xl ${background === 'accent-wash' ? 'bg-primary-bg p-6 sm:p-10' : ''}`}>
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
        {mediaSide === 'left' ? (
          <>
            {media}
            {text}
          </>
        ) : (
          <>
            <div className="md:order-2">{media}</div>
            <div className="md:order-1">{text}</div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 05 · AccentBeat — the moment of color and the call to action. The member replacement for the
// marketing ink beat; on the member side it NEVER goes dark. background accent-wash | image-scrim.
// mode statement | cta | quote. Held to one or two per page so the color stays punctuation.
// ─────────────────────────────────────────────────────────────────────────────

type AccentBg = 'accent-wash' | 'image-scrim'
type AccentMode = 'statement' | 'cta' | 'quote'

export function AccentBeatBlock({
  background = 'accent-wash',
  mode = 'cta',
  image,
  alt,
  eyebrow,
  title,
  accentWord,
  body,
  quoteBy,
  ctaLabel,
  ctaHref,
  headerFont,
}: {
  background?: AccentBg
  mode?: AccentMode
  image?: string
  alt?: string
  eyebrow?: string
  title?: string
  accentWord?: string
  body?: string
  quoteBy?: string
  ctaLabel?: string
  ctaHref?: string
  headerFont?: string
}) {
  const onImage = background === 'image-scrim' && !!image
  const ctaSafe = safeHref(ctaHref)

  const inner = (
    <div className="relative z-10 mx-auto max-w-2xl px-6 py-16 text-center sm:py-20">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {mode === 'quote' ? (
        <figure>
          <blockquote className="font-display text-[clamp(1.5rem,4vw,2.5rem)] uppercase leading-tight text-text" style={headerFontStyle(headerFont)}>
            {accentWord ? accentize(title ?? '', accentWord) : title}
          </blockquote>
          {quoteBy && <figcaption className="mt-4 text-sm font-semibold text-muted">{quoteBy}</figcaption>}
        </figure>
      ) : (
        <DesignHeading title={title} accentWord={accentWord} headerFont={headerFont} />
      )}
      {body && <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{body}</p>}
      {mode === 'cta' && ctaLabel && ctaSafe && (
        <div className="mt-8">
          <CtaButton href={ctaSafe} label={ctaLabel} variant="primary" />
        </div>
      )}
    </div>
  )

  return (
    <section className="relative overflow-hidden rounded-2xl">
      {onImage ? (
        <>
          <SiteImage src={image!} alt={alt ?? ''} aspect="21/9" className="absolute inset-0 h-full w-full" />
          {/* Reuses the PhotoHero cream veil so the member beat never goes dark. */}
          <div className="absolute inset-0 bg-canvas/85" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 bg-primary-bg" aria-hidden />
      )}
      {inner}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT CONFIGS — registered in BOTH the shared block library (lib/page-editor/config.tsx) under
// the "Blocks" category and consumed by the public <Render>. Every block threads the standard
// blockFields() adjust controls through <Band> (or its own <section>) and offers the per-header font.
// ─────────────────────────────────────────────────────────────────────────────

export const designComponents: Record<string, ComponentConfig> = {
  PhotoHero: {
    label: 'Photo hero',
    fields: {
      variant: {
        type: 'select',
        label: 'Variant',
        options: [
          { label: 'Image', value: 'image' },
          { label: 'Wash', value: 'wash' },
          { label: 'Text only', value: 'text-only' },
        ],
      },
      image: imgField,
      alt: { type: 'text', label: 'Alt text (required on the image)' },
      headerFont: designHeaderFontField,
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Headline' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      subtitle: { type: 'textarea', label: 'Subtitle (optional)' },
      scrim: {
        type: 'radio',
        label: 'Scrim',
        options: [
          { label: 'Light', value: 'light' },
          { label: 'Medium', value: 'medium' },
        ],
      },
      actionPrimaryLabel: { type: 'text', label: 'Primary button label' },
      actionPrimaryHref: { type: 'text', label: 'Primary button link' },
      actionSecondaryLabel: { type: 'text', label: 'Secondary button label' },
      actionSecondaryHref: { type: 'text', label: 'Secondary button link' },
      layout: blockFields().layout,
    },
    defaultProps: {
      variant: 'image',
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'Come sit with us',
      title: 'The warm room is real',
      accentWord: 'warm',
      subtitle: 'Beach gatherings, circles, and practice, held in person.',
      scrim: 'light',
      actionPrimaryLabel: 'See what is happening',
      actionPrimaryHref: '#',
      actionSecondaryLabel: '',
      actionSecondaryHref: '',
      layout: blockLayoutDefaults.layout,
    },
    render: ({
      variant,
      image,
      alt,
      headerFont,
      eyebrow,
      title,
      accentWord,
      subtitle,
      scrim,
      actionPrimaryLabel,
      actionPrimaryHref,
      actionSecondaryLabel,
      actionSecondaryHref,
      layout,
    }) => (
      <PhotoHeroBlock
        variant={variant as PhotoHeroVariant}
        image={image as string}
        alt={alt as string}
        headerFont={headerFont as string}
        eyebrow={eyebrow as string}
        title={title as string}
        accentWord={accentWord as string}
        subtitle={subtitle as string}
        scrim={scrim as ScrimStep}
        actionPrimaryLabel={actionPrimaryLabel as string}
        actionPrimaryHref={actionPrimaryHref as string}
        actionSecondaryLabel={actionSecondaryLabel as string}
        actionSecondaryHref={actionSecondaryHref as string}
        layout={layout as LayoutValue}
      />
    ),
  },

  EditorialSection: {
    label: 'Editorial section',
    fields: {
      headerFont: designHeaderFontField,
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      body: {
        type: 'select',
        label: 'Body',
        options: [
          { label: 'Lead', value: 'lead' },
          { label: 'Prose', value: 'prose' },
          { label: 'FAQ', value: 'faq' },
          { label: 'Stats', value: 'stats' },
        ],
      },
      surface: {
        type: 'radio',
        label: 'Surface',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Soft card', value: 'soft-card' },
        ],
      },
      lead: { type: 'textarea', label: 'Body text (lead / prose)' },
      stats: {
        type: 'array',
        label: 'Stats (stats body)',
        arrayFields: {
          value: { type: 'text', label: 'Number' },
          label: { type: 'text', label: 'Label' },
        },
      },
      faqs: {
        type: 'array',
        label: 'Questions (FAQ body)',
        arrayFields: {
          q: { type: 'text', label: 'Question' },
          a: { type: 'textarea', label: 'Answer' },
        },
      },
      ...blockFields(),
    },
    defaultProps: {
      headerFont: headerFontDefault,
      eyebrow: 'Why Frequency',
      title: 'A promise, not a program',
      accentWord: 'promise',
      kicker: '',
      body: 'lead',
      surface: 'open',
      lead: 'Before we name anything, we settle the nervous system enough that what is true can surface on its own.',
      stats: [
        { value: '1,000+', label: 'Circles held' },
        { value: '13', label: 'Week seasons' },
        { value: '54', label: 'Person origin' },
      ],
      faqs: [{ q: 'A common question?', a: 'A plain, honest answer.' }],
      ...blockLayoutDefaults,
    },
    render: ({ headerFont, eyebrow, title, accentWord, kicker, body, surface, lead, stats, faqs, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <EditorialSectionBlock
          headerFont={headerFont as string}
          eyebrow={eyebrow as string}
          title={title as string}
          accentWord={accentWord as string}
          kicker={kicker as string}
          body={body as EditorialBody}
          surface={surface as EditorialSurface}
          lead={lead as string}
          stats={stats as StatItem[]}
          faqs={faqs as FaqItem[]}
        />
      </Band>
    ),
  },

  CardGrid: {
    label: 'Card grid',
    fields: {
      headerFont: designHeaderFontField,
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      role: {
        type: 'select',
        label: 'Role',
        options: [
          { label: 'Feature', value: 'feature' },
          { label: 'List', value: 'list' },
          { label: 'Step', value: 'step' },
          { label: 'Testimonial', value: 'testimonial' },
          { label: 'Media', value: 'media' },
        ],
      },
      columns: {
        type: 'select',
        label: 'Columns',
        options: [
          { label: '1', value: 1 },
          { label: '2', value: 2 },
          { label: '3', value: 3 },
        ],
      },
      cards: {
        type: 'array',
        label: 'Cards',
        arrayFields: {
          icon: { type: 'text', label: 'Icon / emoji (feature role)' },
          image: imgField,
          alt: { type: 'text', label: 'Alt text (media / testimonial)' },
          title: { type: 'text', label: 'Title' },
          body: { type: 'textarea', label: 'Text' },
          by: { type: 'text', label: 'Attribution (testimonial)' },
        },
      },
      browseLabel: { type: 'text', label: 'Browse link label (optional)' },
      browseHref: { type: 'text', label: 'Browse link URL' },
      ...blockFields(),
    },
    defaultProps: {
      headerFont: headerFontDefault,
      eyebrow: 'What you get',
      title: 'Three things every member holds',
      accentWord: 'holds',
      role: 'feature',
      columns: 3,
      cards: [
        { icon: '◎', title: 'A real circle', body: 'People who gather in person, not just a feed.' },
        { icon: '△', title: 'Guided practice', body: 'Somatic sessions paced to your capacity.' },
        { icon: '↗', title: 'A next step', body: 'Leave each season with one honest move.' },
      ],
      browseLabel: '',
      browseHref: '',
      ...blockLayoutDefaults,
    },
    render: ({ headerFont, eyebrow, title, accentWord, role, columns, cards, browseLabel, browseHref, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <CardGridBlock
          headerFont={headerFont as string}
          eyebrow={eyebrow as string}
          title={title as string}
          accentWord={accentWord as string}
          role={role as CardRole}
          columns={Number(columns)}
          cards={cards as GridCard[]}
          browseLabel={browseLabel as string}
          browseHref={browseHref as string}
        />
      </Band>
    ),
  },

  Zigzag: {
    label: 'Zigzag',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text (required on the media)' },
      headerFont: designHeaderFontField,
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      body: {
        type: 'select',
        label: 'Body',
        options: [
          { label: 'Lead', value: 'lead' },
          { label: 'List', value: 'list' },
          { label: 'Quote', value: 'quote' },
        ],
      },
      lead: { type: 'textarea', label: 'Body text (lead / quote)' },
      items: {
        type: 'array',
        label: 'List items (list body)',
        arrayFields: { text: { type: 'text', label: 'Item' } },
      },
      quoteBy: { type: 'text', label: 'Attribution (quote body)' },
      ctaLabel: { type: 'text', label: 'Link label (optional)' },
      ctaHref: { type: 'text', label: 'Link URL' },
      mediaSide: {
        type: 'radio',
        label: 'Media side',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      background: {
        type: 'radio',
        label: 'Background',
        options: [
          { label: 'Canvas', value: 'canvas' },
          { label: 'Accent wash', value: 'accent-wash' },
        ],
      },
      layout: blockFields().layout,
    },
    defaultProps: {
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'The origin',
      title: 'Built from a collapse',
      accentWord: 'collapse',
      body: 'lead',
      lead: 'Frequency grew out of one person rebuilding a nervous system in public. Every part of it is shaped by what actually helped.',
      items: [{ text: 'A first list item.' }],
      quoteBy: '',
      ctaLabel: 'Read the story',
      ctaHref: '#',
      mediaSide: 'left',
      background: 'canvas',
      layout: blockLayoutDefaults.layout,
    },
    render: ({ image, alt, headerFont, eyebrow, title, accentWord, body, lead, items, quoteBy, ctaLabel, ctaHref, mediaSide, background, layout }) => (
      <Band tone="none" width="wide" align="left" layout={layout as LayoutValue}>
        <ZigzagBlock
          image={image as string}
          alt={alt as string}
          headerFont={headerFont as string}
          eyebrow={eyebrow as string}
          title={title as string}
          accentWord={accentWord as string}
          body={body as ZigzagBody}
          lead={lead as string}
          items={items as { text?: string }[]}
          quoteBy={quoteBy as string}
          ctaLabel={ctaLabel as string}
          ctaHref={ctaHref as string}
          mediaSide={mediaSide as 'left' | 'right'}
          background={background as ZigzagBg}
        />
      </Band>
    ),
  },

  AccentBeat: {
    label: 'Accent beat',
    fields: {
      background: {
        type: 'radio',
        label: 'Background',
        options: [
          { label: 'Accent wash', value: 'accent-wash' },
          { label: 'Image scrim', value: 'image-scrim' },
        ],
      },
      mode: {
        type: 'select',
        label: 'Mode',
        options: [
          { label: 'Statement', value: 'statement' },
          { label: 'Call to action', value: 'cta' },
          { label: 'Quote', value: 'quote' },
        ],
      },
      image: imgField,
      alt: { type: 'text', label: 'Alt text (image scrim)' },
      headerFont: designHeaderFontField,
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Headline' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      body: { type: 'textarea', label: 'Body (optional)' },
      quoteBy: { type: 'text', label: 'Attribution (quote mode)' },
      ctaLabel: { type: 'text', label: 'Button label (CTA mode)' },
      ctaHref: { type: 'text', label: 'Button link' },
      layout: blockFields().layout,
    },
    defaultProps: {
      background: 'accent-wash',
      mode: 'cta',
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'The close',
      title: 'You were never meant to heal alone',
      accentWord: 'alone',
      body: 'A season starts every 13 weeks. The next room is already warming up.',
      quoteBy: '',
      ctaLabel: 'Find your circle',
      ctaHref: '#',
      layout: blockLayoutDefaults.layout,
    },
    render: ({ background, mode, image, alt, headerFont, eyebrow, title, accentWord, body, quoteBy, ctaLabel, ctaHref, layout }) => (
      <section className={`px-6 ${padClass(layout as LayoutValue) ?? 'py-12 sm:py-16'} ${visClass(layout as LayoutValue)}`}>
        <div className="mx-auto max-w-5xl">
          <AccentBeatBlock
            background={background as AccentBg}
            mode={mode as AccentMode}
            image={image as string}
            alt={alt as string}
            headerFont={headerFont as string}
            eyebrow={eyebrow as string}
            title={title as string}
            accentWord={accentWord as string}
            body={body as string}
            quoteBy={quoteBy as string}
            ctaLabel={ctaLabel as string}
            ctaHref={ctaHref as string}
          />
        </div>
      </section>
    ),
  },
}
