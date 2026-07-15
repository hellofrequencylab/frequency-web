// The member's NETWORK read model (Resonance CRM master-detail · ADR-459): the two halves of "where
// this member sits in the community" the in-dropdown full profile shows — what they MANAGE (Circles
// they host, Events they host, Spaces they own) and what they are PART OF (the Circles they belong to).
//
// SHAPE (mirrors lib/crm/engagement-stats.ts): the PURE assembler (`assembleNetwork`) has no Supabase/
// Next imports, so it is unit-testable in isolation; the IO reader (`getMemberNetwork`) gathers the
// rows through the service-role admin client and hands them to the assembler. FAIL-SAFE by
// construction: every read is settled independently, so one missing table never sinks the rest, and any
// outright failure degrades to an EMPTY_NETWORK rather than throwing — the pane shows a calm "nothing
// yet" instead of crashing. The caller (the janitor-gated cockpit) is the read authority.
//
// Also holds the PURE `filterMajorMilestones` shaper for the "Path" rail: it keeps only the handful of
// MAJOR life events (joined, started a circle, hosted an event, created a space, invited a friend) out
// of a built journey and drops the navigation / pageview noise. Copy is plain, no em dashes.

import { createAdminClient } from '@/lib/supabase/admin'
import type { JourneyEvent, JourneyKind } from './journey'

/** One thing a member manages or belongs to, as a plain label + an optional in-app link. */
export interface NetworkItem {
  id: string
  label: string
  /** An in-app route to the entity, when there is a safe one (Circles / Events only). */
  href?: string
  /** A short qualifier (a date, a status), when useful. */
  meta?: string
}

/** The member's network: the entities they run, and the Circles they belong to. */
export interface MemberNetwork {
  /** Circles they host (circles.host_id). */
  circlesHosted: NetworkItem[]
  /** Events they host (events.host_id). */
  eventsHosted: NetworkItem[]
  /** Spaces they own (spaces.owner_profile_id). */
  spacesOwned: NetworkItem[]
  /** Circles they are an active member of (memberships). */
  memberOf: NetworkItem[]
}

/** The fail-safe default + the "no network yet" state. */
export const EMPTY_NETWORK: MemberNetwork = {
  circlesHosted: [],
  eventsHosted: [],
  spacesOwned: [],
  memberOf: [],
}

/** True when the member neither manages nor belongs to anything (the empty-state gate). Pure. */
export function isEmptyNetwork(network: MemberNetwork): boolean {
  return (
    network.circlesHosted.length === 0 &&
    network.eventsHosted.length === 0 &&
    network.spacesOwned.length === 0 &&
    network.memberOf.length === 0
  )
}

/** How many entities the member manages (Circles + Events + Spaces). Pure. */
export function managedCount(network: MemberNetwork): number {
  return network.circlesHosted.length + network.eventsHosted.length + network.spacesOwned.length
}

// ── The pure assembler (unit-tested) ──────────────────────────────────────────

/** The minimal raw row shapes the assembler reads (only the fields it maps). */
export interface RawNetworkRows {
  circles?: { id: string; slug: string | null; name: string | null; status?: string | null }[] | null
  events?: { id: string; slug: string | null; title: string | null; starts_at?: string | null; is_cancelled?: boolean | null }[] | null
  spaces?: { id: string; slug: string | null; name: string | null; status?: string | null }[] | null
  /** The Circles the member belongs to (already resolved from their memberships). */
  memberCircles?: { id: string; slug: string | null; name: string | null }[] | null
}

/** A short, plain date for an event milestone (no em dashes). Pure. */
function shortDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Turn the gathered rows into the presentation-neutral MemberNetwork. Pure + deterministic: it drops
 * cancelled events and archived circles/spaces, names each item (falling back to the slug, then a plain
 * placeholder), and links Circles/Events to their public route (Spaces carry no guaranteed public route,
 * so they stay label-only, never a broken link).
 */
export function assembleNetwork(rows: RawNetworkRows): MemberNetwork {
  const circleItem = (c: { id: string; slug: string | null; name: string | null }): NetworkItem => ({
    id: c.id,
    label: (c.name || c.slug || 'Untitled circle').trim(),
    href: c.slug ? `/circles/${c.slug}` : undefined,
  })

  const circlesHosted = (rows.circles ?? [])
    .filter((c) => c && c.status !== 'archived' && c.status !== 'removed')
    .map(circleItem)

  const eventsHosted = (rows.events ?? [])
    .filter((e) => e && !e.is_cancelled)
    .map((e) => ({
      id: e.id,
      label: (e.title || e.slug || 'Untitled event').trim(),
      href: e.slug ? `/events/${e.slug}` : undefined,
      meta: shortDate(e.starts_at),
    }))

  const spacesOwned = (rows.spaces ?? [])
    .filter((s) => s && s.status !== 'archived' && s.status !== 'removed')
    .map((s) => ({
      id: s.id,
      label: (s.name || s.slug || 'Untitled space').trim(),
    }))

  const memberOf = (rows.memberCircles ?? []).filter(Boolean).map(circleItem)

  return { circlesHosted, eventsHosted, spacesOwned, memberOf }
}

// ── The IO reader (fail-safe) ──────────────────────────────────────────────────

/** Settle one read to its rows, or [] on any error (so one failing table never sinks the rest). */
async function safeRows<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await p
    return data ?? []
  } catch {
    return []
  }
}

/**
 * Gather one member's network from the source tables: the Circles + Events they host, the Spaces they
 * own, and the Circles they belong to. FAIL-SAFE: each read is independent, and any error degrades to
 * EMPTY_NETWORK. The caller (the staff-gated cockpit) is the read authority; this is a service-role read.
 */
export async function getMemberNetwork(profileId: string | null): Promise<MemberNetwork> {
  if (!profileId) return EMPTY_NETWORK
  try {
    const admin = createAdminClient()

    // The three "manages" reads + the membership circle-ids, gathered in parallel. The membership rows
    // resolve their Circle names in a second batched read (no per-row N+1, no join-typing surprises).
    const [circles, events, spaces, memberships] = await Promise.all([
      safeRows<{ id: string; slug: string | null; name: string | null; status: string | null }>(
        admin.from('circles').select('id, slug, name, status').eq('host_id', profileId).limit(100),
      ),
      safeRows<{ id: string; slug: string | null; title: string | null; starts_at: string | null; is_cancelled: boolean | null }>(
        admin.from('events').select('id, slug, title, starts_at, is_cancelled').eq('host_id', profileId).limit(100),
      ),
      safeRows<{ id: string; slug: string | null; name: string | null; status: string | null }>(
        (admin as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: string) => { limit: (n: number) => Promise<{ data: { id: string; slug: string | null; name: string | null; status: string | null }[] | null }> }
            }
          }
        })
          .from('spaces')
          .select('id, slug, name, status')
          .eq('owner_profile_id', profileId)
          .limit(100),
      ),
      safeRows<{ circle_id: string }>(
        admin.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active').limit(200),
      ),
    ])

    const circleIds = [...new Set(memberships.map((m) => m.circle_id).filter(Boolean))]
    const memberCircles = circleIds.length
      ? await safeRows<{ id: string; slug: string | null; name: string | null }>(
          admin.from('circles').select('id, slug, name').in('id', circleIds),
        )
      : []

    return assembleNetwork({ circles, events, spaces, memberCircles })
  } catch {
    return EMPTY_NETWORK
  }
}

// ── The "Path" rail: MAJOR milestones only (pure, unit-tested) ─────────────────

/** One major milestone the Path rail renders (a thin projection of a JourneyEvent). */
export interface Milestone {
  kind: JourneyKind
  title: string
  at: string
  detail?: string
}

/** The engagement-ledger events that count as a MAJOR life milestone (started a circle, hosted an
 *  event, created a space, invited a friend). Everything else from the ledger (navigation, pageviews,
 *  generic taps) is noise and is dropped. */
const MAJOR_ENGAGEMENT_RE = /circle|event|space|referr|invit|host|launch|creat|start|found/i

/**
 * Keep only the MAJOR milestones out of a built journey: joined, plus the ledger events that mark a
 * real act of building or connecting (started a circle, hosted an event, created a space, invited a
 * friend). Drops scans, notes, deals, pageviews, and generic navigation, so the rail reads as a short
 * life story, not a firehose. Pure + deterministic; newest first (the input is already sorted so).
 */
export function filterMajorMilestones(events: JourneyEvent[], limit = 8): Milestone[] {
  const out: Milestone[] = []
  for (const e of events ?? []) {
    let keep = false
    if (e.kind === 'joined') keep = true
    else if (e.kind === 'engagement') {
      keep = MAJOR_ENGAGEMENT_RE.test(e.title) || MAJOR_ENGAGEMENT_RE.test(e.channel ?? '')
    }
    if (!keep) continue
    out.push({ kind: e.kind, title: e.title, at: e.at, detail: e.detail })
    if (out.length >= Math.max(1, limit)) break
  }
  return out
}
