// NETWORK-ONLY TOOLS (SCAN-983, owner spec 2026-10-16): chapter leaders, central admins and the approval
// queue. A Network is one owner running many chapters; a Collective is many owners partnering, so none of
// this applies to a Collective and its behaviour is unchanged.
//
// PURE half: no Supabase or Next imports. The store (./network-tools-store.ts) reads the rows and asks
// these questions; the tests exercise them directly.
//
//   * A CHAPTER LEADER is an active `admin` space_members row on one chapter. The ordinary per-Space role,
//     so a leader of chapter A holds nothing on chapter B or the parent.
//   * A CENTRAL ADMIN is named by the owner on the parent (network_central_admins, at most
//     NETWORK_PLAN.centralAdmins) and must also be an active admin of the parent. They get admin of every
//     current chapter, never the owner's billing (isOwner stays false).
//   * The APPROVAL QUEUE: a chapter event shows on the network calendar and home only once the owner or a
//     central admin approves it. The parent's own events never wait.
import { NETWORK_PLAN, PLAN_CAPABILITY_RANK, planRank } from '@/lib/pricing/plans'

export interface NetworkToolsSpace {
  id: string
  plan: string | null
  status: string | null
  type: string | null
  parent_id: string | null
  owner_profile_id: string | null
}

/** Does this Space run the Network tools? An active, top-level, non-root Space on the Network plan. PURE. */
export function networkToolsOpen(space: Pick<NetworkToolsSpace, 'plan' | 'status' | 'type' | 'parent_id' | 'owner_profile_id'> | null | undefined): boolean {
  return !!space && planRank(space.plan) >= PLAN_CAPABILITY_RANK.network && space.status === 'active'
    && space.type !== 'root' && space.parent_id === null && !!space.owner_profile_id
}

/** Is `chapter` a current chapter of `parent`? Same owner, active, not root, directly attached. PURE. */
export function isNetworkChapter(chapter: NetworkToolsSpace | null | undefined, parent: NetworkToolsSpace | null | undefined): boolean {
  return !!chapter && !!parent && networkToolsOpen(parent) && chapter.id !== parent.id && chapter.parent_id === parent.id
    && chapter.owner_profile_id === parent.owner_profile_id && chapter.status === 'active' && chapter.type !== 'root'
}

/** Does a central admin row reach this chapter? The parent is a live Network, the Space is one of its
 *  chapters, the person is named on the parent AND is still an active admin of it (suspending or
 *  demoting them on the parent ends the reach on the next read). PURE, fail-closed. */
export function centralAdminReachesChapter(input: {
  chapter: NetworkToolsSpace | null | undefined
  parent: NetworkToolsSpace | null | undefined
  named: boolean
  parentMembership: { role: string; status: string } | null | undefined
}): boolean {
  const { chapter, parent, named, parentMembership } = input
  return named && isNetworkChapter(chapter, parent)
    && parentMembership?.status === 'active' && parentMembership.role === 'admin'
}

/** Can one more central admin be named? The database re-checks this under a parent lock. PURE. */
export function centralAdminSeatOpen(named: number): boolean {
  return Number.isSafeInteger(named) && named >= 0 && named < NETWORK_PLAN.centralAdmins
}

/** May this caller run the parent's Chapters area (approve events, assign leaders)? The owner, or a
 *  central admin who is still an active admin of the parent. Naming central admins stays owner only. PURE. */
export function canRunNetworkTools(input: {
  parent: NetworkToolsSpace | null | undefined
  callerId: string | null | undefined
  named: boolean
  parentMembership: { role: string; status: string } | null | undefined
}): boolean {
  const { parent, callerId, named, parentMembership } = input
  if (!callerId || !parent || !networkToolsOpen(parent)) return false
  if (parent.owner_profile_id === callerId) return true
  return named && parentMembership?.status === 'active' && parentMembership.role === 'admin'
}

export type NetworkEventDecision = 'approved' | 'declined'

/** Does an event show network-wide? On a Network, only when the parent itself is one of its sources or
 *  the event was approved. Every other plan keeps today's rule (every member Space event shows). PURE. */
export function networkEventShown(input: {
  network: boolean
  fromParent: boolean
  decision: NetworkEventDecision | null | undefined
}): boolean {
  if (!input.network || input.fromParent) return true
  return input.decision === 'approved'
}

export interface QueueCandidate { id: string; slug: string; title: string; starts_at: string; time_zone?: string | null; is_cancelled?: boolean | null; chapterId: string; chapterName: string }

/** The approval queue: upcoming chapter events with no decision yet, soonest first, one row per event.
 *  An event the parent already shows (it hosts it or accepted a share) never queues. PURE. */
export function pendingNetworkEvents(candidates: readonly QueueCandidate[], decided: ReadonlySet<string>,
  fromParent: ReadonlySet<string>, nowIso: string, limit = 50): QueueCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(row => {
    if (seen.has(row.id) || decided.has(row.id) || fromParent.has(row.id) || row.is_cancelled || row.starts_at < nowIso) return false
    seen.add(row.id)
    return true
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id)).slice(0, limit)
}
