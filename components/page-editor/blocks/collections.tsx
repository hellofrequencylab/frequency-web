// Collections block library — repeating-item sections for the Puck page editor.
// All five blocks follow the frozen kit contract: presentational component +
// ComponentConfig with fields → defaultProps → render threading adjust controls
// through <Band>. See components/page-editor/blocks/kit.tsx for the contract.

import Link from 'next/link'
import { Check, Award, Users, MapPin, CalendarDays, Sparkles, Heart, MessageCircle, Compass, Flame, Star, Shield, Coffee, Music, Sun, Leaf, Handshake, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentConfig } from '@measured/puck'

import {
  Band,
  Eyebrow,
  DisplayHeading,
  Kicker,
  blockFields,
  blockLayoutDefaults,
  accentize,
  visClass,
  type LayoutValue,
} from '@/components/page-editor/blocks/kit'
import { imgField, isInk } from '@/lib/page-editor/fields'
import { richParagraphs } from '@/lib/page-editor/richtext'
import { SiteImage } from '@/components/marketing/site-image'
import { Stat, FaqList, Marquee } from '@/components/marketing/marketing-ui'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const GRID_COLS: Record<string, string> = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
}
function gridCols(cols?: string): string {
  return GRID_COLS[cols ?? '3'] ?? GRID_COLS['3']
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FeatureGrid
// ─────────────────────────────────────────────────────────────────────────────

// Curated icon map — 16 lucide icons available in the editor select.
const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  MapPin,
  CalendarDays,
  Sparkles,
  Heart,
  MessageCircle,
  Compass,
  Flame,
  Star,
  Shield,
  Coffee,
  Music,
  Sun,
  Leaf,
  Handshake,
  Zap,
}

type FeatureItem = {
  icon?: string
  image?: string
  title?: string
  body?: string
  href?: string
}

export function FeatureGridBlock({
  eyebrow,
  title,
  style,
  columns,
  items,
  ink,
}: {
  eyebrow?: string
  title?: React.ReactNode
  style?: 'icon' | 'image' | 'number'
  columns?: string
  items?: FeatureItem[]
  ink?: boolean
}) {
  const cols = gridCols(columns)
  const cardBase = `rounded-2xl border ${ink ? 'border-white/10 bg-white/5' : 'border-border bg-surface shadow-sm'} overflow-hidden`
  const headingColor = ink ? 'text-on-ink' : 'text-text'
  const bodyColor = ink ? 'text-on-ink-muted' : 'text-muted'

  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{title}</DisplayHeading>}
        </div>
      )}
      <div className={`grid grid-cols-1 ${cols} gap-6`}>
        {(items || []).map((item, i) => {
          const IconComp = item.icon ? ICON_MAP[item.icon] : null

          if (style === 'image') {
            return (
              <article key={i} className={cardBase}>
                {item.image && (
                  <SiteImage
                    src={item.image}
                    alt={item.title || ''}
                    aspect="16/9"
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                )}
                <div className="p-6">
                  {item.title && <h3 className={`text-xl font-bold mb-2 ${headingColor}`}>{item.title}</h3>}
                  {item.body && <div className={`text-base leading-relaxed space-y-3 ${bodyColor}`}>{richParagraphs(item.body)}</div>}
                  {item.href && (
                    <Link href={item.href} className={`mt-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${ink ? 'text-primary' : 'text-primary-strong'} hover:underline`}>
                      Learn more <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </article>
            )
          }

          if (style === 'number') {
            const num = String(i + 1).padStart(2, '0')
            return (
              <article key={i} className={`${cardBase} p-7`}>
                <p className={`font-display text-5xl mb-5 ${ink ? 'text-white/20' : 'text-text/10'}`}>{num}</p>
                {item.title && <h3 className={`text-xl font-bold mb-2 ${headingColor}`}>{item.title}</h3>}
                {item.body && <div className={`text-base leading-relaxed space-y-3 ${bodyColor}`}>{richParagraphs(item.body)}</div>}
                {item.href && (
                  <Link href={item.href} className={`mt-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${ink ? 'text-primary' : 'text-primary-strong'} hover:underline`}>
                    Learn more <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                )}
              </article>
            )
          }

          // Default: icon style
          return (
            <article key={i} className={`${cardBase} p-7`}>
              {IconComp && (
                <div className="w-11 h-11 rounded-2xl bg-primary-bg text-primary-strong flex items-center justify-center mb-5">
                  <IconComp className="w-5 h-5" aria-hidden />
                </div>
              )}
              {item.title && <h3 className={`text-xl font-bold mb-2 ${headingColor}`}>{item.title}</h3>}
              {item.body && <div className={`text-base leading-relaxed space-y-3 ${bodyColor}`}>{richParagraphs(item.body)}</div>}
              {item.href && (
                <Link href={item.href} className={`mt-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${ink ? 'text-primary' : 'text-primary-strong'} hover:underline`}>
                  Learn more <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </Link>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. StatRow
// ─────────────────────────────────────────────────────────────────────────────

type StatItem = { value?: string; label?: string }

export function StatRowBlock({
  eyebrow,
  title,
  columns,
  items,
  ink,
}: {
  eyebrow?: string
  title?: React.ReactNode
  columns?: string
  items?: StatItem[]
  ink?: boolean
}) {
  const cols = gridCols(columns)
  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{title}</DisplayHeading>}
        </div>
      )}
      <div className={`grid grid-cols-1 ${cols} gap-8`}>
        {(items || []).map((item, i) => (
          <Stat key={i} value={item.value ?? ''} label={item.label ?? ''} tone={ink ? 'ink' : 'light'} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Accordion
// ─────────────────────────────────────────────────────────────────────────────

type AccordionItem = { q?: string; a?: string }

export function AccordionBlock({
  eyebrow,
  title,
  items,
  ink,
}: {
  eyebrow?: string
  title?: React.ReactNode
  items?: AccordionItem[]
  ink?: boolean
}) {
  const faqItems = (items || []).map((item) => ({
    q: item.q ?? '',
    a: richParagraphs(item.a),
  }))

  return (
    <div>
      {(eyebrow || title) && (
        <div className="mb-10">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{title}</DisplayHeading>}
        </div>
      )}
      <FaqList items={faqItems} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Checklist
// ─────────────────────────────────────────────────────────────────────────────

type CheckItem = { text?: string }

export function ChecklistBlock({
  title,
  columns,
  items,
  ink,
}: {
  title?: React.ReactNode
  columns?: string
  items?: CheckItem[]
  ink?: boolean
}) {
  const cols = columns === '2' ? 'sm:grid-cols-2' : 'grid-cols-1'
  const textColor = ink ? 'text-on-ink' : 'text-text'

  return (
    <div>
      {title && (
        <div className="mb-8">
          <DisplayHeading ink={ink}>{title}</DisplayHeading>
        </div>
      )}
      <ul className={`grid grid-cols-1 ${cols} gap-4`}>
        {(items || []).map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 w-6 h-6 rounded-lg bg-primary-bg text-primary-strong flex items-center justify-center">
              <Check className="w-3.5 h-3.5" aria-hidden />
            </span>
            <span className={`text-base leading-relaxed ${textColor}`}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Showcase  (replaces the content-named "Pillars" block)
// ─────────────────────────────────────────────────────────────────────────────

type ShowcaseItem = {
  image?: string
  title?: string
  body?: string
  href?: string
  side?: 'left' | 'right'
}

export function ShowcaseBlock({
  marqueeItems,
  items,
}: {
  marqueeItems?: { text?: string }[]
  items?: ShowcaseItem[]
}) {
  const marqueeTxts = (marqueeItems || []).map((m) => m.text || '').filter(Boolean)

  return (
    <section className="relative bg-slat">
      <div className="light-strip absolute inset-x-0 top-0 z-10" />
      {marqueeTxts.length > 0 && <Marquee items={marqueeTxts} />}
      <div className="max-w-5xl mx-auto px-6 py-24 sm:py-28 space-y-24 sm:space-y-28">
        {(items || []).map((p, i) => {
          const reverse = p.side === 'right'
          return (
            <div
              key={i}
              className={`flex flex-col items-center sm:items-stretch sm:flex-row ${reverse ? 'sm:flex-row-reverse' : ''}`}
            >
              <div className="relative w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full overflow-hidden border-4 border-white/10 shrink-0">
                <Image
                  src={p.image || '/images/site/lab-storefront.jpg'}
                  alt={p.title || ''}
                  fill
                  sizes="(min-width: 640px) 32rem, 20rem"
                  className="object-cover"
                />
              </div>
              <div className={`relative z-10 flex flex-col justify-center max-w-md -mt-12 sm:mt-0 ${reverse ? 'sm:-mr-20' : 'sm:-ml-20'}`}>
                <h3 className="font-display uppercase text-white text-4xl sm:text-5xl mb-5 px-2 text-center sm:text-left">
                  {p.title}
                </h3>
                <div className="bg-surface rounded-3xl p-8 shadow-pop">
                  <div className="text-base text-muted leading-relaxed space-y-3">{richParagraphs(p.body)}</div>
                  {p.href && (
                    <Link href={p.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline">
                      Learn more <ArrowRight className="w-4 h-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tiers  (pricing / membership cards)
// ─────────────────────────────────────────────────────────────────────────────

type TierItem = {
  name?: string
  /** The big display price, e.g. "Free", "$10", "$25+". */
  price?: string
  /** Optional struck-through original price shown before `price` (beta-free look). */
  strikePrice?: string
  /** Small unit beside the price, e.g. "/mo", "forever", "during beta". */
  cadence?: string
  /** Small line under the price, e.g. "$10/mo when paid memberships launch". */
  priceNote?: string
  tagline?: string
  /** Featured tier: lifts, rings, and shows a "Most popular" ribbon. */
  highlight?: 'featured' | 'normal'
  /** Small badge by the name, e.g. a Founder marker. */
  badge?: 'none' | 'founder'
  features?: { text?: string }[]
  ctaLabel?: string
  ctaHref?: string
  ctaStyle?: 'primary' | 'secondary'
}

export function TiersBlock({
  eyebrow,
  title,
  kicker,
  items,
  footnote,
  ink,
}: {
  eyebrow?: string
  title?: React.ReactNode
  kicker?: string
  items?: TierItem[]
  footnote?: string
  ink?: boolean
}) {
  return (
    <div>
      {(eyebrow || title || kicker) && (
        <div className="text-center mb-12">
          {eyebrow && <Eyebrow ink={ink}>{eyebrow}</Eyebrow>}
          {title && <DisplayHeading ink={ink}>{title}</DisplayHeading>}
          {kicker && <Kicker ink={ink}>{kicker}</Kicker>}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-5 items-start">
        {(items || []).map((tier, i) => {
          const featured = tier.highlight === 'featured'
          const cardTone = featured
            ? 'bg-surface-elevated border-2 border-primary ring-4 ring-primary-bg lg:-translate-y-3 lg:scale-[1.02] shadow-pop'
            : 'bg-surface border border-border shadow-sm'
          return (
            <article key={i} className={`relative flex flex-col h-full rounded-2xl p-7 sm:p-8 ${cardTone}`}>
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary px-4 py-1 text-xs font-black uppercase tracking-widest shadow-md">
                  <Star className="w-3.5 h-3.5 fill-current" aria-hidden /> Most popular
                </span>
              )}

              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display uppercase text-text text-2xl">{tier.name}</h3>
                {tier.badge === 'founder' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-signal-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-signal-strong">
                    <Award className="w-3 h-3" aria-hidden /> Founder
                  </span>
                )}
              </div>

              {tier.tagline && (
                <p className="text-sm text-muted leading-relaxed mb-5 min-h-[2.5rem]">{tier.tagline}</p>
              )}

              {/* Price block */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {tier.strikePrice && (
                    <span className="text-2xl font-black text-subtle line-through">{tier.strikePrice}</span>
                  )}
                  <span className="font-display uppercase text-text text-4xl leading-none">{tier.price}</span>
                  {tier.cadence && (
                    <span className="text-base text-muted">{tier.cadence}</span>
                  )}
                </div>
                {tier.priceNote && <p className="mt-1.5 text-xs text-subtle">{tier.priceNote}</p>}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {(tier.features || []).map((f, fi) => (
                  <li key={fi} className="flex items-start gap-3">
                    <span className={`shrink-0 w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center ${featured ? 'bg-primary-bg/60' : 'bg-success-bg/30'}`}>
                      <Check className={`w-3.5 h-3.5 ${featured ? 'text-primary-strong' : 'text-success'}`} aria-hidden />
                    </span>
                    <span className="text-sm text-text leading-snug">{f.text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {tier.ctaLabel && (
                <Link
                  href={tier.ctaHref || '#'}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold transition-colors ${
                    tier.ctaStyle === 'primary'
                      ? 'bg-primary text-on-primary hover:bg-primary-hover shadow-pop'
                      : 'border border-border-strong text-text hover:bg-surface-elevated'
                  }`}
                >
                  {tier.ctaLabel}
                  {tier.ctaStyle === 'primary' && <ArrowRight className="w-4 h-4" aria-hidden />}
                </Link>
              )}
            </article>
          )
        })}
      </div>
      {footnote && (
        <p className={`mt-8 text-center text-sm leading-relaxed max-w-xl mx-auto ${ink ? 'text-on-ink-muted' : 'text-subtle'}`}>
          {footnote}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentConfig exports — the full Puck editor palette for Collections
// ─────────────────────────────────────────────────────────────────────────────

export const collectionsComponents: Record<string, ComponentConfig> = {

  // ── FeatureGrid ─────────────────────────────────────────────────────────────
  FeatureGrid: {
    label: 'Feature grid',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      style: {
        type: 'select',
        label: 'Card style',
        options: [
          { label: 'Icon', value: 'icon' },
          { label: 'Image', value: 'image' },
          { label: 'Numbered steps', value: 'number' },
        ],
      },
      columns: {
        type: 'select',
        label: 'Columns',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
          { label: '4', value: '4' },
        ],
      },
      items: {
        type: 'array',
        label: 'Cards',
        arrayFields: {
          icon: {
            type: 'select',
            label: 'Icon',
            options: [
              { label: 'Users', value: 'Users' },
              { label: 'Map Pin', value: 'MapPin' },
              { label: 'Calendar', value: 'CalendarDays' },
              { label: 'Sparkles', value: 'Sparkles' },
              { label: 'Heart', value: 'Heart' },
              { label: 'Message Circle', value: 'MessageCircle' },
              { label: 'Compass', value: 'Compass' },
              { label: 'Flame', value: 'Flame' },
              { label: 'Star', value: 'Star' },
              { label: 'Shield', value: 'Shield' },
              { label: 'Coffee', value: 'Coffee' },
              { label: 'Music', value: 'Music' },
              { label: 'Sun', value: 'Sun' },
              { label: 'Leaf', value: 'Leaf' },
              { label: 'Handshake', value: 'Handshake' },
              { label: 'Zap', value: 'Zap' },
            ],
          },
          image: imgField,
          title: { type: 'text', label: 'Title' },
          body: { type: 'textarea', label: 'Body (**bold**, *italic*, [link](/path))' },
          href: { type: 'text', label: 'Link (optional)' },
        },
        getItemSummary: (item: FeatureItem) => item.title || 'Card',
      },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'What we offer',
      title: 'Everything you need',
      titleAccent: '',
      style: 'icon',
      columns: '3',
      items: [
        { icon: 'Users', image: '', title: 'Community', body: 'Real people, real connections.', href: '' },
        { icon: 'CalendarDays', image: '', title: 'Events', body: 'Something happening every week.', href: '' },
        { icon: 'Compass', image: '', title: 'Discover', body: 'Find your next circle.', href: '' },
      ],
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, style, columns, items, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <FeatureGridBlock
          eyebrow={eyebrow || undefined}
          title={accentize(title, titleAccent) || undefined}
          style={style as 'icon' | 'image' | 'number'}
          columns={columns}
          items={items}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  // ── StatRow ──────────────────────────────────────────────────────────────────
  StatRow: {
    label: 'Stat row',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      columns: {
        type: 'select',
        label: 'Columns',
        options: [
          { label: '2', value: '2' },
          { label: '3', value: '3' },
          { label: '4', value: '4' },
        ],
      },
      items: {
        type: 'array',
        label: 'Stats',
        arrayFields: {
          value: { type: 'text', label: 'Value (e.g. 10k+)' },
          label: { type: 'text', label: 'Label (e.g. Members)' },
        },
        getItemSummary: (item: StatItem) => item.value ? `${item.value} — ${item.label ?? ''}` : 'Stat',
      },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: '',
      title: 'By the numbers',
      titleAccent: '',
      columns: '3',
      items: [
        { value: '10k+', label: 'Members' },
        { value: '200+', label: 'Circles' },
        { value: '50+', label: 'Events monthly' },
      ],
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, columns, items, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <StatRowBlock
          eyebrow={eyebrow || undefined}
          title={accentize(title, titleAccent) || undefined}
          columns={columns}
          items={items}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  // ── Accordion ────────────────────────────────────────────────────────────────
  Accordion: {
    label: 'Accordion / FAQ',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      items: {
        type: 'array',
        label: 'Questions',
        arrayFields: {
          q: { type: 'text', label: 'Question' },
          a: { type: 'textarea', label: 'Answer (**bold**, *italic*, [link](/path))' },
        },
        getItemSummary: (item: AccordionItem) => item.q || 'Question',
      },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'FAQ',
      title: 'Common questions',
      titleAccent: '',
      items: [
        { q: 'What is Frequency?', a: 'Frequency is a platform for real-world community.' },
        { q: 'How do I join?', a: 'Sign up and request access to the beta.' },
      ],
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, items, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <AccordionBlock
          eyebrow={eyebrow || undefined}
          title={accentize(title, titleAccent) || undefined}
          items={items}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  // ── Checklist ────────────────────────────────────────────────────────────────
  Checklist: {
    label: 'Checklist',
    fields: {
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      columns: {
        type: 'select',
        label: 'Columns',
        options: [
          { label: '1', value: '1' },
          { label: '2', value: '2' },
        ],
      },
      items: {
        type: 'array',
        label: 'Items',
        arrayFields: {
          text: { type: 'text', label: 'Item text' },
        },
        getItemSummary: (item: CheckItem) => item.text || 'Item',
      },
      ...blockFields(),
    },
    defaultProps: {
      title: 'What you get',
      titleAccent: '',
      columns: '1',
      items: [
        { text: 'Access to all circles' },
        { text: 'Weekly events in your city' },
        { text: 'Real connections, no algorithm' },
      ],
      ...blockLayoutDefaults,
    },
    render: ({ title, titleAccent, columns, items, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <ChecklistBlock
          title={accentize(title, titleAccent) || undefined}
          columns={columns}
          items={items}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },

  // ── Showcase ─────────────────────────────────────────────────────────────────
  Showcase: {
    label: 'Showcase (alternating media + text)',
    fields: {
      marqueeItems: {
        type: 'array',
        label: 'Marquee strip (optional)',
        arrayFields: {
          text: { type: 'text', label: 'Text' },
        },
        getItemSummary: (item: { text?: string }) => item.text || 'Item',
      },
      items: {
        type: 'array',
        label: 'Rows',
        arrayFields: {
          image: imgField,
          title: { type: 'text', label: 'Title' },
          body: { type: 'textarea', label: 'Body (**bold**, *italic*, [link](/path))' },
          href: { type: 'text', label: 'Link (optional)' },
          side: {
            type: 'radio',
            label: 'Image side',
            options: [
              { label: 'Left', value: 'left' },
              { label: 'Right', value: 'right' },
            ],
          },
        },
        getItemSummary: (item: ShowcaseItem) => item.title || 'Row',
      },
      layout: {
        type: 'object',
        label: 'Layout',
        objectFields: {
          visibility: {
            type: 'select' as const,
            label: 'Show on',
            options: [
              { label: 'Everywhere', value: 'all' },
              { label: 'Desktop only', value: 'desktop' },
              { label: 'Mobile only', value: 'mobile' },
            ],
          },
          spaceTop: {
            type: 'select' as const,
            label: 'Space above',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'None', value: 'none' },
              { label: 'Extra small', value: 'xs' },
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
              { label: 'Extra large', value: 'xl' },
            ],
          },
          spaceBottom: {
            type: 'select' as const,
            label: 'Space below',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'None', value: 'none' },
              { label: 'Extra small', value: 'xs' },
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
              { label: 'Extra large', value: 'xl' },
            ],
          },
        },
      },
    },
    defaultProps: {
      marqueeItems: [{ text: 'What we\'re building' }],
      items: [
        { image: '', title: 'The Third Space', body: 'A place to gather, connect, and belong.', href: '', side: 'left' },
        { image: '', title: 'Real Community', body: 'No algorithm, just people who show up.', href: '', side: 'right' },
      ],
      layout: { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' },
    },
    render: ({ marqueeItems, items, layout }) => (
      <div className={visClass(layout as LayoutValue)}>
        <ShowcaseBlock marqueeItems={marqueeItems} items={items} />
      </div>
    ),
  },

  // ── Tiers ────────────────────────────────────────────────────────────────────
  Tiers: {
    label: 'Tiers (pricing cards)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow (optional)' },
      title: { type: 'text', label: 'Heading (optional)' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'text', label: 'Italic kicker (optional)' },
      items: {
        type: 'array',
        label: 'Tiers',
        arrayFields: {
          name: { type: 'text', label: 'Name' },
          price: { type: 'text', label: 'Price (e.g. Free, $10, $25+)' },
          strikePrice: { type: 'text', label: 'Struck price (optional, e.g. $10)' },
          cadence: { type: 'text', label: 'Cadence (e.g. /mo, forever, during beta)' },
          priceNote: { type: 'text', label: 'Note under price (optional)' },
          tagline: { type: 'text', label: 'Tagline' },
          highlight: {
            type: 'radio',
            label: 'Highlight',
            options: [
              { label: 'Normal', value: 'normal' },
              { label: 'Featured (Most popular)', value: 'featured' },
            ],
          },
          badge: {
            type: 'radio',
            label: 'Badge',
            options: [
              { label: 'None', value: 'none' },
              { label: 'Founder', value: 'founder' },
            ],
          },
          features: {
            type: 'array',
            label: 'Features',
            arrayFields: { text: { type: 'text', label: 'Feature' } },
            getItemSummary: (item: { text?: string }) => item.text || 'Feature',
          },
          ctaLabel: { type: 'text', label: 'Button label' },
          ctaHref: { type: 'text', label: 'Button link' },
          ctaStyle: {
            type: 'radio',
            label: 'Button style',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        },
        getItemSummary: (item: TierItem) => item.name || 'Tier',
      },
      footnote: { type: 'textarea', label: 'Footnote (optional)' },
      ...blockFields(),
    },
    defaultProps: {
      eyebrow: 'Choose how you belong',
      title: 'One community. Three ways in.',
      titleAccent: '',
      kicker: 'Start free. Upgrade when you’re ready.',
      items: [
        {
          name: 'Member', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
          tagline: 'For the curious. Come see what’s here.', highlight: 'normal', badge: 'none',
          features: [{ text: 'Browse circles, events, and topics near you' }, { text: 'Attend open gatherings' }],
          ctaLabel: 'Start free', ctaHref: '/sign-in', ctaStyle: 'secondary',
        },
        {
          name: 'Crew', price: 'Free', strikePrice: '$10', cadence: 'during beta',
          priceNote: '$10/mo when paid memberships launch',
          tagline: 'Full access. The whole room is yours.', highlight: 'featured', badge: 'founder',
          features: [{ text: 'Full community feed access' }, { text: 'Join and participate in circles' }, { text: 'Create and RSVP to events' }],
          ctaLabel: 'Join the Beta', ctaHref: '/beta', ctaStyle: 'primary',
        },
        {
          name: 'Pay it forward', price: '$25+', strikePrice: '', cadence: '/mo',
          priceNote: 'When paid memberships launch',
          tagline: 'Hold the door for a neighbor.', highlight: 'normal', badge: 'none',
          features: [{ text: 'Everything in Crew, full access' }, { text: 'Fund a membership for someone who can’t pay yet' }],
          ctaLabel: 'Join the Beta', ctaHref: '/beta', ctaStyle: 'secondary',
        },
      ],
      footnote: '',
      ...blockLayoutDefaults,
    },
    render: ({ eyebrow, title, titleAccent, kicker, items, footnote, tone, width, align, layout }) => (
      <Band tone={tone} width={width} align={align} layout={layout as LayoutValue}>
        <TiersBlock
          eyebrow={eyebrow || undefined}
          title={accentize(title, titleAccent) || undefined}
          kicker={kicker || undefined}
          items={items}
          footnote={footnote || undefined}
          ink={isInk(tone)}
        />
      </Band>
    ),
  },
}
