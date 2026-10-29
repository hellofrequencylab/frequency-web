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
}

const DESIGNER_PHOTO = (name: string) => `/sites/designer/photos/${name}.webp`
const FREQUENCY_PHOTO = (n: 1 | 2 | 3) => `/create-a-space/photos/pain-${n}.jpg`

const FREQUENCY_IMAGERY: KitImagery = {
  hero: FREQUENCY_PHOTO(2), heroPos: 'center', portrait: FREQUENCY_PHOTO(1), portraitPos: 'center',
  strip: [FREQUENCY_PHOTO(1), FREQUENCY_PHOTO(3), FREQUENCY_PHOTO(2)], nav1: 'Offerings', cta2: 'Learn more',
}

/** Each kit's sample pictures. Designer wears its own library; every other kit wears the gathering photography
 *  until it has a library of its own. A Space's uploads replace these in the setup walk. */
const KIT_IMAGERY: Partial<Record<MegaThemeId, KitImagery>> & Record<Exclude<MegaThemeId, 'temple-kit' | 'free-human'>, KitImagery> = {
  designer: {
    hero: DESIGNER_PHOTO('dz-designer-kitchen-hero'), heroPos: '38% center',
    portrait: DESIGNER_PHOTO('dz-portrait-01'), portraitPos: '48% 30%',
    strip: [DESIGNER_PHOTO('dz-house-front'), DESIGNER_PHOTO('dz-kitchen-island'), DESIGNER_PHOTO('dz-designer-sofa')],
    nav1: 'Portfolio', cta2: 'View work',
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
const KIT_ACCENTS: Partial<Record<MegaThemeId, readonly PreviewAccent[]>> & Record<Exclude<MegaThemeId, 'temple-kit' | 'free-human'>, readonly PreviewAccent[]> = {
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
}

const joinList = (a: readonly string[]) => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
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
  return {
    name,
    em: first?.em ?? FALLBACK_EM,
    nav1: imagery.nav1,
    cta: first?.cta ?? 'Join',
    ctaLong: first ? `${first.cta} now` : 'Join us',
    cta2: imagery.cta2,
    eyebrow: picks.length ? picks.slice(0, 2).map((p) => cap(p.label.split(' ').slice(-1)[0])).join(' · ') : FALLBACK_EYEBROW,
    tagline: nouns.length ? `${cap(joinList(nouns))}, all in one place.` : FALLBACK_TAGLINE,
    handle,
    domain: `frequency.community/${handle}`,
    host: host || 'you',
    offers,
    links: [offers[1].t, 'Join the list', `About ${host ? host.split(' ')[0] : 'the host'}`],
  }
}
