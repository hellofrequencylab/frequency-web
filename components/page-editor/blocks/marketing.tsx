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
import {
  emphasisField,
  emphasisDefault,
  emphasisClasses,
  cardStyleField,
  cardStyleDefault,
  cardStyleClass,
  densityField,
  densityDefault,
  densityClasses,
  type EmphasisValue,
  type CardStyleValue,
  type DensityValue,
} from '@/lib/page-editor/fields'
import { richParagraphs } from '@/lib/page-editor/richtext'
import {
  Illustration,
  illustrationNames,
  type IllustrationName,
} from '@/components/marketing/illustrations'
import {
  LeadFunnelFlow,
  LEAD_FUNNEL_STEPS,
  type LeadFunnelOrientation,
} from '@/components/marketing/lead-funnel-flow'

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
  emphasis,
  cardStyle,
  density,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  cards?: RoleCard[]
  ink?: boolean
  emphasis?: EmphasisValue
  cardStyle?: CardStyleValue
  density?: DensityValue
}) {
  const shown = (cards || []).slice(0, 4)
  const cols = ROLE_COLS[Math.min(Math.max(shown.length, 2), 4)] ?? ROLE_COLS[3]
  const { scale, accent } = emphasisClasses(emphasis)
  const { gap, pad } = densityClasses(density)
  const cardBase = `flex flex-col ${pad} ${cardStyleClass(cardStyle, ink)}`
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10 text-center">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && (
            <h2 className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}>
              {accentize(title, titleAccent)}
            </h2>
          )}
        </div>
      )}
      <div className={`grid grid-cols-1 ${cols} ${gap}`}>
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
  emphasis,
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
  emphasis?: EmphasisValue
}) {
  const ink = isInk(tone)
  const reverse = side === 'right'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'
  const { scale, accent } = emphasisClasses(emphasis)

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
            <h2 className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}>
              {accentize(title, titleAccent)}
            </h2>
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
  emphasis,
}: {
  text?: string
  accent?: string
  tone?: string
  layout?: LayoutValue
  emphasis?: EmphasisValue
}) {
  const ink = isInk(tone)
  const { scale, accent: accentClass } = emphasisClasses(emphasis)
  // Emphasis accent recolors the whole statement; fall back to the band's
  // default ink/text colour when the accent tone is 'none'. The accent *word*
  // (via accentize) still carries the brand primary on top of this base.
  const textColor = accentClass || (ink ? 'text-on-ink' : 'text-text')
  return (
    <section className={`px-6 ${padClass(layout) ?? 'py-28 sm:py-36'} ${toneBg(tone)} ${visClass(layout)}`}>
      <p className={`max-w-4xl mx-auto font-display uppercase text-balance ${scale} ${textColor}`}>
        {accentize(text, accent)}
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LeadFunnel, the coach lead funnel composed from the kit elements
// ─────────────────────────────────────────────────────────────────────────────

// An editor step: illustration key + editable label/caption. Kept loose (all
// optional) because the array editor can hand back partial rows mid-edit.
type LeadFunnelStepInput = {
  illustration?: string
  label?: string
  caption?: string
}

export function LeadFunnelBlock({
  eyebrow,
  title,
  titleAccent,
  steps,
  orientation,
  showNumbers,
  footnote,
  ink,
  emphasis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  steps?: LeadFunnelStepInput[]
  orientation?: LeadFunnelOrientation
  showNumbers?: boolean
  footnote?: string
  ink?: boolean
  emphasis?: EmphasisValue
}) {
  // Normalise editor rows to the flow's shape; drop blank rows and fall back to
  // the canonical five if the operator cleared them all.
  const cleaned = (steps || [])
    .filter((s) => s && (s.illustration || s.label || s.caption))
    .map((s) => ({
      illustration: asIllustration(s.illustration),
      label: s.label || '',
      caption: s.caption || '',
    }))
  const list = cleaned.length ? cleaned : undefined
  const { scale, accent } = emphasisClasses(emphasis)

  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10 text-center">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && (
            <h2 className={`font-display uppercase text-balance ${scale} ${accent || (ink ? 'text-on-ink' : 'text-text')}`}>
              {accentize(title, titleAccent)}
            </h2>
          )}
        </div>
      )}
      <LeadFunnelFlow steps={list} orientation={orientation} showNumbers={showNumbers} />
      {footnote && (
        <p className={`mx-auto mt-8 max-w-2xl text-center text-sm ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
          {footnote}
        </p>
      )}
    </div>
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
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      cards: {
        type: 'array',
        label: 'Cards (2 to 4)',
        arrayFields: {
          label: { type: 'textarea', label: 'Label' },
          blurb: { type: 'textarea', label: 'Blurb' },
          illustration: illustrationField,
          ctaLabel: { type: 'text', label: 'Button label' },
          ctaHref: { type: 'text', label: 'Button link' },
        },
        getItemSummary: (item: RoleCard) => item.label || 'Card',
      },
      emphasis: emphasisField,
      cardStyle: cardStyleField,
      density: densityField,
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
      emphasis: emphasisDefault,
      cardStyle: cardStyleDefault,
      density: densityDefault,
      ...blockLayoutDefaults,
      align: 'center',
    },
    render: ({ eyebrow, title, titleAccent, cards, emphasis, cardStyle, density, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <RolePickerBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          cards={cards as RoleCard[]}
          ink={isInk(tone as string)}
          emphasis={emphasis as EmphasisValue}
          cardStyle={cardStyle as CardStyleValue}
          density={density as DensityValue}
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
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Title' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      body: { type: 'textarea', label: 'Body (**bold**, *italic*, [link](/path))' },
      ctaLabel: { type: 'text', label: 'CTA label (optional)' },
      ctaHref: { type: 'text', label: 'CTA link (optional)' },
      emphasis: emphasisField,
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
      emphasis: emphasisDefault,
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ illustration, side, eyebrow, title, titleAccent, body, ctaLabel, ctaHref, emphasis, tone, layout }) => (
      <IllustratedFeatureBlock
        illustration={illustration as string}
        side={side as 'left' | 'right'}
        eyebrow={(eyebrow as string) || undefined}
        title={(title as string) || undefined}
        titleAccent={(titleAccent as string) || undefined}
        body={(body as string) || undefined}
        ctaLabel={(ctaLabel as string) || undefined}
        ctaHref={(ctaHref as string) || undefined}
        emphasis={emphasis as EmphasisValue}
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
      emphasis: emphasisField,
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      text: 'The answer to the loneliest era in history is a folding chair with your name on it.',
      accent: 'folding chair',
      emphasis: { scale: 'lg', accent: 'none' },
      tone: 'ink',
      layout: layoutDefault,
    },
    render: ({ text, accent, emphasis, tone, layout }) => (
      <ManifestoBlock
        text={(text as string) || undefined}
        accent={(accent as string) || undefined}
        emphasis={emphasis as EmphasisValue}
        tone={(tone === 'none' ? 'surface' : tone) as string}
        layout={layout as LayoutValue}
      />
    ),
  },

  // ── LeadFunnel ───────────────────────────────────────────────────────────────
  LeadFunnel: {
    label: 'Lead funnel',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      orientation: {
        type: 'radio',
        label: 'Direction',
        options: [
          { label: 'Horizontal', value: 'horizontal' },
          { label: 'Vertical', value: 'vertical' },
        ],
      },
      showNumbers: {
        type: 'radio',
        label: 'Step numbers',
        options: [
          { label: 'Show', value: true },
          { label: 'Hide', value: false },
        ],
      },
      steps: {
        type: 'array',
        label: 'Steps',
        arrayFields: {
          illustration: illustrationField,
          label: { type: 'textarea', label: 'Label' },
          caption: { type: 'textarea', label: 'Caption' },
        },
        getItemSummary: (item: LeadFunnelStepInput) => item.label || 'Step',
      },
      footnote: { type: 'textarea', label: 'Footnote (optional)' },
      emphasis: emphasisField,
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'How it works',
      title: 'The coach lead funnel',
      titleAccent: 'lead funnel',
      orientation: 'horizontal',
      showNumbers: true,
      steps: LEAD_FUNNEL_STEPS.map((s) => ({ ...s })),
      footnote:
        'Found on your Spotlight page, booked online, saved to your CRM, followed up automatically, and tracked to booked.',
      emphasis: emphasisDefault,
      ...blockLayoutDefaults,
      align: 'center',
    },
    render: ({ eyebrow, title, titleAccent, orientation, showNumbers, steps, footnote, emphasis, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <LeadFunnelBlock
          eyebrow={(eyebrow as string) || undefined}
          title={(title as string) || undefined}
          titleAccent={(titleAccent as string) || undefined}
          orientation={orientation as LeadFunnelOrientation}
          showNumbers={showNumbers as boolean}
          steps={steps as LeadFunnelStepInput[]}
          footnote={(footnote as string) || undefined}
          ink={isInk(tone as string)}
          emphasis={emphasis as EmphasisValue}
        />
      </Band>
    ),
  },
}
