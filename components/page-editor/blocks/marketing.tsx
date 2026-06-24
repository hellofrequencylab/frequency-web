// Marketing block library, three story-led blocks for the Puck page editor that
// lean on the hand-drawn illustration kit instead of photography.
//
// Keys:  RolePicker | IllustratedFeature | Manifesto
// Category: Sections
//
// Every block follows the frozen kit contract (fields -> defaultProps -> render
// threading the standard adjust controls through <Band> or its own section). All
// copy sits in the locked voice (docs/CONTENT-VOICE.md): plain sentences, proper
// nouns carry the magic, no em or en dashes, DAWN tokens only.

import {
  Band,
  Eyebrow,
  DisplayHeading,
  CtaButton,
  blockFields,
  blockLayoutDefaults,
  accentize,
  toneField,
  padClass,
  visClass,
  toneBg,
  isInk,
  layoutField,
  layoutDefault,
  type LayoutValue,
  type ComponentConfig,
} from './kit'
import { richParagraphs } from '@/lib/page-editor/richtext'
import {
  Illustration,
  illustrationNames,
  type IllustrationName,
} from '@/components/marketing/illustrations'

// Shared editor select: every block that picks art offers the full kit. Labels
// are sentence case, matching the editor's other selects.
const illustrationField = {
  type: 'select' as const,
  label: 'Illustration',
  options: illustrationNames.map((name) => ({
    label: name.charAt(0).toUpperCase() + name.slice(1),
    value: name,
  })),
}

// Fall back to a safe member of the set if an unknown value sneaks in.
function asIllustration(value: unknown): IllustrationName {
  return (illustrationNames as readonly string[]).includes(value as string)
    ? (value as IllustrationName)
    : illustrationNames[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RolePicker, 2 to 4 decision cards, each with art + a CTA
// ─────────────────────────────────────────────────────────────────────────────

type RoleCard = {
  label?: string
  blurb?: string
  illustration?: string
  ctaLabel?: string
  ctaHref?: string
}

const ROLE_COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

export function RolePickerBlock({
  eyebrow,
  title,
  titleAccent,
  cards,
  ink,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  cards?: RoleCard[]
  ink?: boolean
}) {
  const shown = (cards || []).slice(0, 4)
  const cols = ROLE_COLS[Math.min(Math.max(shown.length, 2), 4)] ?? ROLE_COLS[3]
  const cardBase = `flex flex-col rounded-3xl border p-7 ${
    ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm'
  }`
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10 text-center">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>}
        </div>
      )}
      <div className={`grid grid-cols-1 ${cols} gap-6`}>
        {shown.map((card, i) => (
          <article key={i} className={cardBase}>
            <div className="h-28 mb-5 flex items-center justify-center">
              <Illustration name={asIllustration(card.illustration)} className="h-full" />
            </div>
            {card.label && (
              <h3 className={`font-display uppercase text-2xl mb-2 ${headingColor}`}>{card.label}</h3>
            )}
            {card.blurb && (
              <p className={`text-base leading-relaxed mb-6 ${bodyColor}`}>{card.blurb}</p>
            )}
            {card.ctaLabel && card.ctaHref && (
              <div className="mt-auto">
                <CtaButton href={card.ctaHref} label={card.ctaLabel} variant="secondary" onInk={ink} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IllustratedFeature, alternating illustration + text row
// ─────────────────────────────────────────────────────────────────────────────

export function IllustratedFeatureBlock({
  illustration,
  side,
  eyebrow,
  title,
  titleAccent,
  body,
  ctaLabel,
  ctaHref,
  tone,
  layout,
}: {
  illustration?: string
  side?: 'left' | 'right'
  eyebrow?: string
  title?: string
  titleAccent?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  tone?: string
  layout?: LayoutValue
}) {
  const ink = isInk(tone)
  const reverse = side === 'right'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <section className={`px-6 ${padClass(layout) ?? 'py-16 sm:py-20'} ${toneBg(tone)} ${visClass(layout)}`}>
      <div
        className={`max-w-5xl mx-auto grid md:grid-cols-2 gap-10 lg:gap-16 items-center ${
          reverse ? 'md:[&>*:first-child]:order-2' : ''
        }`}
      >
        {/* Art column */}
        <div className="flex justify-center">
          <div
            className={`w-full max-w-sm rounded-3xl p-8 ${
              ink ? 'bg-white/5' : 'bg-marketing-canvas'
            }`}
          >
            <Illustration name={asIllustration(illustration)} className="w-full" animate />
          </div>
        </div>
        {/* Text column */}
        <div>
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && (
            <DisplayHeading ink={ink}>{accentize(title, titleAccent)}</DisplayHeading>
          )}
          {body && (
            <div className={`mt-5 text-lg leading-relaxed space-y-4 ${bodyColor}`}>
              {richParagraphs(body)}
            </div>
          )}
          {ctaLabel && ctaHref && (
            <div className="mt-8">
              <CtaButton href={ctaHref} label={ctaLabel} variant="primary" onInk={ink} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Manifesto, one big editorial statement
// ─────────────────────────────────────────────────────────────────────────────

export function ManifestoBlock({
  text,
  accent,
  tone,
  layout,
}: {
  text?: string
  accent?: string
  tone?: string
  layout?: LayoutValue
}) {
  const ink = isInk(tone)
  return (
    <section className={`px-6 ${padClass(layout) ?? 'py-28 sm:py-36'} ${toneBg(tone)} ${visClass(layout)}`}>
      <p
        className={`max-w-4xl mx-auto font-display uppercase text-balance text-4xl sm:text-6xl lg:text-7xl leading-[1.02] ${
          ink ? 'text-on-ink' : 'text-text'
        }`}
      >
        {accentize(text, accent)}
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig map, exported as marketingComponents
// ─────────────────────────────────────────────────────────────────────────────

export const marketingComponents: Record<string, ComponentConfig> = {
  // ── RolePicker ───────────────────────────────────────────────────────────────
  RolePicker: {
    label: 'Role picker',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      cards: {
        type: 'array',
        label: 'Cards (2 to 4)',
        arrayFields: {
          label: { type: 'text', label: 'Label' },
          blurb: { type: 'textarea', label: 'Blurb' },
          illustration: illustrationField,
          ctaLabel: { type: 'text', label: 'Button label' },
          ctaHref: { type: 'text', label: 'Button link' },
        },
        getItemSummary: (item: RoleCard) => item.label || 'Card',
      },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'Pick your way in',
      title: 'Where do you want to start?',
      titleAccent: '',
      cards: [
        {
          label: 'Lead',
          blurb: 'Bring people together. We hand you the format, the script, and backup.',
          illustration: 'lead',
          ctaLabel: 'Host a Circle',
          ctaHref: '/start/lead',
        },
        {
          label: 'Practice',
          blurb: 'Five minutes before your coffee. Small acts that add up over a season.',
          illustration: 'practice',
          ctaLabel: 'Start a Practice',
          ctaHref: '/start/practice',
        },
        {
          label: 'Spread',
          blurb: 'Already in? Pull a friend in too. Share your code and grow your Circle.',
          illustration: 'spread',
          ctaLabel: 'Invite someone',
          ctaHref: '/start/spread',
        },
      ],
      ...blockLayoutDefaults,
      align: 'center',
    },
    render: ({ eyebrow, title, titleAccent, cards, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <RolePickerBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          cards={cards as RoleCard[]}
          ink={isInk(tone as string)}
        />
      </Band>
    ),
  },

  // ── IllustratedFeature ───────────────────────────────────────────────────────
  IllustratedFeature: {
    label: 'Illustrated feature',
    fields: {
      illustration: illustrationField,
      side: {
        type: 'radio',
        label: 'Illustration side',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Title' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      body: { type: 'textarea', label: 'Body (**bold**, *italic*, [link](/path))' },
      ctaLabel: { type: 'text', label: 'CTA label (optional)' },
      ctaHref: { type: 'text', label: 'CTA link (optional)' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      illustration: 'circle',
      side: 'left',
      eyebrow: 'How it works',
      title: 'A small room, near you',
      titleAccent: 'room',
      body: 'A Circle is a handful of people who meet, week after week. No app to scroll. Just a time, a place, and the people who show up.',
      ctaLabel: '',
      ctaHref: '',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ illustration, side, eyebrow, title, titleAccent, body, ctaLabel, ctaHref, tone, layout }) => (
      <IllustratedFeatureBlock
        illustration={illustration as string}
        side={side as 'left' | 'right'}
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        body={(body as string) || undefined}
        ctaLabel={(ctaLabel as string) || undefined}
        ctaHref={(ctaHref as string) || undefined}
        tone={tone as string}
        layout={layout as LayoutValue}
      />
    ),
  },

  // ── Manifesto ────────────────────────────────────────────────────────────────
  Manifesto: {
    label: 'Manifesto',
    fields: {
      text: { type: 'textarea', label: 'Statement' },
      accent: { type: 'text', label: 'Accent word (optional)' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      text: 'The answer to the loneliest era in history is a folding chair with your name on it.',
      accent: 'folding chair',
      tone: 'ink',
      layout: layoutDefault,
    },
    render: ({ text, accent, tone, layout }) => (
      <ManifestoBlock
        text={(text as string) || undefined}
        accent={(accent as string) || undefined}
        tone={(tone === 'none' ? 'surface' : tone) as string}
        layout={layout as LayoutValue}
      />
    ),
  },
}
