// Smart funnel context (LIVE-2233): what an invite link tells a /start page about the person it was
// sent to. FlowWeb's neighborhood-activation flow builds every invite as
//   /start/<funnel>?persona=&region=&area=&channel=&src=&utm_source=flowweb&utm_medium=&utm_campaign=
// (contract: flows/neighborhood-activation/config.json and funnelOf() in hellofrequencylab/flowweb).
// This module reads those params into one validated record the page adapts to and the lead stores.
//
// Rules that make it safe to read straight off a URL:
//   · every value is clipped and matched against a closed list or a slug pattern; anything else is
//     dropped, never echoed onto the page;
//   · an unknown region or Channel is ignored rather than failing (the contract says so);
//   · an area only counts when it belongs to the region (or, with no region, it picks its region).
//
// PURE + client-safe (no server imports). The region map mirrors FlowWeb's config; when FlowWeb adds a
// region, add it here in the same shape.

import { findSubject, type SubjectKey } from '@/lib/taxonomy/subjects'
import { isPersonaId, type PersonaId } from '@/lib/onboarding/personas'

interface FunnelArea {
  id: string
  name: string
}

interface FunnelRegion {
  id: string
  name: string
  /** The short name used in running copy ("Hosts in North County are already..."). */
  short: string
  /** The seed region opens first, so its hosts are the first ones there. */
  seed?: boolean
  areas: readonly FunnelArea[]
}

/** The four FlowWeb regions, in the order they open. */
export const FUNNEL_REGIONS: readonly FunnelRegion[] = [
  {
    id: 'north-county-sd',
    name: 'North County San Diego',
    short: 'North County',
    seed: true,
    areas: [
      { id: 'oceanside', name: 'Oceanside' },
      { id: 'carlsbad', name: 'Carlsbad' },
      { id: 'encinitas', name: 'Encinitas and Leucadia' },
      { id: 'solana-del-mar', name: 'Solana Beach and Del Mar' },
      { id: 'vista', name: 'Vista' },
      { id: 'san-marcos', name: 'San Marcos' },
      { id: 'escondido', name: 'Escondido' },
      { id: 'poway', name: 'Poway' },
      { id: 'fallbrook-bonsall', name: 'Fallbrook and Bonsall' },
      { id: 'valley-center-ramona', name: 'Valley Center and Ramona' },
    ],
  },
  {
    id: 'orange-county',
    name: 'Orange County',
    short: 'Orange County',
    areas: [
      { id: 'south-coast', name: 'South Coast' },
      { id: 'laguna-aliso', name: 'Laguna and Aliso Viejo' },
      { id: 'saddleback', name: 'Saddleback Valley' },
      { id: 'irvine', name: 'Irvine' },
      { id: 'newport-costa-mesa', name: 'Newport and Costa Mesa' },
      { id: 'huntington', name: 'Huntington Beach' },
      { id: 'central-oc', name: 'Central OC' },
      { id: 'north-oc', name: 'North OC' },
      { id: 'west-oc', name: 'West OC' },
    ],
  },
  {
    id: 'inland-north',
    name: 'the Temecula Valley',
    short: 'the Temecula Valley',
    areas: [
      { id: 'temecula', name: 'Temecula' },
      { id: 'murrieta', name: 'Murrieta' },
      { id: 'menifee', name: 'Menifee' },
      { id: 'lake-elsinore', name: 'Lake Elsinore and Wildomar' },
      { id: 'hemet', name: 'Hemet and San Jacinto' },
    ],
  },
  {
    id: 'san-diego',
    name: 'San Diego',
    short: 'San Diego',
    areas: [
      { id: 'coastal-sd', name: 'Coastal San Diego' },
      { id: 'central-sd', name: 'Central San Diego' },
      { id: 'mid-city', name: 'Mid-City' },
      { id: 'clairemont', name: 'Clairemont and Mission Valley' },
      { id: 'northern-sd', name: 'Northern San Diego' },
      { id: 'east-county', name: 'East County' },
      { id: 'south-bay', name: 'South Bay' },
    ],
  },
]

/** Where FlowWeb finds a lead. Anything else is kept out of the record. */
const FUNNEL_SOURCES = [
  'event_listings',
  'business_listings',
  'creator_profiles',
  'local_groups',
  'frequency_members',
  'host_referrals',
] as const
type FunnelSource = (typeof FUNNEL_SOURCES)[number]

export interface FunnelContext {
  persona: PersonaId | null
  region: FunnelRegion | null
  area: FunnelArea | null
  /** The Channel slug as sent, when it is a well-formed slug (stored even when we do not know it). */
  channel: string | null
  /** The known subject the Channel slug names, when it names one (drives the "what you host" pick). */
  channelSubject: SubjectKey | null
  src: FunnelSource | null
  utm: { source: string | null; medium: string | null; campaign: string | null }
  /** True when the link came from Daniel's personal first invite. */
  founderInvite: boolean
}

/** The record stored on the lead (contacts.meta.funnel): ids only, no display copy. */
interface FunnelRecord {
  persona: PersonaId | null
  region: string | null
  area: string | null
  channel: string | null
  src: FunnelSource | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

/** Every param an invite link may carry; the page passes on these and nothing else. */
export const FUNNEL_PARAM_KEYS = [
  'persona',
  'region',
  'area',
  'channel',
  'src',
  'utm_source',
  'utm_medium',
  'utm_campaign',
] as const

type ParamReader = { get(key: string): string | null | undefined }
type ParamBag = Record<string, string | string[] | undefined>

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/

function one(params: ParamReader | ParamBag, key: string): string | null {
  const raw =
    typeof (params as ParamReader).get === 'function'
      ? (params as ParamReader).get(key)
      : (params as ParamBag)[key]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase().slice(0, 48)
  return SLUG_RE.test(t) ? t : null
}

function findRegion(id: string | null | undefined): FunnelRegion | null {
  return FUNNEL_REGIONS.find((r) => r.id === id) ?? null
}

/** Read a /start link's params (a URLSearchParams or a Next searchParams object). Never throws. */
export function parseFunnelContext(params: ParamReader | ParamBag): FunnelContext {
  const personaRaw = one(params, 'persona')
  const persona = personaRaw && isPersonaId(personaRaw) ? personaRaw : null

  let region = findRegion(one(params, 'region'))
  const areaId = one(params, 'area')
  let area: FunnelArea | null = null
  if (areaId) {
    if (region) {
      area = region.areas.find((a) => a.id === areaId) ?? null
    } else {
      // No (or an unknown) region: an area id is unique across regions, so it names its region.
      for (const r of FUNNEL_REGIONS) {
        const hit = r.areas.find((a) => a.id === areaId)
        if (hit) {
          region = r
          area = hit
          break
        }
      }
    }
  }

  const channel = one(params, 'channel')
  const subject = channel ? findSubject(channel) : undefined
  const srcRaw = one(params, 'src')
  const src = (FUNNEL_SOURCES as readonly string[]).includes(srcRaw ?? '') ? (srcRaw as FunnelSource) : null
  const utm = {
    source: one(params, 'utm_source'),
    medium: one(params, 'utm_medium'),
    campaign: one(params, 'utm_campaign'),
  }

  return {
    persona,
    region,
    area,
    channel,
    channelSubject: subject?.key ?? null,
    src,
    utm,
    founderInvite: utm.medium === 'founder_email',
  }
}

/** The ids-only record a lead stores. */
export function funnelRecord(ctx: FunnelContext): FunnelRecord {
  return {
    persona: ctx.persona,
    region: ctx.region?.id ?? null,
    area: ctx.area?.id ?? null,
    channel: ctx.channel,
    src: ctx.src,
    utm_source: ctx.utm.source,
    utm_medium: ctx.utm.medium,
    utm_campaign: ctx.utm.campaign,
  }
}

/** True when the link carried anything worth storing. */
export function hasFunnelSignal(rec: FunnelRecord): boolean {
  return Object.values(rec).some((v) => v != null)
}

/** The place name a page speaks to: the area, else the region, else null. */
function funnelPlace(ctx: FunnelContext): string | null {
  return ctx.area?.name ?? ctx.region?.name ?? null
}

/** The query string that carries the context on to the next step, ids only. */
export function funnelQuery(rec: FunnelRecord): string {
  const q = new URLSearchParams()
  if (rec.region) q.set('region', rec.region)
  if (rec.area) q.set('area', rec.area)
  if (rec.channel) q.set('channel', rec.channel)
  if (rec.src) q.set('src', rec.src)
  return q.toString()
}

export interface HostFunnelCopy {
  eyebrow: string
  headline: string
  body: string
  /** The region-tone line: first hosts in the seed region, borrowed proof elsewhere. */
  regionLine: string | null
  /** Shown only on Daniel's personal invites. */
  founderLine: string | null
}

/** The host page's words for this visitor (contract: "Angle" in the FlowWeb funnel contract). */
export function hostFunnelCopy(ctx: FunnelContext): HostFunnelCopy {
  const place = funnelPlace(ctx)
  const seed = FUNNEL_REGIONS.find((r) => r.seed)
  let regionLine: string | null = null
  if (ctx.region?.seed) {
    regionLine = `Frequency is just opening in ${ctx.region.short}. Be one of the first hosts here.`
  } else if (ctx.region && seed) {
    regionLine = `Hosts in ${seed.short} are already running Circles. Bring yours to ${place ?? ctx.region.short}.`
  }
  return {
    eyebrow: place ? `For hosts in ${place}` : 'For hosts',
    headline: place ? `Start a Circle in ${place}.` : 'Start a Circle near you.',
    body:
      'You already teach, lead or gather people. Frequency gives that a free local home: a page people find, a calendar your town reads, and a way to keep the people who show up.',
    regionLine,
    founderLine: ctx.founderInvite
      ? 'Daniel, who started Frequency, invited you personally. Reply to his email any time with a question.'
      : null,
  }
}
