import type { ReactNode } from 'react'
import { decodeLegacyEntities, gridColumns, safeUrl } from '@/lib/entity-blocks/block-content'
import { DESIGN_ENTITY_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { BlockIcon } from './block-icon'
import {
  PhotoHeroBlock,
  EditorialSectionBlock,
  ZigzagBlock,
  AccentBeatBlock,
  DisplayHeadingBlock,
  ProseBlock,
  type BannerDisplay,
  type BannerHeight,
} from '@/components/page-editor/blocks/design'

// THE DESIGN-BLOCK ADAPTER (2026): renders the five reusable design blocks (PhotoHero / EditorialSection /
// CardGrid / Zigzag / AccentBeat) from the entity-block AUTHORED bag, so they render in the on-page rail
// arranger the same way the connected sections do. Each design component is a plain server component taking
// props (components/page-editor/blocks/design.tsx); this adapter maps the rail's authored fields onto those
// props and fills the richer Puck-only controls (variant, scrim, body mode, per-card image) with sensible
// defaults, until the arranger's field kit grows those controls. Server-safe (no hooks), FAIL-SAFE (an empty
// bag renders the component's own honest-empty state). Every value is already sanitized by
// lib/entity-blocks/block-content (strings bounded, urls made safe).

const DESIGN_SET: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

/** Whether an id is one of the five design blocks (drives the render dispatch in both render paths). */
export function isDesignBlock(id: string): boolean {
  return DESIGN_SET.has(id)
}

// EXPLANATORY DEMO CONTENT (Fix 7): a design block placed with an EMPTY authored bag would otherwise render
// blank in the rail preview and on the live page, so an operator can't tell what it is for. These per-id
// demo bags fill the empty slots with PROMPT copy ("Your headline goes here", "Button text", ...) so the
// block reads as a self-explaining template the moment it lands. As soon as the operator types real content
// into a slot, their value takes over (withDesignDemo only fills slots the bag leaves empty). Voice-canon,
// no em dashes; the copy is deliberately generic so it reads as a placeholder, not real page copy. Kept in
// lockstep with the Puck defaultProps in components/page-editor/blocks/design.tsx.
const DESIGN_DEMO: Record<string, Record<string, unknown>> = {
  photoHero: {
    eyebrow: 'Section label',
    title: 'Your headline goes here',
    subtitle: 'Add a line that says what this page is about.',
    buttonLabel: 'Button text',
  },
  editorial: {
    eyebrow: 'Section label',
    title: 'Your heading goes here',
    body: 'Tell your story in plain, honest sentences. Replace this with a paragraph or two about what you do.',
  },
  cardGrid: {
    title: 'What you offer',
    subtitle: 'A short line under the heading. Replace it or leave it blank.',
    cards: [
      { title: 'First thing', text: 'Describe one thing you offer in a sentence or two. Add a photo above.' },
      { title: 'Second thing', text: 'Describe another. Keep it plain and honest.' },
      { title: 'Third thing', text: 'One more. Add or remove cards as you need.' },
    ],
  },
  zigzag: {
    eyebrow: 'Section label',
    title: 'The story beat',
    body: 'Tell this part of the story in plain sentences. Add a photo beside it.',
  },
  accentBeat: {
    eyebrow: 'Section label',
    title: 'Your call to action',
    body: 'Add one clear line that invites the reader to take the next step.',
    buttonLabel: 'Button text',
  },
  // The two TEXT design blocks (ADR-571): a single prompt string each, so a freshly placed block explains
  // what to type. Kept in lockstep with their Puck defaultProps in design.tsx.
  displayHeading: {
    text: 'Your big heading',
  },
  prose: {
    text: 'Write a paragraph of body text here. Say what you do, in plain and honest sentences.',
  },
}

/** Whether an authored value is "present" (a non-blank string, or a non-empty array). An absent / empty
 *  value falls back to the demo prompt so the operator sees what the slot is for. */
function hasValue(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return v != null
}

/** Merge the design block's demo prompt UNDER the operator's authored bag: every slot the operator has NOT
 *  filled shows its demo prompt, every slot they HAVE filled shows their value. Pure; returns a new bag.
 *  Both render paths draw the result, so a freshly placed block explains itself and a partly-authored one
 *  keeps prompts only where the operator has not typed yet. */
export function withDesignDemo(id: string, props: Record<string, unknown>): Record<string, unknown> {
  const demo = DESIGN_DEMO[id]
  if (!demo) return props
  const out: Record<string, unknown> = { ...props }
  for (const [key, demoVal] of Object.entries(demo)) {
    if (!hasValue(out[key])) out[key] = demoVal
  }
  return out
}

function s(props: Record<string, unknown>, key: string): string | undefined {
  const v = props[key]
  // Plain-text design fields (eyebrow / title / subtitle / ...) render as React text children, so a value the
  // rich editor stored with escaped entities (`What&#39;s here`) would show the entity VERBATIM. Decode it back
  // to real characters first (safe: decodeLegacyEntities leaves genuine <b>/<a> markup alone, and the rich
  // fields that go through InlineRich re-sanitize anyway), so the live page shows the apostrophe, not `&#39;`.
  return typeof v === 'string' && v.trim() ? decodeLegacyEntities(v) : undefined
}

/** Return `v` when it is one of `allowed`, else the `fallback`. Keeps an enum primitive (height / display /
 *  font) safe even when the adapter is handed a raw, unsanitized bag. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/** The block's button LABEL, gated by its `buttonOn` toggle (Fix 8). The button ALWAYS renders once it has
 *  a label and is on (default on); the design components fall a no-link button back to '#'. Turning the
 *  toggle off (`buttonOn: false`) returns undefined so the label — and the button — drop. */
function buttonLabel(props: Record<string, unknown>): string | undefined {
  return props.buttonOn === false ? undefined : s(props, 'buttonLabel')
}

/** Map the Shape control's value (item 2) to a photo crop RATIO string for SiteImage. `original` (or any
 *  unset / unknown value) keeps the design block's own default 4/3 crop. */
function aspectRatio(v: unknown): string {
  return v === 'horizontal' ? '16/9' : v === 'vertical' ? '4/5' : v === 'square' ? '1/1' : '4/3'
}

/** Render ONE design block by id from its authored bag, or null for a non-design id. Renders the AUTHORED bag
 *  verbatim: an empty slot renders NOTHING (no demo placeholder). The demo prompts leaked onto the live page
 *  ("SECTION LABEL" under an empty eyebrow), and the owner directive is "if an eyebrow or heading is empty,
 *  show nothing." The editing surface still shows what each slot is for through its own field-label
 *  placeholders (SpaceEditableSlot), so the operator never loses the hint, and preview == published. */
export function DesignBlockView({ id, props }: { id: string; props: Record<string, unknown> }): ReactNode {
  switch (id) {
    case 'photoHero': {
      const image = safeUrl(props.image) || undefined
      // The height / display primitives (ADR-571). Already sanitized upstream, but this adapter may be
      // called with a raw bag, so gate each to its allowed set and fall back to the block's own default.
      const height = oneOf(props.height, ['short', 'medium', 'tall'], 'medium') as BannerHeight
      const display = oneOf(props.display, ['overlay', 'beside', 'below'], 'overlay') as BannerDisplay
      return (
        <PhotoHeroBlock
          variant={image ? 'image' : 'wash'}
          image={image}
          alt={s(props, 'alt')}
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          subtitle={s(props, 'subtitle')}
          height={height}
          display={display}
          actionPrimaryLabel={buttonLabel(props)}
          actionPrimaryHref={safeUrl(props.buttonUrl) || undefined}
        />
      )
    }
    case 'editorial':
      return (
        <EditorialSectionBlock
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body="prose"
          lead={s(props, 'body')}
        />
      )
    case 'cardGrid':
      // The SIMPLE block (ADR-585): a heading + subheading over a manual row of image cards, with a columns
      // choice, an image-top / image-left shape, and rounded / shadow toggles. Deliberately plain (no data
      // source, no layouts) so it reads clearly apart from the Features highlight engine. A legacy card's
      // extra fields (icon / stat / button) are ignored here; its image / title / text / link still render.
      return <SimpleCardGrid props={props} />
    case 'zigzag': {
      const image = safeUrl(props.image) || undefined
      return (
        <ZigzagBlock
          image={image}
          alt={s(props, 'alt')}
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body="lead"
          lead={s(props, 'body')}
          mediaSide={oneOf(props.mediaSide, ['left', 'right'] as const, 'left')}
          aspect={aspectRatio(props.aspect)}
          background="canvas"
        />
      )
    }
    case 'accentBeat':
      return (
        <AccentBeatBlock
          background="accent-wash"
          mode="cta"
          eyebrow={s(props, 'eyebrow')}
          title={s(props, 'title')}
          body={s(props, 'body')}
          ctaLabel={buttonLabel(props)}
          ctaHref={safeUrl(props.buttonUrl) || undefined}
        />
      )
    case 'displayHeading':
      return (
        <DisplayHeadingBlock
          text={s(props, 'text')}
          accentWord={s(props, 'accentWord')}
          font={oneOf(props.font, ['display', 'serif', 'grotesk'], 'display')}
        />
      )
    case 'prose':
      return <ProseBlock text={s(props, 'text')} />
    default:
      return null
  }
}

// ── The SIMPLE Card grid (ADR-585) ────────────────────────────────────────────────────────────────────

/** One simple card, read from the (sanitized) `cards` bag: an image (or icon fallback), a title, text, and an
 *  optional whole-card link. The legacy stat / button fields are intentionally ignored here. */
type SimpleCard = { icon: string; image: string; title: string; text: string; link: string }

function readSimpleCards(raw: unknown): SimpleCard[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>)
    .map((it) => ({
      icon: typeof it.icon === 'string' ? it.icon : '',
      image: safeUrl(it.image),
      // Decode the card's plain-text title / text so an escaped apostrophe renders as a character, not `&#39;`.
      title: typeof it.title === 'string' ? decodeLegacyEntities(it.title) : '',
      text: typeof it.text === 'string' ? decodeLegacyEntities(it.text) : '',
      link: safeUrl(it.link),
    }))
    .filter((c) => c.title || c.text || c.image)
}

/** The responsive grid-columns utility for a 2 / 3 / 4 column count (single column on mobile). */
function cardColsClass(n: 2 | 3 | 4): string {
  return n === 2 ? 'sm:grid-cols-2' : n === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
}

/** The simple Card grid: a heading + subheading over a manual grid of image cards. Columns (2/3/4), a card
 *  SHAPE (image on top or to the left), and rounded / shadow toggles are read from the bag. FAIL-SAFE:
 *  nothing to show renders null. Semantic DAWN tokens only, voice canon (no em dashes). */
function SimpleCardGrid({ props }: { props: Record<string, unknown> }): ReactNode {
  const title = s(props, 'title')
  const subtitle = s(props, 'subtitle')
  const cards = readSimpleCards(props.cards)
  const cols = gridColumns(props)
  const imageLeft = props.shape === 'left'
  const rounded = props.rounded !== false
  const shadow = props.shadow !== false
  if (!title && !subtitle && !cards.length) return null

  const round = rounded ? 'rounded-2xl' : ''
  const shade = shadow ? 'shadow-pop' : ''
  const frame = ['overflow-hidden border border-border bg-surface', round, shade].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      {(title || subtitle) && (
        <div className="space-y-1">
          {title && <h3 className="text-2xl font-bold text-text">{title}</h3>}
          {subtitle && <p className="whitespace-pre-wrap text-base leading-relaxed text-muted">{subtitle}</p>}
        </div>
      )}
      {cards.length > 0 && (
        <div className={`grid gap-6 ${cardColsClass(cols)}`}>
          {cards.map((c, i) => {
            const media = c.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator-supplied image URL (safeUrl-checked)
              <img
                src={c.image}
                alt=""
                className={imageLeft ? 'h-full w-1/3 shrink-0 object-cover' : 'aspect-[4/3] w-full object-cover'}
              />
            ) : c.icon ? (
              <div className="flex items-center px-5 pt-5 text-primary-strong" aria-hidden>
                <BlockIcon name={c.icon} size={28} />
              </div>
            ) : null
            const inner = (
              <>
                {media}
                <div className="flex flex-1 flex-col gap-1 p-5">
                  {c.title && <h4 className="text-base font-bold text-text">{c.title}</h4>}
                  {c.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{c.text}</p>}
                </div>
              </>
            )
            const cardCls = `flex ${imageLeft ? 'flex-row items-stretch' : 'flex-col'} ${frame}`
            return c.link ? (
              <a key={i} href={c.link} className={`${cardCls} transition-colors hover:border-primary`}>
                {inner}
              </a>
            ) : (
              <div key={i} className={cardCls}>
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
