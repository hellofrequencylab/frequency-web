// GEOCODE THE CIRCLES THAT ALREADY TOLD US WHERE THEY ARE (ADR-1026).
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/backfill-circle-coords.mts [--apply]
//
// Dry run by default. Nothing is written until you pass --apply.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
//
// `updateCirclePlaceTime` used to take a Circle's coordinates from a MANUAL map pin and nothing
// else, while happily storing the `city` and `neighborhood` the host typed beside it. So a host who
// filled in "Vista" and never noticed the map got a Circle with a place and no point, which means no
// pin on /circles, no row from the near-me RPC, and no dot on Around You. Measured in production
// 2026-08-13: 6 of 7 Circles had no coordinates, and two of those were listed, active, in-person,
// and carrying a perfectly good city.
//
// The save path now geocodes that city itself (app/(main)/circles/admin-actions.ts), so no NEW
// Circle can land in this state. This script is for the ones already in it, which would otherwise
// stay invisible until a host happened to re-save a settings page they have no reason to open.
//
// ── WHAT IT WILL AND WILL NOT TOUCH ────────────────────────────────────────────────────────────
//
// ONLY rows that are in-person, have a city, and have NO coordinate. A Circle whose host placed a
// pin is never overwritten: a hand-placed pin is better data than a city centroid, always, and a
// backfill that "improved" one would be destroying the only precise location in the table.
//
// A city centroid is the right grain and needs no coarsening the way a withheld event address does:
// it discloses nothing beyond the city name the host already published.
//
// Keyless Nominatim, the same provider the app's own save path uses, rate-limited to one request a
// second because that is their published policy and this script is not exempt from it.

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

type CircleRow = {
  id: string
  name: string
  slug: string
  city: string | null
  neighborhood: string | null
  type: string
  status: string
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...auth }
  if (init.prefer) headers.Prefer = init.prefer
  const res = await fetch(`${REST}/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
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
    'circles?select=id,name,slug,city,neighborhood,type,status' +
      '&latitude=is.null&type=eq.in-person&city=not.is.null&order=name',
  )) as CircleRow[]

  if (rows.length === 0) {
    console.log('Nothing to do: every in-person Circle with a city already has a coordinate.')
    return
  }

  console.log(`${rows.length} Circle(s) have a city and no coordinate.\n`)
  let placed = 0
  let missed = 0

  for (const row of rows) {
    const query = [row.neighborhood, row.city].filter(Boolean).join(', ')
    const point = await geocode(query)
    await sleep(1100)

    if (!point) {
      missed++
      console.log(`  ✖ ${row.name} (${row.slug}) — "${query}" did not resolve, left alone`)
      continue
    }

    console.log(
      `  ${APPLY ? '✔' : '·'} ${row.name} (${row.slug}) — "${query}" → ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    )

    if (APPLY) {
      // `latitude=is.null` in the filter as well as the query, so a pin placed by a host BETWEEN the
      // read above and this write is never clobbered. The read is not a lock; the filter is.
      await rest(`circles?id=eq.${row.id}&latitude=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ latitude: point.lat, longitude: point.lng }),
        prefer: 'return=minimal',
      })
    }
    placed++
  }

  console.log(
    `\n${APPLY ? 'Wrote' : 'Would write'} ${placed} coordinate(s). ${missed} did not resolve.` +
      (APPLY ? '' : '\nRe-run with --apply to write them.'),
  )
}

main().catch((err) => {
  console.error('✖', err instanceof Error ? err.message : err)
  process.exit(1)
})
