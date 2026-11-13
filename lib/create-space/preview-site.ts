// WHAT THE CREATE A SPACE PREVIEW SHOWS. PURE: builder state in, the words and pictures of the preview out.
//
// The goals come from WIZARD_INTENTS (lib/spaces/create-wizard.ts), the one list the signed-in builder also
// reads; this file adds only what the preview needs per goal (its noun, the offer card, the button verb and the
// italic second line). The kit list, labels and one-line pitches come from WIZARD_THEMES. Nothing here is a
// second copy of a theme: colors and shape come from lib/theme/preview-tokens.ts.

import { WIZARD_INTENTS, WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
import { NETWORK_KIT_SCHEMES, NETWORK_KIT_SCHEME_ORDER } from '@/lib/theme/network-kit'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import { CYBERWITCH_ACCENTS } from '@/lib/theme/cyberwitch'
import { WILDHEART_PALETTE } from '@/lib/theme/wildheart'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

type IntentId = (typeof WIZARD_INTENTS)[number]['id']

interface IntentLook {
  icon: string
  noun: string
  offer: { t: string; s: string }
  cta: string
  em: string
}

/** The preview's side of each goal. Keyed by the wizard's own ids, so a new goal there fails typecheck here. */
export const INTENT_LOOK: Record<IntentId, IntentLook> = {
  bookings: { icon: 'clock', noun: 'sessions', offer: { t: 'Book a session', s: '1:1 · 60 min' }, cta: 'Book', em: 'by appointment.' },
  classes: { icon: 'membership', noun: 'classes', offer: { t: 'Weekly class', s: 'Members and drop-ins' }, cta: 'Join', em: 'every week.' },
  programs: { icon: 'program', noun: 'programs', offer: { t: 'Six-week program', s: 'Next round soon' }, cta: 'Enroll', em: 'start to finish.' },
  events: { icon: 'event', noun: 'gatherings', offer: { t: 'Next gathering', s: 'Tickets · RSVP' }, cta: 'RSVP', em: 'together.' },
  products: { icon: 'tag', noun: 'a shop', offer: { t: 'Shop', s: 'New this season' }, cta: 'Shop', em: 'made by hand.' },
  community: { icon: 'circle', noun: 'circles', offer: { t: 'Join the Circle', s: 'A small group that meets' }, cta: 'Join', em: 'with your people.' },
  email: { icon: 'message', noun: 'a newsletter', offer: { t: 'Newsletter', s: 'Once a month' }, cta: 'Subscribe', em: 'in your inbox.' },
  donations: { icon: 'giveback', noun: 'giving', offer: { t: 'Give', s: 'Support the work' }, cta: 'Give', em: 'for the work.' },
}

const FALLBACK_OFFERS: readonly IntentId[] = ['events', 'bookings', 'community']
const FALLBACK_EM = 'start to finish.'
const FALLBACK_EYEBROW = 'A Space on Frequency'
const FALLBACK_TAGLINE = 'Gatherings, sessions and your people, all in one place.'

export interface KitImagery {
  hero: string
  heroPos: string
  portrait: string
  portraitPos: string
  strip: readonly [string, string, string]
  nav1: string
  cta2: string
  /** Cover pictures the Photos step offers (slot s0 is the hero). A kit without its own library offers the gathering photos. */
  covers: readonly string[]
  /** Host portraits the Photos step offers (slot s0 is the portrait). */
  portraits: readonly string[]
}

const DESIGNER_PHOTO = (name: string) => `/sites/designer/photos/${name}.webp`
const FREQUENCY_PHOTO = (n: 1 | 2 | 3) => `/create-a-space/photos/pain-${n}.jpg`
const NETWORK_PHOTO = (n: string) => `/sites/network-kit/photos/photo-${n}.jpg`
const TEMPLE_KIT_PHOTO = (n: string) => `/sites/temple-kit/photos/photo-${n}.jpg`
const NOCTURNE_PHOTO = (name: string) => `/sites/midnight/photos/${name}.jpg`
const NEW_WORLD_PHOTO = (name: string) => `/sites/new-world/photos/${name}.webp`
const CYBERWITCH_PHOTO = (name: string) => `/sites/cyberwitch/photos/${name}.jpg`
const FREE_HUMAN_PHOTO = (name: string) => `/sites/free-human/photos/${name}.webp`
const WILDHEART_PHOTO = (name: string) => `/brand/wildheart/photos/${name}.jpg`

const FREQUENCY_IMAGERY: KitImagery = {
  hero: FREQUENCY_PHOTO(2), heroPos: 'center', portrait: FREQUENCY_PHOTO(1), portraitPos: 'center',
  strip: [FREQUENCY_PHOTO(1), FREQUENCY_PHOTO(3), FREQUENCY_PHOTO(2)], nav1: 'Offerings', cta2: 'Learn more',
  covers: [FREQUENCY_PHOTO(2), FREQUENCY_PHOTO(1), FREQUENCY_PHOTO(3)], portraits: [FREQUENCY_PHOTO(1)],
}

/** Each kit's sample pictures. A kit with a library of its own wears it; the rest wear the gathering photography
 *  until theirs arrives. A Space's uploads replace these in the setup walk. */
const KIT_IMAGERY: Record<MegaThemeId, KitImagery> = {
  // New World's own gathering library (lib/sites/new-world-photos.json, LIVE-2060): the beach is its hero.
  'new-world': {
    hero: NEW_WORLD_PHOTO('beach-joy'), heroPos: 'center 40%', portrait: NEW_WORLD_PHOTO('group-hug'), portraitPos: 'center 30%',
    strip: [NEW_WORLD_PHOTO('circle-sunrise'), NEW_WORLD_PHOTO('hands-up'), NEW_WORLD_PHOTO('fire-circle')], nav1: "What's happening", cta2: 'Come along',
    covers: [NEW_WORLD_PHOTO('beach-joy'), NEW_WORLD_PHOTO('circle-sunrise'), NEW_WORLD_PHOTO('hands-up'), NEW_WORLD_PHOTO('fire-circle'), NEW_WORLD_PHOTO('garden-picnic')],
    portraits: [NEW_WORLD_PHOTO('group-hug'), NEW_WORLD_PHOTO('cafe-table')],
  },
  // Services has no library of its own yet; it wears the New World pictures of people at work together.
  services: {
    hero: NEW_WORLD_PHOTO('backyard-class'), heroPos: 'center 45%', portrait: NEW_WORLD_PHOTO('workshop-table'), portraitPos: 'center 30%',
    strip: [NEW_WORLD_PHOTO('cafe-table'), NEW_WORLD_PHOTO('backyard-class'), NEW_WORLD_PHOTO('beach-gong')], nav1: 'Services', cta2: 'See prices',
    covers: [NEW_WORLD_PHOTO('backyard-class'), NEW_WORLD_PHOTO('beach-gong'), NEW_WORLD_PHOTO('cafe-table'), NEW_WORLD_PHOTO('workshop-table')],
    portraits: [NEW_WORLD_PHOTO('workshop-table'), NEW_WORLD_PHOTO('cafe-table')],
  },
  // Free Human's own library (lib/sites/free-human-home.ts wears the same files): the walking virgin is its hero, the
  // founder its portrait.
  'free-human': {
    hero: FREE_HUMAN_PHOTO('heritage-a-virgin'), heroPos: 'center 20%', portrait: FREE_HUMAN_PHOTO('founder-audrey'), portraitPos: 'center 30%',
    strip: [FREE_HUMAN_PHOTO('place-daisies'), FREE_HUMAN_PHOTO('light-sun'), FREE_HUMAN_PHOTO('light-floating-candles')], nav1: 'Program', cta2: 'See the program',
    covers: [FREE_HUMAN_PHOTO('heritage-a-virgin'), FREE_HUMAN_PHOTO('place-daisies'), FREE_HUMAN_PHOTO('light-sun'), FREE_HUMAN_PHOTO('light-floating-candles'), FREE_HUMAN_PHOTO('light-lanterns')],
    portraits: [FREE_HUMAN_PHOTO('founder-audrey'), FREE_HUMAN_PHOTO('light-honey-dipper')],
  },
  // CyberWitch's own pictures (the zip's assets/imagery): the sprayed hero is its hero, the founder its portrait. The Hex pair is the
  // default; kitImagery(kit, accentAt) swaps in the picked neon's pair.
  cyberwitch: {
    hero: CYBERWITCH_PHOTO('hero-hex'), heroPos: 'center 40%', portrait: CYBERWITCH_PHOTO('founder-hex'), portraitPos: 'center 30%',
    strip: [CYBERWITCH_PHOTO('story'), CYBERWITCH_PHOTO('hero-ice'), CYBERWITCH_PHOTO('hero-absinthe')], nav1: 'Work with me', cta2: 'See the work',
    covers: [CYBERWITCH_PHOTO('hero-hex'), CYBERWITCH_PHOTO('story'), CYBERWITCH_PHOTO('hero-ice'), CYBERWITCH_PHOTO('hero-blood')],
    portraits: [CYBERWITCH_PHOTO('founder-hex'), CYBERWITCH_PHOTO('founder-ice')],
  },
  designer: {
    hero: DESIGNER_PHOTO('dz-designer-kitchen-hero'), heroPos: '38% center',
    portrait: DESIGNER_PHOTO('dz-portrait-01'), portraitPos: '48% 30%',
    strip: [DESIGNER_PHOTO('dz-house-front'), DESIGNER_PHOTO('dz-kitchen-island'), DESIGNER_PHOTO('dz-designer-sofa')],
    nav1: 'Portfolio', cta2: 'View work',
    covers: [DESIGNER_PHOTO('dz-designer-kitchen-hero'), DESIGNER_PHOTO('dz-courtyard-arch'), DESIGNER_PHOTO('dz-house-front'), DESIGNER_PHOTO('dz-kitchen-island'), DESIGNER_PHOTO('dz-designer-sofa')],
    portraits: [DESIGNER_PHOTO('dz-portrait-01'), DESIGNER_PHOTO('dz-portrait-02')],
  },
  // Nocturne's own seven monochrome pictures (lib/sites/midnight-home.ts wears the same files): the ribs are its hero. It has no
  // portrait photography, so the host portrait stays the gathering photo.
  midnight: {
    hero: NOCTURNE_PHOTO('industrial-ribs'), heroPos: 'center', portrait: FREQUENCY_PHOTO(1), portraitPos: 'center',
    strip: [NOCTURNE_PHOTO('nature-dunes'), NOCTURNE_PHOTO('nature-fern'), NOCTURNE_PHOTO('industrial-blades')], nav1: 'Offerings', cta2: 'Learn more',
    covers: [NOCTURNE_PHOTO('industrial-ribs'), NOCTURNE_PHOTO('industrial-panel'), NOCTURNE_PHOTO('industrial-blades'), NOCTURNE_PHOTO('nature-dunes'), NOCTURNE_PHOTO('nature-fern'), NOCTURNE_PHOTO('nature-grain'), NOCTURNE_PHOTO('nature-palm')],
    portraits: [FREQUENCY_PHOTO(1)],
  },
  // The Network kit's own library (lib/sites/network-kit-home.ts wears the same photos): the huddle is its hero.
  'network-kit': {
    hero: NETWORK_PHOTO('03'), heroPos: 'center 30%', portrait: NETWORK_PHOTO('04'), portraitPos: '60% 20%',
    strip: [NETWORK_PHOTO('01'), NETWORK_PHOTO('06'), NETWORK_PHOTO('11')], nav1: 'Meetups', cta2: 'How it works',
    covers: [NETWORK_PHOTO('03'), NETWORK_PHOTO('01'), NETWORK_PHOTO('06'), NETWORK_PHOTO('11'), NETWORK_PHOTO('10')],
    portraits: [NETWORK_PHOTO('04'), NETWORK_PHOTO('09')],
  },
  network: FREQUENCY_IMAGERY,
  temple: FREQUENCY_IMAGERY,
  // The Temple kit's own library (lib/sites/temple-kit-home.ts wears the same photos): the pool temple is its hero.
  'temple-kit': {
    hero: TEMPLE_KIT_PHOTO('02'), heroPos: 'center 60%', portrait: TEMPLE_KIT_PHOTO('11'), portraitPos: 'center 40%',
    strip: [TEMPLE_KIT_PHOTO('10'), TEMPLE_KIT_PHOTO('05'), TEMPLE_KIT_PHOTO('13')], nav1: 'Retreats', cta2: 'See the space',
    covers: [TEMPLE_KIT_PHOTO('02'), TEMPLE_KIT_PHOTO('10'), TEMPLE_KIT_PHOTO('11'), TEMPLE_KIT_PHOTO('05'), TEMPLE_KIT_PHOTO('13')],
    portraits: [TEMPLE_KIT_PHOTO('11'), TEMPLE_KIT_PHOTO('13')],
  },
  // Bold has no library of its own yet (the Hearts on Fire photos belong to that program), so it wears the gathering photos.
  bold: FREQUENCY_IMAGERY,
  // Wildheart's own five pictures from the revised design system (the theme's blocks wear the same files). It has no
  // portrait photography, so the host portrait stays the gathering photo, as Nocturne's does.
  wildheart: {
    hero: WILDHEART_PHOTO('sisters-shore'), heroPos: 'center 30%', portrait: FREQUENCY_PHOTO(1), portraitPos: 'center',
    strip: [WILDHEART_PHOTO('cacao-circle'), WILDHEART_PHOTO('hands-together'), WILDHEART_PHOTO('huddle')], nav1: 'Gatherings', cta2: 'Come along',
    covers: [WILDHEART_PHOTO('sisters-shore'), WILDHEART_PHOTO('huddle'), WILDHEART_PHOTO('cacao-circle'), WILDHEART_PHOTO('hands-together'), WILDHEART_PHOTO('forest-witch')],
    portraits: [FREQUENCY_PHOTO(1)],
  },
  frequency: FREQUENCY_IMAGERY,
}

/** Every kit's pictures: a kit with its own library never borrows another's. */
export function kitImagery(kit: MegaThemeId, accentAt?: number): KitImagery {
  const base = KIT_IMAGERY[kit]
  if (kit !== 'cyberwitch' || accentAt === undefined) return base
  // CyberWitch's hero and founder are shot in each neon: the picked accent's pair leads, the rest of the library follows.
  const id = (Object.keys(CYBERWITCH_ACCENTS) as (keyof typeof CYBERWITCH_ACCENTS)[])[accentAt]
  if (!id) return base
  const hero = CYBERWITCH_PHOTO(`hero-${id}`)
  const portrait = CYBERWITCH_PHOTO(`founder-${id}`)
  return {
    ...base, hero, portrait,
    // The offer strip in the same neon: the story, the founder, the wall.
    strip: [CYBERWITCH_PHOTO('story'), portrait, hero],
    covers: [hero, ...base.covers.filter((c) => c !== hero && c !== base.hero)],
    portraits: [portrait, ...base.portraits.filter((c) => c !== portrait && c !== base.portrait)],
  }
}
/** Every kit's accents are its own: no kit falls back to another kit's family (Daniel, 2026-11-03). */
export const kitAccents = (kit: MegaThemeId): readonly PreviewAccent[] => KIT_ACCENT_LISTS[kit]

/** The hex a kit's accent choice stands for, as the launch hold carries it (lib/launch/carry.ts `accent`, the place in the
 *  kit's list as digits). Null when the kit or the place is not one of ours, so a hand-edited hold writes no colour. */
export function kitAccentFill(kit: unknown, at: unknown): string | null {
  if (typeof kit !== 'string' || !isPreviewKit(kit)) return null
  const n = typeof at === 'string' && /^\d{1,2}$/.test(at) ? Number(at) : typeof at === 'number' ? at : NaN
  const fill = Number.isInteger(n) ? kitAccents(kit)[n]?.fill : undefined
  return fill && /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : null
}

/** The place in a kit's accent list an address names (`?accent=` from a Theme Kit page's Use button): the accent's name
 *  (`absinthe`) or its hex, any case. Null when the kit or the accent is not one of ours, so the builder keeps its default. */
export function kitAccentIndex(kit: unknown, accent: unknown): number | null {
  if (typeof kit !== 'string' || !isPreviewKit(kit) || typeof accent !== 'string') return null
  const want = accent.trim().toLowerCase().replace(/^%23/, '#')
  if (!want || want.length > 40) return null
  const at = kitAccents(kit).findIndex((a) => a.name.toLowerCase() === want || a.fill.toLowerCase() === want || a.fill.toLowerCase() === `#${want}`)
  return at >= 0 ? at : null
}

interface PreviewAccent {
  name: string
  fill: string
  /** The 4.5:1 step for accent used as text on a light ground; null when the fill already reads. */
  text: string | null
}

/** The accents each kit offers, first = the kit's own. The violets of Nocturne and Wildheart are read from their palettes, never restated here (LIVE-962). Designer's six are verified against the Designer
 *  handoff; the others are the kit's family as the prototype listed it. */
/** The audience profiles whose accents differ, in the kit's order; the ones that only repeat an earlier hex are left out. */
const distinctProfiles = <K extends string>(profiles: Record<K, { label: string; accent: string; text: string }>, order: readonly K[]): PreviewAccent[] => {
  const seen = new Set<string>()
  return order.flatMap((k) => {
    const p = profiles[k]
    if (seen.has(p.accent.toUpperCase())) return []
    seen.add(p.accent.toUpperCase())
    return [{ name: p.label, fill: p.accent, text: p.text === p.accent ? null : p.text }]
  })
}

const KIT_ACCENTS: Record<MegaThemeId, readonly PreviewAccent[]> = {
  designer: [
    { name: 'Ochre', fill: '#D3A03F', text: '#9A6C1C' }, { name: 'Terracotta', fill: '#A65A3A', text: '#874429' },
    { name: 'Sage', fill: '#4E6E71', text: '#4E6E71' }, { name: 'Walnut', fill: '#5A4533', text: '#5A4533' },
    { name: 'Olive', fill: '#6F7A3E', text: '#58622F' }, { name: 'Zellige teal', fill: '#2F7F7A', text: '#25655F' },
  ],
  midnight: [
    { name: 'Violet', fill: MEGA_SURFACES.midnight?.accent.accent ?? '#8FB8FF', text: null }, { name: 'Moon blue', fill: '#8FB8FF', text: null },
    { name: 'Candle', fill: '#E8C27A', text: null }, { name: 'Rose', fill: '#F2A0B8', text: null },
  ],
  // The kit's four schemes, Marigold (its default) first, read from the one token module so the preview, the website
  // and the Space agree on the hex (Daniel, 2026-11-03: the preview showed generic accents, not the Network kit's).
  'network-kit': NETWORK_KIT_SCHEME_ORDER.map((id) => ({ name: NETWORK_KIT_SCHEMES[id].label, fill: NETWORK_KIT_SCHEMES[id].accent, text: NETWORK_KIT_SCHEMES[id].accentText })),
  network: [],
  temple: [
    { name: 'Clay', fill: '#B5643C', text: null }, { name: 'Ochre', fill: '#9C7130', text: null },
    { name: 'Sage', fill: '#6F7D5A', text: null }, { name: 'Madder', fill: '#9C4F4F', text: null },
  ],
  // The Temple kit's audience profiles (lib/theme/temple-kit.ts), Temple's clay first: six families, the repeats dropped.
  'temple-kit': distinctProfiles(TEMPLE_KIT_PROFILES, ['general', 'coaches', 'studios', 'hosts', 'markets', 'faith']),
  // Free Human's profiles (lib/theme/free-human.ts), the madder first.
  'free-human': distinctProfiles(FREE_HUMAN_PROFILES, ['general', 'coaches', 'creators', 'studios', 'hosts']),
  // Services' six presets (lib/theme/services.ts), Tide first. Night register: the fill reads as text, so no text step.
  services: (['tide', 'signal', 'bloom', 'ember', 'fern', 'iris'] as const).map((id) => ({ name: SERVICES_ACCENTS[id].label, fill: SERVICES_ACCENTS[id].accent, text: null })),
  // New World's presets (lib/theme/new-world.ts): Tide, until the owner adds more.
  'new-world': (Object.keys(NEW_WORLD_ACCENTS) as (keyof typeof NEW_WORLD_ACCENTS)[]).map((id) => ({ name: NEW_WORLD_ACCENTS[id].label, fill: NEW_WORLD_ACCENTS[id].accent, text: null })),
  // CyberWitch's five presets (lib/theme/cyberwitch.ts), Hex first. Dark only: the fill reads as text, so no text step.
  cyberwitch: (Object.keys(CYBERWITCH_ACCENTS) as (keyof typeof CYBERWITCH_ACCENTS)[]).map((id) => ({ name: CYBERWITCH_ACCENTS[id].label, fill: CYBERWITCH_ACCENTS[id].accent, text: null })),
  bold: [
    { name: 'Volt', fill: '#D4FF3D', text: null }, { name: 'Flare', fill: '#FF5A36', text: null },
    { name: 'Ice', fill: '#3DD9FF', text: null }, { name: 'Gold', fill: '#FFD23D', text: null },
  ],
  wildheart: [
    { name: 'Dusk', fill: WILDHEART_PALETTE.violet, text: null }, { name: 'Petal', fill: '#B86A8B', text: null },
    { name: 'Tide', fill: '#3E7C8C', text: null }, { name: 'Harvest', fill: '#A8822F', text: null },
  ],
  frequency: [
    { name: 'Sea glass', fill: '#3A8C99', text: null }, { name: 'Sky', fill: '#4F8FC0', text: null },
    { name: 'Fern', fill: '#3C8C7C', text: null }, { name: 'Sun', fill: '#9A6200', text: null },
  ],
}

/** The accents the kit's /themes page offers that the builder's own list lacks (the Theme Kits design's swatches), added
 *  after the kit's own so its default stays first. Picking one on /themes and pressing Use lands on that colour. */
const THEMES_PAGE_ACCENTS: Partial<Record<MegaThemeId, readonly PreviewAccent[]>> = {
  'new-world': [{ name: 'Violet', fill: '#8B5CFF', text: null }, { name: 'Magenta', fill: '#FF3DAE', text: null }, { name: 'Sun', fill: '#FFC46B', text: null }, { name: 'Ember bright', fill: '#FF6A2B', text: null }],
  'network-kit': [{ name: 'Lagoon', fill: '#22796E', text: null }, { name: 'Ink', fill: '#22303A', text: null }],
  designer: [{ name: 'Moss', fill: '#6F7A3E', text: '#5A6332' }, { name: 'Slate', fill: '#4E6E71', text: null }, { name: 'Denim', fill: '#4F6A8A', text: null }],
  bold: [{ name: 'Fall', fill: '#D4703E', text: null }, { name: 'Cyan', fill: '#00A6C8', text: null }, { name: 'Spring', fill: '#93B57A', text: null }, { name: 'Summer', fill: '#DDB24E', text: null }, { name: 'Winter', fill: '#97A3D4', text: null }],
  'temple-kit': [{ name: 'Olive', fill: '#565C33', text: null }, { name: 'Aegean', fill: '#2F6E80', text: null }, { name: 'Plum', fill: '#7A4257', text: null }, { name: 'Saffron', fill: '#B2792A', text: '#8A5A16' }],
  wildheart: [{ name: 'Madder', fill: '#94505E', text: null }, { name: 'Winter', fill: '#46518A', text: null }, { name: 'Spring', fill: '#4C6B37', text: null }, { name: 'Summer', fill: '#7A5A16', text: null }],
  midnight: [{ name: 'Mint', fill: '#86D99A', text: null }, { name: 'Amber', fill: '#FFB04A', text: null }, { name: 'Sea', fill: '#5FD3C1', text: null }, { name: 'Orchid', fill: '#FF8FD2', text: null }],
}
const KIT_ACCENT_LISTS = Object.fromEntries(
  (Object.keys(KIT_ACCENTS) as MegaThemeId[]).map((k) => {
    const have = new Set(KIT_ACCENTS[k].map((a) => a.fill.toLowerCase()))
    return [k, [...KIT_ACCENTS[k], ...(THEMES_PAGE_ACCENTS[k] ?? []).filter((a) => !have.has(a.fill.toLowerCase()))]]
  }),
) as unknown as Record<MegaThemeId, readonly PreviewAccent[]>

/** The kits the page offers, in the page's order, with the wizard's labels and pitches. */
export const PREVIEW_KITS = PREVIEW_KIT_ORDER.map((id) => {
  const t = WIZARD_THEMES.find((w) => w.id === id)
  return { id, label: t?.label ?? id, hint: t?.hint ?? '' }
})

export function isPreviewKit(v: unknown): v is MegaThemeId {
  return typeof v === 'string' && (PREVIEW_KIT_ORDER as readonly string[]).includes(v)
}

interface SiteInput {
  name: string
  handle: string
  hostName: string
  intents: readonly string[]
  kit: MegaThemeId
  /** The accent's place in the kit's list, for a kit whose pictures follow it (kitImagery). */
  accentAt?: number
  /** Their one sentence about what they offer (v3 step 2). When given, it is the tagline, as they wrote it. */
  offer?: string
  /** How clients reach them (v3 step 3): the contact strip and the Spotlight read these. */
  reach?: { email?: string; phone?: string; where?: string }
  /** Before step 2 is done the preview is a ghost (README section 4): placeholder lines that say what the mock-up
   *  will fill, at half opacity, instead of a sample Space that could be mistaken for theirs. */
  ghost?: boolean
}

/** The ghost preview's lines, as the handoff words them. */
const GHOST = {
  eyebrow: 'A Space on Frequency',
  tagline: 'Your one-line description goes here, mocked up from what you offer.',
  offers: [{ t: 'Your first offering', s: 'Mocked up for you' }, { t: 'What people book', s: 'From one sentence' }, { t: 'A way to stay close', s: 'Edit any time' }],
} as const

/** The preview's clipping limits (README section 4): short lines stay on one line in the browser window. */
export const PREVIEW_CLIP = { em: 28, tagline: 110, eyebrow: 32, offerTitle: 26, offerDetail: 30 } as const

/** Text as the preview shows it: markdown-ish characters stripped, dashes read as commas, spaces folded, cut to n. */
export function clipPreview(v: string, n: number): string {
  return v.replace(/[*_`#\\]+/g, '').replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n)
}

/** A sentence from what they typed: first letter up, one full stop at the end, nothing when empty. */
export function asSentence(v: string): string {
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const up = t[0].toUpperCase() + t.slice(1)
  return /[.!?]$/.test(up) ? up : `${up}.`
}

export interface PreviewSite {
  name: string
  em: string
  nav1: string
  cta: string
  ctaLong: string
  cta2: string
  eyebrow: string
  tagline: string
  handle: string
  domain: string
  host: string
  offers: readonly { t: string; s: string; img: string; n: string }[]
  links: readonly [string, string, string]
  /** The contact strip: Visit, Write and Call, each empty until step 3 fills it. */
  contact: { visit: string; write: string; call: string }
  /** True once their own sentence drives the tagline; false in the ghost state before step 2. */
  fromOffer: boolean
}

/** "a, b and c". Shared with the hero's toast, which names the tools a mock-up switched on. */
export const joinList = (a: readonly string[]) => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
const isIntent = (id: string): id is IntentId => id in INTENT_LOOK

/** The words and pictures of the preview for the current state. Total: empty state reads as a sample Space. */
export function deriveSite(input: SiteInput): PreviewSite {
  const imagery = kitImagery(input.kit, input.accentAt)
  const picks = WIZARD_INTENTS.filter((i) => input.intents.includes(i.id))
  const first = picks[0] ? INTENT_LOOK[picks[0].id] : null
  const offerIds: IntentId[] = (picks.length ? picks.map((p) => p.id) : [...FALLBACK_OFFERS]).slice(0, 3)
  for (const id of ['community', 'email', 'events', 'bookings', 'classes'] as const) {
    if (offerIds.length >= 3) break
    if (!offerIds.includes(id) && isIntent(id)) offerIds.push(id)
  }
  const offers = offerIds.map((id, i) => ({ ...INTENT_LOOK[id].offer, img: imagery.strip[i], n: ['I', 'II', 'III'][i] }))
  const name = input.name.trim() || 'Business Name'
  const handle = input.handle || 'yourspace'
  const host = input.hostName.trim()
  const nouns = picks.map((p) => INTENT_LOOK[p.id].noun)
  const sentence = input.offer ? clipPreview(asSentence(input.offer), PREVIEW_CLIP.tagline) : ''
  const ghost = input.ghost === true
  return {
    name,
    em: ghost ? '' : clipPreview(first?.em ?? FALLBACK_EM, PREVIEW_CLIP.em),
    nav1: imagery.nav1,
    cta: ghost ? 'Join' : (first?.cta ?? 'Join'),
    ctaLong: ghost ? 'Join now' : first ? `${first.cta} now` : 'Join us',
    cta2: imagery.cta2,
    eyebrow: ghost ? GHOST.eyebrow : clipPreview(picks.length ? picks.slice(0, 2).map((p) => cap(p.label.split(' ').slice(-1)[0])).join(' · ') : FALLBACK_EYEBROW, PREVIEW_CLIP.eyebrow),
    tagline: ghost ? GHOST.tagline : sentence || (nouns.length ? `${cap(joinList(nouns))}, all in one place.` : FALLBACK_TAGLINE),
    handle,
    domain: `frequency.community/${handle}`,
    host: host || 'you',
    offers: offers.map((o, i) => ({ ...o, ...(ghost ? GHOST.offers[i] : { t: clipPreview(o.t, PREVIEW_CLIP.offerTitle), s: clipPreview(o.s, PREVIEW_CLIP.offerDetail) }) })),
    links: [offers[1].t, 'Join the list', `About ${host ? host.split(' ')[0] : 'the host'}`],
    contact: {
      visit: clipPreview(input.reach?.where ?? '', 80),
      write: clipPreview(input.reach?.email ?? '', 254),
      call: clipPreview(input.reach?.phone ?? '', 30),
    },
    fromOffer: sentence.length > 0,
  }
}
