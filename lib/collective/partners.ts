// Collective Partners (SCAN-982, owner spec 2026-10-16). Collective is many owners working together;
// Network is one owner running many groups. The test is ownership: a partner Space is owned by SOMEONE
// ELSE and opts in. A partnership never grants membership, payouts, settings or editing on either side.
import { isCollectivePlan, isNetworkPlan } from './member-spaces'

/** The most partner Spaces one Collective hub links. Pending invites count, so a hub cannot flood invites. */
export const COLLECTIVE_PARTNER_CAP = 10

type PartnerStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export const LIVE_PARTNER_STATUSES: readonly PartnerStatus[] = ['pending', 'accepted']

export interface PartnershipRow {
  id: string; hub_space_id: string; partner_space_id: string; status: string
  invited_by: string | null; responded_by: string | null; created_at?: string | null
}
/** The spaces columns a partnership decision reads (the same shape the cross-listing store loads). */
export interface PartnerSpaceFacts {
  id: string; owner_profile_id: string | null; plan: string | null; status: string | null
  visibility: string | null; parent_id: string | null; type?: string | null
}

/** A hub is an active, top-level Collective Space with an owner. */
export function isPartnerHub(space: PartnerSpaceFacts | null | undefined): boolean {
  return !!space && space.status === 'active' && space.type !== 'root' && space.parent_id === null
    && !!space.owner_profile_id && isCollectivePlan(space.plan)
}

/** A Space can be a partner while it is active, visible and has an owner. Its plan does not matter. */
export function canBePartner(space: PartnerSpaceFacts | null | undefined): boolean {
  return !!space && space.status === 'active' && space.type !== 'root' && space.visibility !== 'private' && !!space.owner_profile_id
}

/** The plan decides the tab: a Collective shows Partners, a Network shows its chapters. Never both. */
type SpacePlanTab = 'partners' | 'network' | null
export function spacePlanTab(space: { plan?: string | null; status?: string | null; ownerProfileId?: string | null; networkConnected?: boolean | null; type?: string | null }): SpacePlanTab {
  if (space.status !== 'active' || !space.ownerProfileId || space.type === 'root') return null
  if (isCollectivePlan(space.plan)) return 'partners'
  if (isNetworkPlan(space.plan) && space.networkConnected === true) return 'network'
  return null
}

function livePartnerships<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter(row => (LIVE_PARTNER_STATUSES as readonly string[]).includes(row.status))
}
export function partnerSlotsLeft(rows: readonly { status: string }[]): number {
  return Math.max(0, COLLECTIVE_PARTNER_CAP - livePartnerships(rows).length)
}

/** Why an invite is refused, or null when the hub owner may send it. `rows` are the hub's partnerships. */
export function partnerInviteRefusal(hub: PartnerSpaceFacts | null, partner: PartnerSpaceFacts | null, callerId: string | null, rows: readonly PartnershipRow[]): string | null {
  if (!callerId || !hub || hub.owner_profile_id !== callerId) return 'Not allowed.'
  if (!isPartnerHub(hub)) return 'Partners need an active Collective plan.'
  if (!partner || !canBePartner(partner) || partner.id === hub.id) return 'Choose an active Space with a visible profile.'
  // The ownership test: a Space you own belongs under Network, not Partners.
  if (partner.owner_profile_id === hub.owner_profile_id) return 'That Space is yours. Partners are Spaces owned by other people.'
  if (livePartnerships(rows).some(row => row.partner_space_id === partner.id)) return 'That Space is already invited or a partner.'
  if (partnerSlotsLeft(rows) === 0) return `A Collective links up to ${COLLECTIVE_PARTNER_CAP} partner Spaces.`
  return null
}

/** Only the partner owner answers an invite. Either side can withdraw or leave. */
export function canRespondToPartnerInvite(status: string, side: 'hub' | 'partner', next: string): boolean {
  if (next === 'revoked') return status === 'pending' || status === 'accepted'
  return side === 'partner' && status === 'pending' && (next === 'accepted' || next === 'declined')
}

/** An accepted partnership counts only while the consent still matches today's owners. */
export function partnershipLive(row: PartnershipRow, hub: PartnerSpaceFacts | null | undefined, partner: PartnerSpaceFacts | null | undefined): boolean {
  return row.status === 'accepted' && isPartnerHub(hub) && canBePartner(partner)
    && hub!.owner_profile_id === row.invited_by && partner!.owner_profile_id === row.responded_by
    && hub!.owner_profile_id !== partner!.owner_profile_id && hub!.id === row.hub_space_id && partner!.id === row.partner_space_id
}

/** One cross-listed Journey or Circle as the Partners tab shows it. */
export interface PartnerListing { kind: 'journey' | 'circle'; id: string; slug: string; label: string; sourceSpaceId: string; targetSpaceId: string }
/** Keep a listing only when both ends are in this Collective (the hub or a live partner), deduped. */
export function collectiveListings(subjects: readonly { target: string; kind: 'journey' | 'circle'; subject: Record<string, unknown> }[], memberIds: ReadonlySet<string>): PartnerListing[] {
  const seen = new Set<string>()
  const out: PartnerListing[] = []
  for (const { target, kind, subject } of subjects) {
    const source = typeof subject.space_id === 'string' ? subject.space_id : null
    const id = typeof subject.id === 'string' ? subject.id : null
    const slug = typeof subject.slug === 'string' ? subject.slug : null
    const label = kind === 'journey' ? subject.title : subject.name
    if (!source || !id || !slug || typeof label !== 'string' || source === target || !memberIds.has(source) || !memberIds.has(target)) continue
    const key = `${kind}:${id}:${target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, id, slug, label, sourceSpaceId: source, targetSpaceId: target })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

/** Accept a bare handle, an @handle, or a pasted /spaces/<handle> link. */
export function partnerHandle(input: unknown): string | null {
  const raw = String(input ?? '').trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
  const handle = raw.includes('/spaces/') ? raw.split('/spaces/')[1]?.split('/')[0] ?? '' : raw.replace(/^@/, '')
  return /^[a-z0-9][a-z0-9-]{0,252}$/.test(handle) ? handle : null
}
