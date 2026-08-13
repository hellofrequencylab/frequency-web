// GEOCODE THE EVENTS THAT ALREADY TOLD US WHERE THEY ARE (ADR-1029).
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/backfill-event-coords.mts [--apply]
//
// Dry run by default. Nothing is written until you pass --apply.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
//
// `saveEventLocation` is best-effort BY CONTRACT: a geocode miss leaves `events.geog` NULL and the
// save still succeeds. That is correct and this script does not argue with it — a host must never
// lose their work because a third-party geocoder shrugged. Every caller already passes a geocoder,
// so no caller is the bug.
//
// The bug was the silence. An event with no point disappears from the Around You map
// (`.not('geog','is',null)`), the events-index map, its own page's mini-map, and every radius-based
// dispatch audience — with the host given no reason to suspect any of it. ADR-1029 gave the EDITOR a
// warning so no new event lands here unnoticed. This script is for the rows already in that state,
// which would otherwise wait for a host to happen to re-save a settings page they have no reason to
// open.
//
// ⚠️ AND IT MULTIPLIES. lib/event-recurrence.ts carries `geog` in INHERITED_COLUMNS, so a NULL-geog
// ANCHOR propagates NULL into every occurrence it mints. Fixing an anchor is worth far more than
// fixing one date, which is why anchors are reported first and counted separately below.
//
// ── WHY A SCRIPT AND NOT A CRON ────────────────────────────────────────────────────────────────
//
// Both existing event crons are single-purpose, and `event-reminders` runs EVERY 15 MINUTES.
// Nominatim's published policy is one request per second; burying a rate-limited third-party call
// inside a hot paged job is how you get the whole community's geocoding blocked. A deliberate,
// observable, dry-run-first script is the right shape, exactly as it was for Circles.
//
// ── WHAT IT WILL AND WILL NOT TOUCH ────────────────────────────────────────────────────────────
//
// ONLY rows that are in-person, not demo, and have NO point. An event that already has a coordinate
// is never overwritten: a host's own pin, or a point a geocoder already resolved, is better data
// than anything this script can produce.
//
// 🔴 IT WRITES THROUGH THE `set_event_geog` RPC, NOT A PATCH. `events.geog` is a PostGIS geography;
// a PATCH of that column with a JSON value does not work, and hand-building WKT in JS is exactly
// what the RPC exists to prevent. The RPC is SECURITY DEFINER and granted to `service_role` only,
// so the key this script already requires is precisely the one that can call it.
//
// 🔴 IT STRIPS THE WITHHOLDING NOTE FIRST, via the same `stripWithholdingNote` the live geocoder
// uses (lib/events/geocode-provider.ts). Hosts write the instruction into the venue box — "The Royal
// Temple (RSVP to see location)" — and no provider resolves that sentence. A sweep that skipped this
// would reproduce the exact production miss it exists to repair, one row at a time, and report them
// all as unresolvable.

import { stripWithholdingNote } from '../lib/events/location-intent.ts'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const REST = `${URL}/rest/v1`
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

/** Nominatim asks for a contact in the User-Agent and one request per second. Both are honoured. */
const USER_AGENT = 'Frequency/1.0 (hello@frequencylocal.com)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type EventRow = {
  id: string
  slug: string | null
  title: string | null
  starts_at: string
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  location: string | null
  parent_event_id: string | null
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...auth }
  if (init.prefer) headers.Prefer = init.prefer
  const res = await fetch(`${REST}/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/**
 * The query handed to the provider. Mirrors `toQuery` in lib/events/geocode-provider.ts: structured
 * parts first (venue, street, city, region, postal, country), falling back to the free-text
 * `location` line with any withholding note stripped.
 */
function toQuery(row: EventRow): string | null {
  const structured = [row.venue_name, row.street, row.city, row.region, row.postal_code, row.country]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  return structured || stripWithholdingNote(row.location)
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '0' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { lat?: string; lon?: string }[]
  const first = data?.[0]
  if (!first) return null
  const lat = Number(first.lat)
  const lng = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

async function main() {
  const rows = (await rest(
    'events?select=id,slug,title,starts_at,venue_name,street,city,region,postal_code,country,location,parent_event_id' +
      '&geog=is.null&attendance_mode=neq.online&is_demo=is.false&is_cancelled=is.false' +
      '&status=eq.published&removed_at=is.null&order=parent_event_id.nullsfirst,starts_at',
  )) as EventRow[]

  if (rows.length === 0) {
    console.log('Nothing to do: every published in-person event already has a point.')
    return
  }

  const anchors = rows.filter((r) => r.parent_event_id == null).length
  console.log(
    `${rows.length} published in-person event(s) have no point. ${anchors} of them are series ANCHORS,\n` +
      'and an anchor is worth more than one date: event-recurrence copies geog into every occurrence\n' +
      'it mints, so a NULL anchor keeps minting NULL.\n',
  )

  let placed = 0
  let missed = 0

  for (const row of rows) {
    const label = `${row.title ?? '(untitled)'}${row.parent_event_id == null ? ' [anchor]' : ''}`
    const query = toQuery(row)

    if (!query) {
      missed++
      console.log(`  ✖ ${label} — nothing geocodable in the address or location line, left alone`)
      continue
    }

    const point = await geocode(query)
    await sleep(1100)

    if (!point) {
      missed++
      console.log(`  ✖ ${label} — "${query}" did not resolve, left alone`)
      continue
    }

    console.log(
      `  ${APPLY ? '✔' : '·'} ${label} — "${query}" → ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    )

    if (APPLY) {
      // 🔴 THE RPC, not a PATCH: geog is a PostGIS geography and the WKT/SRID stays in SQL.
      //
      // Unlike the Circle backfill, the null-check cannot ride along on the write as a filter — an
      // RPC takes arguments, not a `where`. So the row is re-read immediately before the call and
      // skipped if a point landed in the meantime. Narrower than a filtered UPDATE, but it still
      // refuses to clobber a host who placed a pin while this was running.
      const fresh = (await rest(`events?select=id&id=eq.${row.id}&geog=is.null`)) as { id: string }[]
      if (fresh.length === 0) {
        console.log('     (skipped: a point landed while this was running)')
        continue
      }
      await rest('rpc/set_event_geog', {
        method: 'POST',
        body: JSON.stringify({ _event_id: row.id, _lat: point.lat, _long: point.lng }),
        prefer: 'return=minimal',
      })
    }
    placed++
  }

  console.log(
    `\n${APPLY ? 'Wrote' : 'Would write'} ${placed} point(s). ${missed} did not resolve.` +
      (APPLY ? '' : '\nRe-run with --apply to write them.'),
  )
}

main().catch((err) => {
  console.error('✖', err instanceof Error ? err.message : err)
  process.exit(1)
})
