// ── MY FREQUENCY — you, and what you run ──────────────────────────────────────────────
//
// The rail's home-anchor disclosure (owner directive 2026-08-06). One row that opens onto the
// member's own things: their profile, the Spaces they run, and the Circles they are in. Each
// row carries a NOTICE COUNT when something is waiting inside it, and the parent row carries
// the total, so a member can see from a folded rail that something wants them.
//
// WHY IT REPLACES THE ACCOUNT DOCK'S LINK LIST. DAWN's three-docks law
// (design_handoff/dawn/guidelines/chrome-docks.card.html) puts exactly this content — "You, and
// what you run: profile, standing, journal ... My Circles, events, listings, Business Spaces" —
// in the bottom-left dock, and its first rule is NEVER TWICE: "a control appears in exactly one
// dock." Shipping My Frequency additively would have put the same links in two places on the same
// rail, four inches apart. So this IS that dock's content, moved to where a member looks first,
// and the dock keeps identity + the account menu only. One You surface.
//
// THE NOTICE COUNT is `notifications` rows for this member that are unread and reference the
// entity — one grouped read for every badge on the menu, not one per row. `reference_type` +
// `reference_id` are already on the table, so nothing new is stored to make this work.
//
// FAIL-SAFE, like every other nav read: any error resolves to an empty menu (the row still
// renders with the member's profile in it). Navigation never blocks and never throws.
//
// 🔴 THE SESSION CLIENT, NOT THE ADMIN ONE (ADR-923, caught by `pnpm check:admin-client`).
// Every read here is a member reading their OWN rows, and RLS already says exactly that:
// `notifications` is gated on `recipient_id = private.get_my_profile_id()`, `memberships` on
// `profile_id = private.get_my_profile_id()`, and `circles` on the authenticated non-archived
// read. So the policies ARE this function's access rule, and reaching for the service key
// would be bypassing a gate that already fits, on a menu that renders for every member on
// every page. The explicit `.eq(...)` filters stay as defense in depth: RLS decides what is
// visible, the filters say what we asked for, and the two agreeing is the point.

// THE DRAFTS COUNT IS THE ONE READ THAT IS NOT A NOTIFICATION (owner ruling 2026-08-12: "wire
// the badge into the My Frequency menu, alongside the /drafts entrance"). It counts OPEN CREATE
// PROPOSALS — the things Vera drew up that a member has not answered yet — because those are the
// only unfinished thing on /drafts that expires in silence if nobody looks (ADR-998 exists to
// close exactly that). A wizard draft you abandoned and a poster you captured are waiting on you,
// not on a clock, so they do not wear a count; that keeps the badge meaning what every other badge
// on this menu means, "something wants an answer from you".
//
// IT COSTS ONE HEAD-COUNT. `countMyCreateProposals` is `head: true` with every filter in SQL
// (see its header: `agent_actions_status_idx` covers the two selective predicates, the ADR-246
// jsonb arrow filters carry the rest), React-cached like this menu, joined into the SAME
// Promise.all as the other three reads so it adds no serial round trip, and fail-safe to 0.
//
// It reaches the audit table through lib/ai/vera/create-entity.ts rather than reading
// `agent_actions` here, which is deliberate on both counts: that module is the ONE path to the
// audit trail (and the only file on the admin-client baseline for it), and it re-derives the
// caller from the session itself, so this menu cannot ask about anybody else's drafts.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import { countMyCreateProposals } from '@/lib/ai/vera/create-entity'

/** One thing the member owns or belongs to, ready to render as a rail row. */
export interface MyFrequencyEntry {
  /** Stable react key + test handle. */
  key: string
  label: string
  href: string
  /** Unread notices waiting inside this entity. 0 renders no badge. */
  notices: number
}

/** The resolved menu: the member's own things, grouped the way the rail draws them. */
export interface MyFrequency {
  /** The member's public profile (always present). */
  profileHref: string
  /** Open create proposals waiting on this member. 0 renders no badge on the Drafts row. */
  drafts: number
  spaces: MyFrequencyEntry[]
  circles: MyFrequencyEntry[]
  /** Sum of every entry's notices — the count the parent "My Frequency" row wears. */
  total: number
}

/** Empty but valid: the profile is always reachable, so the row is never a dead disclosure. */
function emptyFor(profileHref: string): MyFrequency {
  return { profileHref, drafts: 0, spaces: [], circles: [], total: 0 }
}

type NoticeRow = { reference_type: string | null; reference_id: string | null }
type CircleRow = { circle_id: string }
type CircleNameRow = { id: string; name: string | null; slug: string | null }

/**
 * Unread notice counts for this member, keyed `${reference_type}:${reference_id}`.
 *
 * ONE read for the whole menu. Counting in JS rather than SQL is deliberate at this size: the
 * rows are already scoped to one recipient and unread, so the set is small, and a grouped count
 * would need an RPC (the untyped-table client here cannot express `group by`). If a member's
 * unread set ever gets big enough for this to matter, that is a notification-hygiene problem
 * before it is a menu problem.
 */
async function noticeCounts(profileId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const db = await createClient()
  const { data, error } = await db
    .from('notifications')
    .select('reference_type, reference_id')
    .eq('recipient_id', profileId)
    .is('read_at', null)
    .in('reference_type', ['space', 'circle'])
    .limit(500)
  if (error || !data) return out
  for (const row of data as NoticeRow[]) {
    if (!row.reference_type || !row.reference_id) continue
    const key = `${row.reference_type}:${row.reference_id}`
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return out
}

/** The Circles this member is an ACTIVE member of, newest membership first, capped. */
async function myCircles(profileId: string): Promise<CircleNameRow[]> {
  const db = await createClient()
  const { data: memberships, error } = await db
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .limit(MAX_ENTRIES)
  if (error || !memberships?.length) return []
  const ids = (memberships as CircleRow[]).map((m) => m.circle_id).filter(Boolean)
  if (ids.length === 0) return []
  const { data: circles } = await db.from('circles').select('id, name, slug').in('id', ids)
  return (circles ?? []) as CircleNameRow[]
}

/** The menu shows what a member can scan, not everything they have. Past this, the row links
 *  to the full index instead — a disclosure that needs its own scrollbar is a page. */
const MAX_ENTRIES = 8

/**
 * Resolve the My Frequency menu for one member. React-cached per request, so the rail and the
 * mobile drawer share a single resolution. Fail-safe: returns a profile-only menu on any error.
 */
export const getMyFrequency = cache(
  async (profileId: string, handle: string): Promise<MyFrequency> => {
    const profileHref = `/people/${handle}`
    try {
      const [spacesRaw, circlesRaw, notices, drafts] = await Promise.all([
        listOperatedSpaces(profileId),
        myCircles(profileId),
        noticeCounts(profileId),
        countMyCreateProposals(),
      ])

      const spaces: MyFrequencyEntry[] = spacesRaw.slice(0, MAX_ENTRIES).map((s) => ({
        key: `space:${s.id}`,
        label: s.name,
        href: `/spaces/${s.slug}`,
        notices: notices.get(`space:${s.id}`) ?? 0,
      }))

      const circles: MyFrequencyEntry[] = circlesRaw
        .filter((c) => c.slug)
        .slice(0, MAX_ENTRIES)
        .map((c) => ({
          key: `circle:${c.id}`,
          label: c.name ?? 'Circle',
          href: `/circles/${c.slug}`,
          notices: notices.get(`circle:${c.id}`) ?? 0,
        }))

      // The parent row wears the TOTAL, so a FOLDED rail still says something wants you — and a
      // proposal that expires unseen is the one thing on this menu that cannot be recovered.
      const total = [...spaces, ...circles].reduce((n, e) => n + e.notices, drafts)
      return { profileHref, drafts, spaces, circles, total }
    } catch {
      return emptyFor(profileHref)
    }
  },
)
