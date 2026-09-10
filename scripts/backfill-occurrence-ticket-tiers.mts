// GIVE THE OCCURRENCES THAT ALREADY EXIST THE TIERS THEIR ANCHOR SELLS (ADR-1306).
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/backfill-occurrence-ticket-tiers.mts [--apply]
//
// Dry run by default. Nothing is written until you pass --apply.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
//
// `generateOccurrencesForAnchor` copies INHERITED_COLUMNS onto each materialised occurrence, and a
// column list can only ever carry COLUMNS. Ticket tiers are rows in `event_ticket_types` keyed by
// `event_id`, so until ADR-1306 nothing copied them: every occurrence of a priced series inherited
// `price_cents` (it LOOKED priced) and had zero tiers, which meant the event page never rendered
// the paid branch (`isPaidEvent && hasTiers`) and no charge was ever attempted — and a Space
// membership, which is modelled AS a members-only tier row (ADR-823), had nothing to include.
//
// ADR-1306 fixed the mint, and the mint is additive by construction: it only ever touches the rows
// a run CREATES. Every occurrence already in the database therefore stays tierless forever unless
// something goes and looks. This is that something.
//
// ── WHY A SCRIPT AND NOT A MIGRATION, AND NOT A CRON ───────────────────────────────────────────
//
// It writes MONEY CONFIGURATION onto live gatherings people can already see. A migration applies
// itself on deploy with nobody reading its output; a cron would re-decide this every day. Both are
// the wrong shape for a one-off repair whose whole value is that a human read the list first. So:
// deliberate, dry-run first, and it prints every row it would create before it creates any.
//
// ── WHAT IT WILL AND WILL NOT TOUCH ────────────────────────────────────────────────────────────
//
// ONLY a FUTURE occurrence whose anchor has tiers and which has NONE of its own. An occurrence
// that already carries a tier is skipped whole — a host may have priced that date differently, and
// their edit is better data than this script's copy. PAST occurrences are never touched, the same
// rule the propagation and retirement paths follow: a past occurrence is the record of a gathering
// that already happened, and repricing it after the fact is inventing history.
//
// 🔴 IT NEVER COPIES `sold`, `id` or `created_at`. `sold` is the running count of succeeded
// purchases, owned by the Stripe webhook; copying it onto a brand new date would mark it SOLD OUT
// against the copied `quantity` on the day it was repaired. The columns below are the CATALOG only,
// and they are the same list `occurrenceTierRows` carries in lib/event-recurrence.ts — a list this
// script must repeat rather than import, because the module it lives in imports `@/lib/...` aliases
// that plain node cannot resolve. lib/event-recurrence.test.ts asserts the two lists are identical,
// exactly as it does for the ADR-884 SQL repair, so a column added to one and not the other fails
// CI rather than silently minting an incomplete tier.
const TIER_CATALOG_COLUMNS = [
  'name',
  'description',
  'pricing_mode',
  'price_cents',
  'min_cents',
  'suggested_cents',
  'quantity',
  'member_only',
  'space_members_only',
  'space_tier_id',
  'sort_order',
  'active',
] as const

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const REST = `${URL}/rest/v1`
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

type OccurrenceRow = {
  id: string
  slug: string | null
  title: string | null
  starts_at: string
  parent_event_id: string
}

type TierRow = { id: string; event_id: string } & Partial<
  Record<(typeof TIER_CATALOG_COLUMNS)[number], unknown>
>

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...auth }
  if (init.prefer) headers.Prefer = init.prefer
  const res = await fetch(`${REST}/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/** PostgREST `in.(…)` goes in the URL, so ids are read in bounded batches rather than one long
 *  query string that a proxy would truncate. */
async function inBatches<T>(ids: string[], size: number, read: (batch: string[]) => Promise<T[]>) {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...(await read(ids.slice(i, i + size))))
  return out
}

/** The insert payload for one tier on one occurrence: the catalog verbatim, the new `event_id`, and
 *  nothing else. `id`, `sold` and `created_at` are reset by OMISSION, so the column defaults own
 *  them and a forgotten key cannot smuggle the anchor's value through. Mirrors `occurrenceTierRows`. */
function tierPayload(tier: TierRow, occurrenceId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { event_id: occurrenceId }
  for (const col of TIER_CATALOG_COLUMNS) {
    const value = tier[col]
    if (value === undefined) continue
    row[col] = value
  }
  return row
}

const nameKey = (t: TierRow) =>
  String(t.name ?? '')
    .trim()
    .toLowerCase()

async function main() {
  const now = new Date().toISOString()

  const occurrences = (await rest(
    'events?select=id,slug,title,starts_at,parent_event_id' +
      `&parent_event_id=not.is.null&starts_at=gte.${now}&order=parent_event_id,starts_at`,
  )) as OccurrenceRow[]

  if (occurrences.length === 0) {
    console.log('Nothing to do: no future materialised occurrences exist.')
    return
  }

  const anchorIds = [...new Set(occurrences.map((o) => o.parent_event_id))]
  const cols = ['id', 'event_id', ...TIER_CATALOG_COLUMNS].join(',')

  const anchorTiers = await inBatches(anchorIds, 50, (batch) =>
    rest(
      `event_ticket_types?select=${cols}&event_id=in.(${batch.join(',')})` +
        '&order=event_id,sort_order,created_at',
    ) as Promise<TierRow[]>,
  )
  const byAnchor = new Map<string, TierRow[]>()
  for (const t of anchorTiers) {
    const list = byAnchor.get(t.event_id) ?? []
    // Same dedupe as the mint: the tier's NAME per event is the stable key, so a re-run can never
    // mint a second "Members" beside the one it made last time.
    if (nameKey(t) && !list.some((x) => nameKey(x) === nameKey(t))) list.push(t)
    byAnchor.set(t.event_id, list)
  }

  const occurrenceIds = occurrences.map((o) => o.id)
  const ownTiers = await inBatches(occurrenceIds, 50, (batch) =>
    rest(`event_ticket_types?select=event_id&event_id=in.(${batch.join(',')})`) as Promise<
      { event_id: string }[]
    >,
  )
  const alreadyTiered = new Set(ownTiers.map((t) => t.event_id))

  const todo = occurrences.filter(
    (o) => !alreadyTiered.has(o.id) && (byAnchor.get(o.parent_event_id)?.length ?? 0) > 0,
  )

  console.log(
    `${occurrences.length} future occurrence(s); ${alreadyTiered.size} already carry a tier of their own.\n` +
      `${todo.length} belong to a series whose anchor sells tiers and have none.\n`,
  )
  if (todo.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let written = 0
  let failed = 0
  let lastAnchor = ''

  for (const occ of todo) {
    const tiers = byAnchor.get(occ.parent_event_id) as TierRow[]
    if (occ.parent_event_id !== lastAnchor) {
      lastAnchor = occ.parent_event_id
      console.log(`  series ${occ.parent_event_id} — ${tiers.length} tier(s) to copy per date`)
    }
    const label = `${occ.slug ?? occ.id} (${occ.starts_at.slice(0, 10)})`
    console.log(
      `    ${APPLY ? '✔' : '·'} ${label} ← ${tiers.map((t) => `${t.name}/${t.pricing_mode}`).join(', ')}`,
    )

    if (!APPLY) {
      written += tiers.length
      continue
    }

    // Re-read immediately before the write: a host (or the now-fixed mint) may have given this date
    // its tiers while this was running, and doubling them is the one mistake this script could make
    // that a member would see.
    const fresh = (await rest(
      `event_ticket_types?select=event_id&event_id=eq.${occ.id}&limit=1`,
    )) as { event_id: string }[]
    if (fresh.length > 0) {
      console.log('       (skipped: tiers landed while this was running)')
      continue
    }
    try {
      await rest('event_ticket_types', {
        method: 'POST',
        body: JSON.stringify(tiers.map((t) => tierPayload(t, occ.id))),
        prefer: 'return=minimal',
      })
      written += tiers.length
    } catch (err) {
      failed++
      console.log(`       ✖ ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(
    `\n${APPLY ? 'Wrote' : 'Would write'} ${written} tier row(s) across ${todo.length} date(s).` +
      (failed ? ` ${failed} date(s) failed.` : '') +
      (APPLY ? '' : '\nRe-run with --apply to write them.'),
  )
}

main().catch((err) => {
  console.error('✖', err instanceof Error ? err.message : err)
  process.exit(1)
})
