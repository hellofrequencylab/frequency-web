// REGULARS HUNTS, the IO half (LIVE-941, ADR-1781, docs/LOYALTY.md). Reads and writes on loyalty_hunts,
// loyalty_hunt_stops and loyalty_hunt_completions through the service-role admin client; every table is
// service-role only (scripts/table-grants.txt `internal`), so THIS file is the tenancy wall: the public
// read is by slug and shows only what the hunt page prints, every other read is scoped to one Space or
// one member, and each write runs after the same owner gate the cards use (loyaltyOwnerGate). Reads
// FAIL-SAFE (null / []); writes FAIL-CLOSED on a gate miss. The actions live in ./hunt-actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { memberDay } from '@/lib/member-day'
import { huntLiveBlocker, huntSlug, type HuntInput, type HuntProgress, type HuntStop, type LoyaltyHunt } from './hunts'
import { loyaltyEligibility, loyaltyOwnerGate } from './store'

type HuntRow = {
  id: string
  slug: string
  host_space_id: string
  title: string
  description: string | null
  starts_on: string
  ends_on: string
  reward_title: string
  reward_value_cents: number
  reward_note: string | null
  status: string
}
const HUNT_COLS = 'id, slug, host_space_id, title, description, starts_on, ends_on, reward_title, reward_value_cents, reward_note, status'

type StopRow = { hunt_id: string; space_id: string; status: string; position: number }
type SpaceLite = { id: string; slug: string; name: string; brand_name: string | null }

function statusOf(s: string): LoyaltyHunt['status'] {
  return s === 'live' ? 'live' : s === 'ended' ? 'ended' : 'draft'
}

/** Hydrate hunt rows with their stops and the Space names, in one pair of reads. */
async function hydrate(rows: HuntRow[]): Promise<LoyaltyHunt[]> {
  if (rows.length === 0) return []
  const db = createAdminClient()
  const huntIds = rows.map((r) => r.id)
  const { data: stops } = await db
    .from('loyalty_hunt_stops')
    .select('hunt_id, space_id, status, position')
    .in('hunt_id', huntIds)
    .order('position', { ascending: true })
  const stopRows = (stops ?? []) as StopRow[]
  const spaceIds = [...new Set([...rows.map((r) => r.host_space_id), ...stopRows.map((s) => s.space_id)])]
  const { data: spaces } = await db.from('spaces').select('id, slug, name, brand_name').in('id', spaceIds)
  const byId = new Map(((spaces ?? []) as SpaceLite[]).map((s) => [s.id, s]))
  const nameOf = (id: string) => {
    const s = byId.get(id)
    return s ? (s.brand_name ?? s.name) : 'A Space'
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    hostSpaceId: r.host_space_id,
    hostSpaceName: nameOf(r.host_space_id),
    title: r.title,
    description: r.description,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    rewardTitle: r.reward_title,
    rewardValueCents: r.reward_value_cents,
    rewardNote: r.reward_note,
    status: statusOf(r.status),
    stops: stopRows
      .filter((s) => s.hunt_id === r.id)
      .map<HuntStop>((s) => ({
        spaceId: s.space_id,
        spaceName: nameOf(s.space_id),
        spaceSlug: byId.get(s.space_id)?.slug ?? '',
        status: s.status === 'accepted' ? 'accepted' : s.status === 'declined' ? 'declined' : 'invited',
        host: s.space_id === r.host_space_id,
      })),
  }))
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

/** The public hunt page's read: a live or ended hunt by slug (a draft is the host's alone). FAIL-SAFE. */
export async function getPublicHunt(slug: string): Promise<LoyaltyHunt | null> {
  try {
    const { data } = await createAdminClient().from('loyalty_hunts').select(HUNT_COLS).eq('slug', slug).neq('status', 'draft').maybeSingle()
    if (!data) return null
    const [hunt] = await hydrate([data as HuntRow])
    return hunt ?? null
  } catch {
    return null
  }
}

/** Every hunt THIS Space hosts or was invited to, newest first. Owner-gated (a janitor may preview). */
export async function listHuntsForSpace(spaceId: string): Promise<LoyaltyHunt[]> {
  if (!(await loyaltyOwnerGate(spaceId))) return []
  try {
    const db = createAdminClient()
    const { data: mine } = await db.from('loyalty_hunt_stops').select('hunt_id').eq('space_id', spaceId).limit(200)
    const ids = [...new Set(((mine ?? []) as { hunt_id: string }[]).map((s) => s.hunt_id))]
    if (ids.length === 0) return []
    const { data } = await db.from('loyalty_hunts').select(HUNT_COLS).in('id', ids).order('created_at', { ascending: false }).limit(100)
    return hydrate((data ?? []) as HuntRow[])
  } catch {
    return []
  }
}

/** The member's standing on the live hunts they have started, newest end first. Scoped to the caller. */
export async function listMyHuntProgress(profileId: string): Promise<HuntProgress[]> {
  try {
    const db = createAdminClient()
    const today = memberDay(null)
    const { data: hunts } = await db.from('loyalty_hunts').select(HUNT_COLS).eq('status', 'live').lte('starts_on', today).gte('ends_on', today).limit(100)
    const rows = (hunts ?? []) as HuntRow[]
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    const [{ data: stops }, { data: done }] = await Promise.all([
      db.from('loyalty_hunt_stops').select('hunt_id, space_id, status, position').in('hunt_id', ids).eq('status', 'accepted'),
      db.from('loyalty_hunt_completions').select('hunt_id').eq('profile_id', profileId).in('hunt_id', ids),
    ])
    const stopRows = (stops ?? []) as StopRow[]
    const spaceIds = [...new Set(stopRows.map((s) => s.space_id))]
    const { data: stamps } = spaceIds.length
      ? await db.from('loyalty_stamps').select('space_id, visit_day').eq('profile_id', profileId).eq('kind', 'visit').in('space_id', spaceIds).limit(2000)
      : { data: [] }
    const stampRows = (stamps ?? []) as { space_id: string; visit_day: string }[]
    const completed = new Set(((done ?? []) as { hunt_id: string }[]).map((d) => d.hunt_id))
    const out: HuntProgress[] = []
    for (const h of rows) {
      const hs = stopRows.filter((s) => s.hunt_id === h.id)
      const visited = hs.filter((s) => stampRows.some((st) => st.space_id === s.space_id && st.visit_day >= h.starts_on && st.visit_day <= h.ends_on)).length
      if (visited === 0 && !completed.has(h.id)) continue
      out.push({
        huntId: h.id,
        slug: h.slug,
        title: h.title,
        hostSpaceId: h.host_space_id,
        stopsDone: visited,
        stopsTotal: hs.length,
        completed: completed.has(h.id) || (hs.length > 0 && visited >= hs.length),
        earnedCode: null,
        rewardTitle: h.reward_title,
      })
    }
    return out.sort((a, b) => Number(a.completed) - Number(b.completed))
  } catch {
    return []
  }
}

/** Which of a hunt's stops THIS member has visited inside the window, for the hunt page. Scoped to the caller. */
export async function visitedStops(hunt: LoyaltyHunt, profileId: string): Promise<Set<string>> {
  try {
    const ids = hunt.stops.filter((s) => s.status === 'accepted').map((s) => s.spaceId)
    if (ids.length === 0) return new Set()
    const { data } = await createAdminClient()
      .from('loyalty_stamps')
      .select('space_id')
      .eq('profile_id', profileId)
      .eq('kind', 'visit')
      .in('space_id', ids)
      .gte('visit_day', hunt.startsOn)
      .lte('visit_day', hunt.endsOn)
    return new Set(((data ?? []) as { space_id: string }[]).map((s) => s.space_id))
  } catch {
    return new Set()
  }
}

// ── Writes (owner-gated; called only from ./hunt-actions.ts) ─────────────────────────────────────

/** Create a draft hunt hosted by THIS Space, with the host as its first accepted stop. Null on a gate
 *  miss or a Space that cannot run Regulars. */
export async function writeHunt(spaceId: string, input: HuntInput): Promise<LoyaltyHunt | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  if ((await loyaltyEligibility(gate.space)) !== null) return null
  const db = createAdminClient()
  const tail = Math.random().toString(36).slice(2, 8)
  const { data, error } = await db
    .from('loyalty_hunts')
    .insert({
      host_space_id: spaceId,
      slug: huntSlug(input.title, tail),
      title: input.title,
      description: input.description,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      reward_title: input.rewardTitle,
      reward_value_cents: input.rewardValueCents,
      reward_note: input.rewardNote,
      created_by: gate.callerId,
    })
    .select(HUNT_COLS)
    .maybeSingle()
  if (error || !data) return null
  const row = data as HuntRow
  await db.from('loyalty_hunt_stops').insert({
    hunt_id: row.id,
    space_id: spaceId,
    status: 'accepted',
    position: 0,
    responded_at: new Date().toISOString(),
    responded_by: gate.callerId,
  })
  const [hunt] = await hydrate([row])
  return hunt ?? null
}

/** Invite a Space by slug to be a stop. The invited Space must run Regulars (its stamps are the progress).
 *  Returns 'done' | 'already' | 'unknown' | 'not_running' | 'full' | null (gate miss). */
export async function writeHuntInvite(
  spaceId: string,
  huntId: string,
  stopSlug: string,
): Promise<'done' | 'already' | 'unknown' | 'not_running' | 'full' | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  const db = createAdminClient()
  const { data: hunt } = await db.from('loyalty_hunts').select('id, status').eq('id', huntId).eq('host_space_id', spaceId).maybeSingle()
  if (!hunt || (hunt as { status: string }).status === 'ended') return null
  const stop = await getSpaceBySlug(stopSlug.trim().toLowerCase())
  if (!stop || stop.status !== 'active') return 'unknown'
  const { data: program } = await db.from('space_loyalty_programs').select('status').eq('space_id', stop.id).maybeSingle()
  if (!program || (program as { status: string }).status !== 'on') return 'not_running'
  const { count } = await db.from('loyalty_hunt_stops').select('space_id', { count: 'exact', head: true }).eq('hunt_id', huntId)
  if ((count ?? 0) >= 12) return 'full'
  const { error } = await db.from('loyalty_hunt_stops').insert({ hunt_id: huntId, space_id: stop.id, status: 'invited', position: count ?? 0 })
  if (error) return error.code === '23505' ? 'already' : null
  return 'done'
}

/** An invited Space says yes or no. Gated on THAT Space's owner. Null on a gate miss or no invite. */
export async function writeHuntReply(spaceId: string, huntId: string, accept: boolean): Promise<boolean | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  const { data, error } = await createAdminClient()
    .from('loyalty_hunt_stops')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString(), responded_by: gate.callerId })
    .eq('hunt_id', huntId)
    .eq('space_id', spaceId)
    .neq('space_id', (await hostOf(huntId)) ?? '')
    .select('space_id')
    .maybeSingle()
  if (error || !data) return null
  return true
}

async function hostOf(huntId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('loyalty_hunts').select('host_space_id').eq('id', huntId).maybeSingle()
  return (data as { host_space_id: string } | null)?.host_space_id ?? null
}

/** The host takes a draft live (three accepted stops and a window still ahead) or ends a live hunt.
 *  Returns null on a gate miss, or the one sentence that blocks it. */
export async function writeHuntStatus(spaceId: string, huntId: string, next: 'live' | 'ended'): Promise<{ ok: true } | { error: string } | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  const db = createAdminClient()
  const { data } = await db.from('loyalty_hunts').select(HUNT_COLS).eq('id', huntId).eq('host_space_id', spaceId).maybeSingle()
  if (!data) return null
  const [hunt] = await hydrate([data as HuntRow])
  if (!hunt) return null
  if (next === 'live') {
    if (hunt.status !== 'draft') return { error: 'This hunt is already past its draft.' }
    const blocker = huntLiveBlocker(hunt, memberDay(null))
    if (blocker) return { error: blocker }
  } else if (hunt.status !== 'live') {
    return { error: 'Only a live hunt can be ended.' }
  }
  const { error } = await db.from('loyalty_hunts').update({ status: next, updated_at: new Date().toISOString() }).eq('id', huntId).eq('host_space_id', spaceId)
  return error ? { error: 'Could not change the hunt.' } : { ok: true }
}
