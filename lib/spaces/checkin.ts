// EVENT SPACE CHECK-IN (ENTITY-SPACES-BUILD §C, Phase 2: "Event Space check-in: point a code at a
// check-in node (reuses nodes/captures, free)"). The library behind the owner's door check-in roster,
// the Event Space analog of lib/spaces/memberships.ts. It does NOT rebuild scanning: a check-in IS an
// ordinary node capture run by the existing /n/<nodeId> claim path (verify -> ledger -> captures row).
// What this module owns is TENANCY + the OWNER ROSTER:
//   • ensureCheckinNode(spaceId) — create-or-get THIS Space's one check-in node (nodes.kind='checkin',
//     nodes.space_id=spaceId). Idempotent: a Space has exactly one check-in node, reused across events.
//   • listCheckins(spaceId, sinceTs?) — the roster: the captures for this Space's check-in node, newest
//     first, with each checker's display name. Space A can never read Space B's check-ins.
//   • countCheckins(spaceId, sinceTs?) — the analytics count for the StatCard.
//
// Backed by the service-role admin client plus untyped casts (the new space_id/kind columns are not in
// the generated DB types yet, ADR-246, mirroring lib/spaces/memberships.ts). The server is the
// authority for "which Space" and "what may this caller do here" (P5, ADR-328/329): the OWNER reads +
// the node-create are gated on canEditProfile (a janitor previewing as staff may READ); the actual
// scan-capture stays on the existing PUBLIC claim path and is NOT forked here. Reads FAIL-SAFE (empty
// / null); writes FAIL-CLOSED on a permission miss.
//
// SHAPE: the PURE helpers (timestamp + limit normalization) have no Supabase/Next imports, so they are
// fully unit-testable (lib/spaces/checkin.test.ts). The IO (admin-client reads/writes) is a thin layer
// below them. This module has NO 'use server' directive (so it can ALSO export the pure helpers + the
// types the surfaces import). SERVER components import the read helpers straight from here; there are
// no client-callable mutations (the node is ensured server-side when the owner opens the surface).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** This Space's check-in node, as the surface consumes it. `secret` rides the QR URL so a forged
 *  node-id link can't claim (verifyCapture checks the match); it is owner-visible only (this surface
 *  is canEditProfile-gated). */
export interface CheckinNode {
  id: string
  /** A server-issued signing token, when the node was created with one (null otherwise). */
  secret: string | null
}

/** One person's check-in (the owner roster row): who checked in + when. */
export interface CheckinEntry {
  /** The capture id (a stable React key). */
  id: string
  profileId: string
  /** Display name, or a generic fallback when the profile can't be resolved. */
  name: string
  handle: string | null
  avatarUrl: string | null
  /** ISO timestamp of the check-in (captures.captured_at). */
  checkedInAt: string
}

// A generous cap on a roster page so a hostile/huge Space can never pull an unbounded result set.
const MAX_ROSTER = 500

// ── PURE: input normalization (no IO, fully testable) ───────────────────────────────────────────

/** Coerce a raw `since` to a valid ISO timestamp string, or null. A non-string / unparseable value
 *  reads as null (no lower bound), so a malformed filter never throws and never widens access. Pure. */
export function normalizeSince(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

// ── IO: the untyped admin-client seams (space_id/kind not in generated types yet, ADR-246) ──────

type NodeRow = { id: string; secret: string | null; space_id: string; kind: string }
type CaptureRow = { id: string; actor_profile_id: string; captured_at: string }

type NodeQuery = {
  select: (cols: string) => NodeQuery
  eq: (col: string, val: string) => NodeQuery
  order: (col: string, opts: { ascending: boolean }) => NodeQuery
  limit: (n: number) => NodeQuery
  insert: (rows: Record<string, unknown>[]) => NodeQuery
  maybeSingle: () => Promise<{ data: NodeRow | null; error: unknown }>
}
type CaptureQuery = {
  select: (cols: string) => CaptureQuery
  eq: (col: string, val: string) => CaptureQuery
  gte: (col: string, val: string) => CaptureQuery
  order: (col: string, opts: { ascending: boolean }) => CaptureQuery
  limit: (n: number) => CaptureQuery
  then: (
    resolve: (r: { data: CaptureRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function nodesTable(): NodeQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => NodeQuery }
  return db.from('nodes')
}
function capturesTable(): CaptureQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => CaptureQuery }
  return db.from('captures')
}

const NODE_COLS = 'id, secret, space_id, kind'
const CAPTURE_COLS = 'id, actor_profile_id, captured_at'

/** Read THIS Space's existing check-in node, or null (service-role; FAIL-SAFE to null). */
async function readCheckinNode(spaceId: string): Promise<NodeRow | null> {
  try {
    const { data } = await nodesTable()
      .select(NODE_COLS)
      .eq('space_id', spaceId)
      .eq('kind', 'checkin')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return data
  } catch {
    return null
  }
}

/** Insert a check-in node for THIS Space (service-role). A check-in node is a `qr` node (so a scan
 *  routes through the normal /n/<nodeId> pipeline) marked kind='checkin' + scoped to the Space. A
 *  random secret is issued so a forged node-id-only URL can't claim it. FAIL-SAFE to null on error. */
async function insertCheckinNode(spaceId: string, label: string): Promise<NodeRow | null> {
  try {
    const secret = randomSecret()
    const { data } = await nodesTable()
      .insert([
        {
          type: 'qr', // the engagement SOURCE/transport; capture pipeline reads this, not `kind`
          kind: 'checkin', // the orthogonal Space-check-in marker
          space_id: spaceId,
          label,
          secret,
          capture_rule: 'repeatable', // a member may check in to an event more than once over time
          zaps_value: 0, // a check-in is presence, not a reward bump (no economy churn)
          active: true,
        },
      ])
      .select(NODE_COLS)
      .maybeSingle()
    return data
  } catch {
    return null
  }
}

/** A short, URL-safe signing token for a check-in node (server-issued; rides the QR as `?s=`). */
function randomSecret(): string {
  // crypto.randomUUID is available in the Node + Edge runtimes this code runs in; the hyphen-stripped
  // uuid is a 32-char opaque token, plenty for a scan signing secret.
  return globalThis.crypto.randomUUID().replace(/-/g, '')
}

/** Count THIS node's captures (optionally since `since`) with a head/count query: no rows returned,
 *  no name join, just the number. FAIL-SAFE to 0 on any error. The node id is the caller's already
 *  space-scoped node, so this never reaches past the tenant. */
async function countCaptures(nodeId: string, since: string | null): Promise<number> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            gte: (col: string, val: string) => Promise<{ count: number | null }>
          } & Promise<{ count: number | null }>
        }
      }
    }
    const base = db.from('captures').select('id', { count: 'exact', head: true }).eq('node_id', nodeId)
    const { count } = await (since ? base.gte('captured_at', since) : base)
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

/** Batch-read display name + handle + avatar for a set of profile ids (service-role; FAIL-SAFE to an
 *  empty map). Mirrors lib/spaces/memberships.ts readMemberNames, with the extra roster fields. */
async function readCheckers(
  ids: string[],
): Promise<Map<string, { name: string; handle: string | null; avatarUrl: string | null }>> {
  const out = new Map<string, { name: string; handle: string | null; avatarUrl: string | null }>()
  if (ids.length === 0) return out
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (
            col: string,
            vals: string[],
          ) => Promise<{
            data:
              | { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[]
              | null
          }>
        }
      }
    }
    const { data } = await db
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', ids)
    for (const p of data ?? []) {
      out.set(p.id, {
        name: p.display_name?.trim() || 'A member',
        handle: p.handle?.trim() || null,
        avatarUrl: p.avatar_url ?? null,
      })
    }
  } catch {
    // fall through to the empty map (callers default to 'A member')
  }
  return out
}

// ── OWNER GATE (shared by every owner read/ensure) ──────────────────────────────────────────────

/** Resolve the caller + confirm they may READ this Space's owner back-end: canEditProfile (owner /
 *  admin / editor) OR a platform janitor previewing as staff. Returns the resolved Space when allowed,
 *  else null. FAIL-SAFE: anonymous / missing Space / error -> null (callers then read empty). */
async function ownerGate(spaceId: string): Promise<boolean> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return false
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  return caps.canEditProfile || isJanitor(caller?.webRole)
}

// ── PUBLIC: owner helpers (all gated / FAIL-SAFE) ───────────────────────────────────────────────

/**
 * Create-or-get THIS Space's one check-in node. Gated on the OWNER read gate (canEditProfile, or a
 * janitor previewing). Idempotent: returns the existing kind='checkin' node for the Space, else
 * creates one. A staff PREVIEWER (janitor, not an editor) reads the node if one exists but does NOT
 * create one (creation is a write; only canEditProfile may mint the node). FAIL-SAFE to null.
 */
export async function ensureCheckinNode(spaceId: string): Promise<CheckinNode | null> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  const canEdit = caps.canEditProfile
  if (!canEdit && !isJanitor(caller?.webRole)) return null

  const existing = await readCheckinNode(spaceId)
  if (existing) return { id: existing.id, secret: existing.secret }

  // No node yet: only an EDITOR may create one (a staff previewer reads, never writes).
  if (!canEdit) return null
  const label = `${space.brandName ?? space.name} check-in`
  const created = await insertCheckinNode(spaceId, label)
  return created ? { id: created.id, secret: created.secret } : null
}

/**
 * The roster: who checked in at THIS Space, newest first. Gated on the OWNER read gate. Reads the
 * Space's check-in node, then its captures (optionally since `sinceTs`), then resolves checker names
 * in a batched lookup. CROSS-SPACE ISOLATION: the node lookup is scoped to `space_id`, so a caller for
 * Space A can never read Space B's check-ins even with a leaked node id. FAIL-SAFE to [].
 */
export async function listCheckins(spaceId: string, sinceTs?: string): Promise<CheckinEntry[]> {
  if (!(await ownerGate(spaceId))) return []
  const since = normalizeSince(sinceTs)

  try {
    const node = await readCheckinNode(spaceId)
    if (!node) return [] // no check-in node yet -> empty roster

    let q = capturesTable()
      .select(CAPTURE_COLS)
      .eq('node_id', node.id)
      .order('captured_at', { ascending: false })
      .limit(MAX_ROSTER)
    if (since) q = q.gte('captured_at', since)

    const { data, error } = (await q) as { data: CaptureRow[] | null; error: unknown }
    if (error || !data || data.length === 0) return []

    const ids = [...new Set(data.map((r) => r.actor_profile_id))]
    const people = await readCheckers(ids)
    return data.map((r) => {
      const p = people.get(r.actor_profile_id)
      return {
        id: r.id,
        profileId: r.actor_profile_id,
        name: p?.name ?? 'A member',
        handle: p?.handle ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        checkedInAt: r.captured_at,
      }
    })
  } catch {
    return []
  }
}

/**
 * The check-in COUNT for THIS Space (optionally since `sinceTs`), for the analytics StatCard. Gated on
 * the OWNER read gate. FAIL-SAFE to 0. Counts DISTINCT checkers is intentionally NOT done here (a
 * repeatable node can record more than one capture per person); this is the raw check-in count, which
 * is what a door roster shows. A distinct-people metric is an additive later read, never a refactor.
 *
 * PERF: a head/count query (no rows, no name join), not listCheckins(...).length, so the StatCard never
 * pulls up to 500 capture rows + a profiles batch just to read a number. Same isolation: the node is
 * resolved scoped to space_id, so Space A can never count Space B's captures even with a leaked node id.
 */
export async function countCheckins(spaceId: string, sinceTs?: string): Promise<number> {
  if (!(await ownerGate(spaceId))) return 0
  const since = normalizeSince(sinceTs)

  const node = await readCheckinNode(spaceId)
  if (!node) return 0 // no check-in node yet -> zero check-ins
  return countCaptures(node.id, since)
}
