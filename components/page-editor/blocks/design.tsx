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
import Image from 'next/image'
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
  className,
}: {
  title?: string
  accentWord?: string
  headerFont?: string
  size?: 'default' | 'lg'
  as?: 'h1' | 'h2' | 'h3'
  /** Override the default warm-text color (e.g. `text-on-ink` when the heading sits over a photo scrim). */
  className?: string
}) {
  if (!title) return null
  // Fluid scale mirrors the kit DisplayHeading so a design block sits in the same type rhythm.
  const scale =
    size === 'lg'
      ? 'text-[clamp(2rem,7vw,4.5rem)] leading-[0.95]'
      : 'text-[clamp(1.875rem,5.5vw,3rem)]'
  // The color token defaults to warm text; a caller can swap it (on-ink over a photo) via `className`.
  const color = className ?? 'text-text'
  return (
    <Tag className={`font-display uppercase text-balance ${color} ${scale}`} style={headerFontStyle(headerFont)}>
      {accentWord ? accentize(title, accentWord) : title}
    </Tag>
  )
}

// ── The header-font field group, shared by every design block. ──
const designHeaderFontField = headerFontField

// ─────────────────────────────────────────────────────────────────────────────
// 01 · Banner (stored id `photoHero`) — the bold IN-PAGE opener (2026 → ADR-571).
// A large photograph carries the eyebrow / headline / subtitle / actions in one of THREE content layouts:
//   • overlay — copy OVER the photo, centered, on a legibility scrim (the profile-cover pattern).
//   • beside  — the photo framed beside a text column (theme tokens, no scrim).
//   • below   — the photo on top with the copy below it (theme tokens, no scrim).
// `height` (short | medium | tall) sizes the OVERLAY / wash section; the beside/below layouts size the framed
// photo instead. `variant` image | wash | text-only; no image falls back to a warm accent wash and the copy
// reads in theme tokens. `scrim` picks how heavy the ink veil is over an overlay photo.
// ─────────────────────────────────────────────────────────────────────────────

type PhotoHeroVariant = 'image' | 'wash' | 'text-only'
type ScrimStep = 'light' | 'medium'
/** How the copy sits relative to the photo (ADR-571 task 3). */
export type BannerDisplay = 'overlay' | 'beside' | 'below'
/** The section height for the overlay / wash layout (ADR-571 task 2). */
export type BannerHeight = 'short' | 'medium' | 'tall'

// The ink gradient scrim under the overlaid copy, at two strengths, so an on-ink headline clears the WCAG
// ≥4.5:1 floor on any cover. Tokens only (ink), never a hardcoded hex — mirrors the profile cover hero.
const SCRIM_CLASS: Record<ScrimStep, string> = {
  light: 'from-ink/75 via-ink/35 to-ink/20',
  medium: 'from-ink/90 via-ink/55 to-ink/30',
}

// The three OVERLAY / wash heights, as a token-only min-height pair (mobile floor → sm-and-up). Short reads
// as a compact banner, tall as a near-full-viewport hero.
const BANNER_HEIGHT_CLASS: Record<BannerHeight, string> = {
  short: 'min-h-[40vh] py-16 sm:min-h-[45vh] sm:py-20',
  medium: 'min-h-[55vh] py-20 sm:min-h-[60vh] sm:py-28',
  tall: 'min-h-[70vh] py-24 sm:min-h-[80vh] sm:py-32',
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
  height = 'tall',
  display = 'overlay',
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
  height?: BannerHeight
  display?: BannerDisplay
  headerFont?: string
  layout?: LayoutValue
}) {
  const hasImage = variant === 'image' && !!image
  // A no-link button still renders (buttons always show once labelled) — the operator wires the link
  // later, so a blank href falls back to '#'. Only an empty label hides a button.
  const hasActions = !!(actionPrimaryLabel || actionSecondaryLabel)

  // The beside / below layouts read in the warm theme tokens (no scrim); only overlay-on-a-photo goes on-ink.
  const onInk = hasImage && display === 'overlay'
  const actions = hasActions ? (
    <div className={`mt-8 flex flex-wrap items-center gap-3 ${display === 'overlay' ? 'justify-center' : ''}`}>
      {actionPrimaryLabel && (
        <CtaButton href={actionPrimaryHref || '#'} label={actionPrimaryLabel} variant="primary" />
      )}
      {actionSecondaryLabel && (
        <CtaButton href={actionSecondaryHref || '#'} label={actionSecondaryLabel} variant="secondary" />
      )}
    </div>
  ) : null

  const headingCls = onInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : undefined
  const subtitleCls = onInk ? 'text-on-ink-muted' : 'text-muted'

  const copy = (centered: boolean) => (
    <>
      {eyebrow && <Eyebrow ink={onInk}>{eyebrow}</Eyebrow>}
      <DesignHeading
        title={title}
        accentWord={accentWord}
        headerFont={headerFont}
        size="lg"
        as="h1"
        className={headingCls}
      />
      {subtitle && (
        <p className={`mt-5 max-w-xl text-lg ${centered ? 'mx-auto' : ''} ${subtitleCls}`}>{subtitle}</p>
      )}
      {actions}
    </>
  )

  // ── beside / below: a framed photo next to (or above) the copy, theme tokens, no scrim. ──
  if (display !== 'overlay') {
    const framedMedia = hasImage ? (
      <div className="overflow-hidden rounded-2xl border border-border shadow-pop">
        <SiteImage src={image!} alt={alt ?? ''} aspect="4/3" className="w-full" />
      </div>
    ) : (
      <div className="aspect-[4/3] w-full rounded-2xl border border-border bg-primary-bg" aria-hidden />
    )
    if (display === 'beside') {
      return (
        <section className={`rounded-2xl ${padClass(layout) ?? ''} ${visClass(layout)}`}>
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
            {framedMedia}
            <div>{copy(false)}</div>
          </div>
        </section>
      )
    }
    // below
    return (
      <section className={`rounded-2xl ${padClass(layout) ?? ''} ${visClass(layout)}`}>
        {framedMedia}
        <div className="mt-8 text-center">{copy(true)}</div>
      </section>
    )
  }

  // ── overlay (default): copy centered over the photo / wash, sized by `height`. ──
  return (
    <section className={`relative overflow-hidden rounded-2xl ${padClass(layout) ?? ''} ${visClass(layout)}`}>
      {hasImage ? (
        <>
          {/* Full-bleed photo fills the section (next/image `fill` + object-cover, the profile cover
              pattern); alt is required in the editor. The ink gradient scrim sits over it so the overlaid
              on-ink copy stays legible on any image. */}
          <Image src={image!} alt={alt ?? ''} fill sizes="100vw" preload className="object-cover" />
          <div className={`absolute inset-0 bg-gradient-to-t ${SCRIM_CLASS[scrim]}`} aria-hidden />
        </>
      ) : (
        // No image (or the wash / text-only variants): a warm accent wash fills the section, copy in theme
        // tokens. text-only reads as a calmer surface opener; both still stand tall as a real hero.
        <div className={`absolute inset-0 ${variant === 'text-only' ? 'bg-surface' : 'bg-primary-bg'}`} aria-hidden />
      )}
      <div
        className={`relative z-10 mx-auto flex max-w-3xl flex-col items-center justify-center px-6 text-center ${BANNER_HEIGHT_CLASS[height]}`}
      >
        {copy(true)}
      </div>
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
  // Email overhaul additions (rendered here too): a STAT box (a big number + label), a whole-card link, and a
  // separate button. All optional + additive, so a legacy { icon, title, body } card renders exactly as before.
  stat?: { value?: string; label?: string }
  href?: string
  button?: { label?: string; href?: string }
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
  const shown = (cards ?? []).filter(
    (c) => c?.title || c?.body || c?.image || c?.by || c?.stat?.value || c?.stat?.label,
  )
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
              {/* A photo card shows its image on top whenever one is set (email overhaul: not only the
                  media / testimonial roles). */}
              {card.image && <SiteImage src={card.image} alt={card.alt ?? ''} aspect="4/3" className="w-full" />}
              <div className="flex flex-1 flex-col gap-3 p-6">
                {/* A STAT box (email overhaul): a big number + a label, shown when the card carries a stat and
                    no photo (a metric card, styled apart from a photo card). */}
                {!card.image && (card.stat?.value || card.stat?.label) && (
                  <div>
                    {card.stat?.value && <div className="font-display text-4xl leading-none text-primary-strong">{card.stat.value}</div>}
                    {card.stat?.label && (
                      <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-subtle">{card.stat.label}</div>
                    )}
                  </div>
                )}
                {role === 'feature' && !card.image && !card.stat?.value && card.icon && (
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
                    {/* A whole-card link (email overhaul) applies to the title, so the card stays a single, valid
                        link even when it also has its own button. */}
                    {safeHref(card.href) ? (
                      <Link href={safeHref(card.href) || '#'} className="transition-colors hover:text-primary-strong">
                        {card.title}
                      </Link>
                    ) : (
                      card.title
                    )}
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
                {card.button?.label && (
                  <div className="mt-auto pt-1">
                    <CtaButton href={safeHref(card.button.href) || '#'} label={card.button.label} variant="secondary" withArrow={false} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {/* Browse link shows once labelled; a missing link falls back to '#' until the operator sets one. */}
      {browseLabel && (
        <div className="mt-10">
          <Link
            href={browseSafe || '#'}
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
  aspect = '4/3',
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
  /** The photo crop ratio (item 2 Shape control), e.g. "4/3" | "16/9" | "4/5" | "1/1". Defaults to the
   *  classic 4/3 so an unset value looks exactly as before. */
  aspect?: string
}) {
  const ctaSafe = safeHref(ctaHref)
  const list = (items ?? []).map((it) => it?.text).filter((t): t is string => !!t)

  const media = image ? (
    <div className="overflow-hidden rounded-[1.25rem] border border-border shadow-pop">
      <SiteImage src={image} alt={alt ?? ''} aspect={aspect} className="w-full" />
    </div>
  ) : (
    <div className="w-full rounded-[1.25rem] border border-border bg-primary-bg" style={{ aspectRatio: aspect }} aria-hidden />
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
      {/* Link shows once labelled; a missing link falls back to '#' until the operator sets one. */}
      {ctaLabel && (
        <Link
          href={ctaSafe || '#'}
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
      {/* Buttons always show once labelled (a no-link button falls back to '#' until the operator sets a
          link); only a blank label hides the CTA. */}
      {mode === 'cta' && ctaLabel && (
        <div className="mt-8">
          <CtaButton href={ctaSafe || '#'} label={ctaLabel} variant="primary" />
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
// 06 · DisplayHeading — a large standalone DISPLAY title (ADR-571). The deliberate "big heading" text block:
// an Anton (or serif / grotesk) display face at a bold clamp scale. Distinct from the plain member Heading
// content block, which is a small semantic h2. The rail's C1 text-style bag layers size / weight / color /
// shadow on top through the BlockStyleFrame; this component owns the base display treatment + font choice.
// ─────────────────────────────────────────────────────────────────────────────

export function DisplayHeadingBlock({
  text,
  accentWord,
  font,
}: {
  text?: string
  accentWord?: string
  /** A validated header-font id (headerFontStyle falls any unknown value back to the Anton display stack). */
  font?: string
}) {
  if (!text) return null
  return (
    <h2
      className="font-display text-[clamp(2rem,6vw,3.75rem)] uppercase leading-[0.95] text-balance text-text"
      style={headerFontStyle(font)}
    >
      {accentWord ? accentize(text, accentWord) : text}
    </h2>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 07 · Prose — a styled body PARAGRAPH (ADR-571). The deliberate "body text" block: a comfortable reading
// measure (~62ch) at a relaxed leading, splitting on blank lines into paragraphs. Distinct from the plain
// member Text block, which is a single muted paragraph. The C1 text-style bag layers size / weight / color /
// shadow on top through the BlockStyleFrame.
// ─────────────────────────────────────────────────────────────────────────────

export function ProseBlock({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="max-w-[62ch] space-y-4 text-lg leading-relaxed text-muted">{richParagraphs(text)}</div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT CONFIGS — registered in BOTH the shared block library (lib/page-editor/config.tsx) under
// the "Blocks" category and consumed by the public <Render>. Every block threads the standard
// blockFields() adjust controls through <Band> (or its own <section>) and offers the per-header font.
// ─────────────────────────────────────────────────────────────────────────────

export const designComponents: Record<string, ComponentConfig> = {
  // The stored component-type key stays `PhotoHero` (existing pages keep rendering); only the operator-facing
  // label is now "Banner" so it never reads like the profile "Top Page hero" (ADR-571). Height (task 2) and
  // Content layout (task 3) join the field set.
  PhotoHero: {
    label: 'Banner',
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
      height: {
        type: 'radio',
        label: 'Height',
        options: [
          { label: 'Short', value: 'short' },
          { label: 'Medium', value: 'medium' },
          { label: 'Tall', value: 'tall' },
        ],
      },
      display: {
        type: 'select',
        label: 'Content',
        options: [
          { label: 'Over photo', value: 'overlay' },
          { label: 'Beside photo', value: 'beside' },
          { label: 'Below photo', value: 'below' },
        ],
      },
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
    // Demo defaults that EXPLAIN each slot (Fix 7): the copy reads as a prompt, not real marketing, so an
    // operator sees at a glance what goes where and replaces it. Voice-canon, no em dashes.
    defaultProps: {
      variant: 'image',
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'Section label',
      title: 'Your headline goes here',
      accentWord: 'headline',
      subtitle: 'Add a line that says what this page is about.',
      height: 'tall',
      display: 'overlay',
      scrim: 'light',
      actionPrimaryLabel: 'Button text',
      actionPrimaryHref: '',
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
      height,
      display,
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
        height={height as BannerHeight}
        display={display as BannerDisplay}
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
    // Demo defaults that EXPLAIN each slot (Fix 7): prompt copy, not real marketing.
    defaultProps: {
      headerFont: headerFontDefault,
      eyebrow: 'Section label',
      title: 'Your heading goes here',
      accentWord: 'heading',
      kicker: '',
      body: 'lead',
      surface: 'open',
      lead: 'Tell your story in plain, honest sentences. Replace this with a paragraph or two about what you do.',
      stats: [
        { value: '100+', label: 'What you count' },
        { value: '12', label: 'Another number' },
        { value: '5', label: 'One more' },
      ],
      faqs: [{ q: 'A question people ask you?', a: 'A plain, honest answer.' }],
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
    // Demo defaults that EXPLAIN each slot (Fix 7): each card prompts what to write in it.
    defaultProps: {
      headerFont: headerFontDefault,
      eyebrow: 'Section label',
      title: 'What you offer',
      accentWord: 'offer',
      role: 'feature',
      columns: 3,
      cards: [
        { icon: '◎', title: 'First thing', body: 'Describe one thing you offer in a sentence or two.' },
        { icon: '△', title: 'Second thing', body: 'Describe another. Keep it plain and honest.' },
        { icon: '↗', title: 'Third thing', body: 'One more. Add or remove cards as you need.' },
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
    // Demo defaults that EXPLAIN each slot (Fix 7): prompt copy beside a placeholder photo frame.
    defaultProps: {
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'Section label',
      title: 'The story beat',
      accentWord: 'story',
      body: 'lead',
      lead: 'Tell this part of the story in plain sentences. Add a photo on the left, or flip it to the right.',
      items: [{ text: 'A first list item.' }],
      quoteBy: '',
      ctaLabel: 'Button text',
      ctaHref: '',
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
    // Demo defaults that EXPLAIN each slot (Fix 7): a prompt call to action, not real marketing.
    defaultProps: {
      background: 'accent-wash',
      mode: 'cta',
      image: '',
      alt: '',
      headerFont: headerFontDefault,
      eyebrow: 'Section label',
      title: 'Your call to action',
      accentWord: 'action',
      body: 'Add one clear line that invites the reader to take the next step.',
      quoteBy: '',
      ctaLabel: 'Button text',
      ctaHref: '',
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

  // The two TEXT design blocks (ADR-571), also offered in the Puck library so both editors carry them.
  DisplayHeading: {
    label: 'Display heading',
    fields: {
      font: {
        type: 'select',
        label: 'Font',
        options: [
          { label: 'Display', value: 'display' },
          { label: 'Serif', value: 'serif' },
          { label: 'Grotesk', value: 'grotesk' },
        ],
      },
      text: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
    },
    // Demo defaults that EXPLAIN the slot (Fix 7): prompt copy, not real marketing.
    defaultProps: {
      font: 'display',
      text: 'Your big heading',
      accentWord: 'big',
    },
    render: ({ font, text, accentWord }) => (
      <Band tone="none" width="wide" align="left">
        <DisplayHeadingBlock text={text as string} accentWord={accentWord as string} font={font as string} />
      </Band>
    ),
  },

  Prose: {
    label: 'Text Block',
    fields: {
      text: { type: 'textarea', label: 'Paragraph' },
    },
    defaultProps: {
      text: 'Write a paragraph of body text here. Say what you do, in plain and honest sentences.',
    },
    render: ({ text }) => (
      <Band tone="none" width="wide" align="left">
        <ProseBlock text={text as string} />
      </Band>
    ),
  },
}
