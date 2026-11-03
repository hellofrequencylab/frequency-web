// WHAT THE CREATE A SPACE PREVIEW SHOWS. PURE: builder state in, the words and pictures of the preview out.
//
// The goals come from WIZARD_INTENTS (lib/spaces/create-wizard.ts), the one list the signed-in builder also
// reads; this file adds only what the preview needs per goal (its noun, the offer card, the button verb and the
// italic second line). The kit list, labels and one-line pitches come from WIZARD_THEMES. Nothing here is a
// second copy of a theme: colors and shape come from lib/theme/preview-tokens.ts.

import { WIZARD_INTENTS, WIZARD_THEMES } from '@/lib/spaces/create-wizard'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'
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

const FREQUENCY_IMAGERY: KitImagery = {
  hero: FREQUENCY_PHOTO(2), heroPos: 'center', portrait: FREQUENCY_PHOTO(1), portraitPos: 'center',
  strip: [FREQUENCY_PHOTO(1), FREQUENCY_PHOTO(3), FREQUENCY_PHOTO(2)], nav1: 'Offerings', cta2: 'Learn more',
  covers: [FREQUENCY_PHOTO(2), FREQUENCY_PHOTO(1), FREQUENCY_PHOTO(3)], portraits: [FREQUENCY_PHOTO(1)],
}

/** Each kit's sample pictures. Designer wears its own library; every other kit wears the gathering photography
 *  until it has a library of its own. A Space's uploads replace these in the setup walk. */
const KIT_IMAGERY: Partial<Record<MegaThemeId, KitImagery>> & Record<Exclude<MegaThemeId, 'temple-kit' | 'free-human' | 'services' | 'new-world'>, KitImagery> = {
  designer: {
    hero: DESIGNER_PHOTO('dz-designer-kitchen-hero'), heroPos: '38% center',
    portrait: DESIGNER_PHOTO('dz-portrait-01'), portraitPos: '48% 30%',
    strip: [DESIGNER_PHOTO('dz-house-front'), DESIGNER_PHOTO('dz-kitchen-island'), DESIGNER_PHOTO('dz-designer-sofa')],
    nav1: 'Portfolio', cta2: 'View work',
    covers: [DESIGNER_PHOTO('dz-designer-kitchen-hero'), DESIGNER_PHOTO('dz-courtyard-arch'), DESIGNER_PHOTO('dz-house-front'), DESIGNER_PHOTO('dz-kitchen-island'), DESIGNER_PHOTO('dz-designer-sofa')],
    portraits: [DESIGNER_PHOTO('dz-portrait-01'), DESIGNER_PHOTO('dz-portrait-02')],
  },
  midnight: FREQUENCY_IMAGERY,
  'network-kit': FREQUENCY_IMAGERY,
  network: FREQUENCY_IMAGERY,
  temple: FREQUENCY_IMAGERY,
  bold: FREQUENCY_IMAGERY,
  wildheart: FREQUENCY_IMAGERY,
  frequency: FREQUENCY_IMAGERY,
}

/** Temple kit is not a Mega Theme yet; it wears Temple's pictures and accents. */
export const kitImagery = (kit: MegaThemeId): KitImagery => KIT_IMAGERY[kit] ?? KIT_IMAGERY.temple
export const kitAccents = (kit: MegaThemeId): readonly PreviewAccent[] => KIT_ACCENTS[kit] ?? KIT_ACCENTS.temple

interface PreviewAccent {
  name: string
  fill: string
  /** The 4.5:1 step for accent used as text on a light ground; null when the fill already reads. */
  text: string | null
}

/** The accents each kit offers, first = the kit's own. The violets of Nocturne and Wildheart are read from their palettes, never restated here (LIVE-962). Designer's six are verified against the Designer
 *  handoff; the others are the kit's family as the prototype listed it. */
const KIT_ACCENTS: Partial<Record<MegaThemeId, readonly PreviewAccent[]>> & Record<Exclude<MegaThemeId, 'temple-kit' | 'free-human' | 'services' | 'new-world'>, readonly PreviewAccent[]> = {
  designer: [
    { name: 'Ochre', fill: '#D3A03F', text: '#9A6C1C' }, { name: 'Terracotta', fill: '#A65A3A', text: '#874429' },
    { name: 'Sage', fill: '#4E6E71', text: '#4E6E71' }, { name: 'Walnut', fill: '#5A4533', text: '#5A4533' },
    { name: 'Olive', fill: '#6F7A3E', text: '#58622F' }, { name: 'Zellige teal', fill: '#2F7F7A', text: '#25655F' },
  ],
  midnight: [
    { name: 'Violet', fill: MEGA_SURFACES.midnight?.accent.accent ?? '#8FB8FF', text: null }, { name: 'Moon blue', fill: '#8FB8FF', text: null },
    { name: 'Candle', fill: '#E8C27A', text: null }, { name: 'Rose', fill: '#F2A0B8', text: null },
  ],
  'network-kit': [
    { name: 'Cobalt', fill: '#2F5BEA', text: null }, { name: 'Tomato', fill: '#D94B34', text: null },
    { name: 'Fern', fill: '#1F8A5B', text: null }, { name: 'Marigold', fill: '#C98A16', text: null },
  ],
  network: [],
  temple: [
    { name: 'Clay', fill: '#B5643C', text: null }, { name: 'Ochre', fill: '#9C7130', text: null },
    { name: 'Sage', fill: '#6F7D5A', text: null }, { name: 'Madder', fill: '#9C4F4F', text: null },
  ],
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
  const imagery = kitImagery(input.kit)
  const picks = WIZARD_INTENTS.filter((i) => input.intents.includes(i.id))
  const first = picks[0] ? INTENT_LOOK[picks[0].id] : null
  const offerIds: IntentId[] = (picks.length ? picks.map((p) => p.id) : [...FALLBACK_OFFERS]).slice(0, 3)
  for (const id of ['community', 'email', 'events', 'bookings', 'classes'] as const) {
    if (offerIds.length >= 3) break
    if (!offerIds.includes(id) && isIntent(id)) offerIds.push(id)
  }
  const offers = offerIds.map((id, i) => ({ ...INTENT_LOOK[id].offer, img: imagery.strip[i], n: ['I', 'II', 'III'][i] }))
  const name = input.name.trim() || 'Your Space'
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
