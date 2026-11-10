// FlowWeb region metrics (LIVE-2235): the four numbers FlowWeb's neighborhood-activation flow reads for
// each region, computed from Frequency's own rows and written in the CSV FlowWeb's metrics upload takes:
//   territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam
//
// Definitions (the FlowWeb funnel contract):
//   · hosts_active_28d     distinct hosts with an event that started in the last 28 days or starts in the
//                          next 14 days;
//   · events_next_14d      live events starting in the next 14 days;
//   · sub_areas_covered_14d sub-areas whose next-14-day events span at least 4 Channels;
//   · wam                  members seen in the last 7 days.
// Place: a host's or member's chosen area (profiles.meta.host.area, then meta.funnel.area) wins, because
// the contract counts hosts and events by the area the host chose. Otherwise the row's city is matched
// against the sub-area city lists below. A city that names only the region (plain "San Diego") counts
// toward the region's totals and no sub-area.
//
// PURE (no Supabase / Next imports). The loader that reads the rows is lib/admin/region-metrics-load.ts.

import { FUNNEL_REGIONS } from '@/lib/onboarding/funnel-context'

/** City names (lower case) that place a row in a sub-area. */
const AREA_CITIES: Record<string, readonly string[]> = {
  oceanside: ['oceanside'],
  carlsbad: ['carlsbad'],
  encinitas: ['encinitas', 'leucadia', 'cardiff', 'cardiff by the sea', 'olivenhain'],
  'solana-del-mar': ['solana beach', 'del mar'],
  vista: ['vista'],
  'san-marcos': ['san marcos'],
  escondido: ['escondido'],
  poway: ['poway'],
  'fallbrook-bonsall': ['fallbrook', 'bonsall'],
  'valley-center-ramona': ['valley center', 'ramona'],
  'south-coast': ['san clemente', 'dana point', 'san juan capistrano', 'capistrano beach'],
  'laguna-aliso': ['laguna beach', 'laguna niguel', 'aliso viejo', 'laguna woods', 'laguna hills'],
  saddleback: ['mission viejo', 'lake forest', 'rancho santa margarita', 'ladera ranch', 'trabuco canyon', 'foothill ranch'],
  irvine: ['irvine'],
  'newport-costa-mesa': ['newport beach', 'costa mesa', 'corona del mar'],
  huntington: ['huntington beach'],
  'central-oc': ['santa ana', 'tustin', 'orange', 'garden grove'],
  'north-oc': ['anaheim', 'fullerton', 'brea', 'yorba linda', 'placentia', 'buena park', 'la habra'],
  'west-oc': ['westminster', 'fountain valley', 'seal beach', 'los alamitos', 'cypress', 'stanton'],
  temecula: ['temecula'],
  murrieta: ['murrieta'],
  menifee: ['menifee', 'sun city'],
  'lake-elsinore': ['lake elsinore', 'wildomar', 'canyon lake'],
  hemet: ['hemet', 'san jacinto'],
  'coastal-sd': ['la jolla', 'pacific beach', 'ocean beach', 'point loma', 'mission beach'],
  'central-sd': ['downtown san diego', 'hillcrest', 'north park', 'south park', 'golden hill', 'little italy'],
  'mid-city': ['city heights', 'normal heights', 'kensington', 'college area'],
  clairemont: ['clairemont', 'mission valley', 'linda vista'],
  'northern-sd': ['rancho bernardo', 'mira mesa', 'rancho penasquitos', 'carmel valley', 'scripps ranch'],
  'east-county': ['el cajon', 'la mesa', 'santee', 'lakeside', 'spring valley', 'alpine', 'lemon grove'],
  'south-bay': ['chula vista', 'national city', 'imperial beach', 'bonita', 'otay mesa', 'san ysidro'],
}

/** Cities that name a region but no one sub-area. */
const REGION_CITIES: Record<string, string> = { 'san diego': 'san-diego' }

const AREA_REGION = new Map<string, string>()
for (const r of FUNNEL_REGIONS) for (const a of r.areas) AREA_REGION.set(a.id, r.id)

const CITY_AREA = new Map<string, string>()
for (const [area, cities] of Object.entries(AREA_CITIES)) for (const c of cities) CITY_AREA.set(c, area)

function normCity(city: string | null | undefined): string {
  return (city ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Place {
  region: string | null
  area: string | null
}

/** Where a row sits: a chosen sub-area id wins, then the city. */
export function placeOf(chosenArea: string | null | undefined, city: string | null | undefined): Place {
  if (chosenArea && AREA_REGION.has(chosenArea)) return { region: AREA_REGION.get(chosenArea)!, area: chosenArea }
  const c = normCity(city)
  const area = CITY_AREA.get(c)
  if (area) return { region: AREA_REGION.get(area)!, area }
  return { region: REGION_CITIES[c] ?? null, area: null }
}

export interface MetricEvent {
  startsAt: string
  hostId: string | null
  city: string | null
  /** The Channel the event belongs to (its Circle's Channel, else its category). */
  channel: string | null
}

interface MetricMember {
  city: string | null
  chosenArea: string | null
}

interface RegionMetricsRow {
  territory_id: string
  hosts_active_28d: number
  events_next_14d: number
  sub_areas_covered_14d: number
  wam: number
}

const DAY = 86_400_000
/** A sub-area is covered when its next 14 days of events span this many Channels (FlowWeb config). */
const CHANNELS_FOR_COVERAGE = 4

export function computeRegionMetrics(input: {
  now: Date
  events: readonly MetricEvent[]
  /** host profile id -> the sub-area that host chose, when they chose one. */
  hostAreas: ReadonlyMap<string, string | null>
  /** Members seen in the last 7 days. */
  weeklyMembers: readonly MetricMember[]
}): RegionMetricsRow[] {
  const now = input.now.getTime()
  const rows = new Map<string, { hosts: Set<string>; events: number; channels: Map<string, Set<string>>; wam: number }>()
  for (const r of FUNNEL_REGIONS) rows.set(r.id, { hosts: new Set(), events: 0, channels: new Map(), wam: 0 })

  for (const e of input.events) {
    const t = Date.parse(e.startsAt)
    if (!Number.isFinite(t) || t < now - 28 * DAY || t > now + 14 * DAY) continue
    const chosen = e.hostId ? input.hostAreas.get(e.hostId) ?? null : null
    const place = placeOf(chosen, e.city)
    const row = place.region ? rows.get(place.region) : undefined
    if (!row) continue
    if (e.hostId) row.hosts.add(e.hostId)
    if (t < now) continue
    row.events += 1
    if (place.area && e.channel) {
      const set = row.channels.get(place.area) ?? new Set<string>()
      set.add(e.channel)
      row.channels.set(place.area, set)
    }
  }

  for (const m of input.weeklyMembers) {
    const place = placeOf(m.chosenArea, m.city)
    const row = place.region ? rows.get(place.region) : undefined
    if (row) row.wam += 1
  }

  return FUNNEL_REGIONS.map((r) => {
    const row = rows.get(r.id)!
    const covered = [...row.channels.values()].filter((s) => s.size >= CHANNELS_FOR_COVERAGE).length
    return {
      territory_id: r.id,
      hosts_active_28d: row.hosts.size,
      events_next_14d: row.events,
      sub_areas_covered_14d: covered,
      wam: row.wam,
    }
  })
}

/** The CSV FlowWeb's metrics upload takes, header first. */
export function regionMetricsCsv(rows: readonly RegionMetricsRow[]): string {
  const head = 'territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam'
  const lines = rows.map((r) =>
    [r.territory_id, r.hosts_active_28d, r.events_next_14d, r.sub_areas_covered_14d, r.wam].join(','),
  )
  return [head, ...lines].join('\n') + '\n'
}

/** The sub-area a profile chose, from its meta (the host form first, then the invite link). */
export function chosenAreaOf(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as { host?: { area?: unknown }; funnel?: { area?: unknown } }
  const a = m.host?.area ?? m.funnel?.area
  return typeof a === 'string' && AREA_REGION.has(a) ? a : null
}
