import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { templeKitInnerPagesA } from '@/components/sites/temple-kit-inner/pages'
import { templeKitInnerPagesB } from '@/components/sites/temple-kit-inner/pages-b'
import {
  TEMPLE_KIT_CTA, TEMPLE_KIT_HERO, TEMPLE_KIT_JOURNEYS, templeKitHomeBlocks,
} from '@/lib/sites/temple-kit-home'
import { TEMPLE_KIT_PROFILE_KIT_INDEX } from './temple-kit-profile-index'
import type { KitNiche, KitPage, SiteKit } from './types'

// Temple Theme Kit x its thirteen profile starter kits (the design system's profiles, tokens/kits.css). One kit per
// profile, `temple-kit-<niche>`: the profile id IS the kit's niche (general, coaches, studios ... markets), so a new Space
// that picked the Temple look and a niche starts on its own kit, and `temple-kit-general` is the General kit the starter
// site publishes. The thirteen share one type system and one Home and differ by ACCENT only (the design's kits.css), so
// every kit is the same pages; what differs is the id, the name, who it is for and the accent a profile wears
// (templeKitProfileAccent). Kits hold no colors: the Space's own brand accent paints the site.
//
// The Home is the design's, block for block (templeKitHomeBlocks), after one copy pass for a STARTER: a kit's words are
// samples the owner rewrites, so the design's sample house keeps its voice but loses what a real Space would have to
// delete before it could be true (a price, a seat count, a star rating, a discount, a rhythm, a "free" promise). Each
// change is a row in SOFTEN below, and the test pins the result (no dash, price, rating, discount, rhythm or free promise). Four short pages (gatherings, services,
// journeys, membership) give every button on the Home somewhere to go; Book and Contact are the site's own pages.
// The full inner pages (About, Ceremonies and hire, Contact and the rest) are a later pass: see INNER PAGES at the end.

type Block = KitPage['blocks'][number]

/** The design's own sentences, each softened to a starter's voice (docs/marketing/voice-and-language-guide.md): no weekly or
 *  seasonal rhythm promised, no "free", no number the owner has not checked. Applied to every string in the Home. */
const SOFTEN: readonly (readonly [string, string])[] = [
  ['Free, ask for a time', 'Ask for a time'],
  [' Start with a walk of the grounds; it is free.', ' Start with a walk of the grounds.'],
  ['A free tour with our house host, for anyone', 'A tour with our house host, for anyone'],
  ['Any date can be held for 48 hours while you decide.', 'Any date can be held while you decide.'],
  ['A free week of ten-minute practices.', 'A week of ten-minute practices.'],
  ['The seasonal letter, four times a year', 'The seasonal letter'],
  ['10% off gatherings', 'Member rates on gatherings'],
  ['20% off gatherings and suppers', 'Member rates on gatherings and suppers'],
  ['Two private healing sessions a month', 'Private healing sessions'],
  ['Four hours of room hire each season', 'Room hire in the house'],
  ['and one program each season.', 'and a program to start.'],
  ['Twenty to thirty people, in person.', 'Small groups, in person.'],
  ['Free parking on the lower lawn', 'Parking on the lower lawn'],
  ['A held seat is yours for 48 hours.', 'A held seat is yours while we wait to hear from you.'],
  ['Any date can be held for 48 hours at no cost. We will write before it lapses.', 'Ask us to hold a date while you decide. We will write before the hold lapses.'],
  ['A letter each season. *Four a year.*', 'A letter from the house. *Now and then.*'],
  ['Members can pause for up to three months a year and keep their rate when they come back.', 'Members can pause and keep their rate when they come back.'],
  ['A 48-hour hold while you decide', 'A hold on the date while you decide'],
  ['Two months free', 'A better rate for the year'],
  ['Pause for up to three months a year.', 'Pause and keep your rate.'],
  ['A standing seat at the weekly practice, a program each season and more time in the rooms', 'A standing seat at the practice, a program to start and more time in the rooms'],
  ['A standing place at the weekly practice', 'A standing place at the practice'],
  ['The Tuesday morning practice, every week', 'A place at the morning practice'],
  ['One seasonal program included', 'A program to start'],
  ['early word on every date', 'early word on dates'],
  ['We hold weekly practice, the turns of the year,', 'We hold regular practice, the turns of the year,'],
  ['Any date is held for 48 hours at no cost. We write before the hold lapses.', 'Ask us to hold a date while you decide. We write before the hold lapses.'],
]

/** Numbers the design's sample house states about itself and a starter must not: prices, seats left, ratings, discounts. */
const BLANK_FIELDS: Record<string, readonly string[]> = {
  TempleKitHero: ['cardNote'],
  TempleKitProof: ['stars'],
}

function soften(value: unknown): unknown {
  if (typeof value === 'string') return SOFTEN.reduce((s, [from, to]) => s.split(from).join(to), value)
  if (Array.isArray(value)) return value.map(soften)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, soften(v)]))
  return value
}

/** Row fields that carry a price, a seat count or a badge about one: blanked, because a block draws none when it is empty. */
const ROW_BLANKS: Record<string, { list: string; fields: readonly string[] }> = {
  TempleKitGatherings: { list: 'rows', fields: ['price', 'seats'] },
  TempleKitOfferings: { list: 'services', fields: ['price'] },
  TempleKitJourneys: { list: 'journeys', fields: ['price'] },
  TempleKitMembership: { list: 'tiers', fields: ['price', 'unit', 'badge'] },
}

function starter(block: Block): Block {
  const props = soften(structuredClone(block.props ?? {})) as Record<string, unknown>
  for (const f of BLANK_FIELDS[block.type] ?? []) props[f] = f === 'stars' ? '0' : ''
  const rows = ROW_BLANKS[block.type]
  if (rows && Array.isArray(props[rows.list])) props[rows.list] = (props[rows.list] as Record<string, unknown>[]).map((r) => ({ ...r, ...Object.fromEntries(rows.fields.map((f) => [f, ''])) }))
  if (block.type === 'TempleKitProof' && Array.isArray(props.more)) props.more = []
  return { type: block.type, props }
}

const home = (): Block[] => templeKitHomeBlocks().map(starter)

/** A plain page header: the Temple hero, with the page's own words, no buttons and no next-gathering card. */
const header = (eyebrow: string, title: string, lead: string, photo: string): Block => ({
  type: 'TempleKitHero',
  props: { ...TEMPLE_KIT_HERO, eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: photo, live: false, cardLabel: '', cardTitle: '', cardWhen: '', cardNote: '', cardImage: '', cardHref: '' },
})
/** A home block under a page header: the header says the page's name, so the block drops its own heading. */
const bare = (type: string, props: Record<string, unknown>): Block => starter({ type, props: { ...props, eyebrow: '', title: '', lead: '' } })
const closing = (): Block => starter({ type: 'TempleKitCta', props: { ...TEMPLE_KIT_CTA } })

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

/** An inner page's sample prices are the design house's own: a starter keeps the page and leaves the price for the owner. */
const unpriced = (p: KitPage): KitPage => ({ ...p, blocks: p.blocks.map((b) => ({ type: b.type, props: stripPrices(soften(structuredClone(b.props ?? {}))) as Record<string, unknown> })) })

function stripPrices(value: unknown): unknown {
  if (typeof value === 'string') return /\$\d/.test(value) ? '' : value
  if (Array.isArray(value)) return value.map(stripPrices)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripPrices(v)]))
  return value
}

function pages(label: string, who: string): KitPage[] {
  const photo = (n: string) => `/sites/temple-kit/photos/photo-${n}.jpg`
  return [
    page('home', 'Home', who, home()),
    page('journeys', 'Programs', 'Small groups over a few weeks, with a practice to keep.', [
      header('Programs', 'Practices *to take home.*', 'Small groups over a few weeks, in the studio and online.', photo('12')),
      bare('TempleKitJourneys', TEMPLE_KIT_JOURNEYS), closing(),
    ]),
    // Contact stays out: every site already has its own Contact page, which the Home links to.
    ...[...templeKitInnerPagesB(), ...templeKitInnerPagesA().filter((p) => p.slug !== 'contact')].map(unpriced),
  ]
}

/** The profile's accent, from the design system's tokens/kits.css. Kits hold no colors: the Space's own brand accent paints the site. */
export const templeKitProfileAccent = (niche: string): string | null => (Object.hasOwn(TEMPLE_KIT_PROFILES, niche) ? TEMPLE_KIT_PROFILES[niche as keyof typeof TEMPLE_KIT_PROFILES].accent : null)

/** The Temple Theme Kit profile kit for one niche. Id is `temple-kit-<niche>`. */
export function templeKitProfileKit(niche: KitNiche): SiteKit {
  const summary = TEMPLE_KIT_PROFILE_KIT_INDEX.find((k) => k.niche === niche)
  if (!summary) throw new Error(`No Temple Theme Kit profile kit for ${niche}`)
  return { id: summary.id, label: summary.label, description: summary.description, theme: 'TempleKit', version: 1, niche, pages: pages(summary.label, summary.description) }
}
