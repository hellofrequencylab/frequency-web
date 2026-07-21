import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Collaborator spaces (ADR-799 §B) — the service-role READS + PURE resolvers behind the collaborator
// relationship. The WRITES (request / accept / decline / revoke) live in the 'use server' module
// app/(main)/spaces/[slug]/collaborations-actions.ts (a server-action module may export only async
// functions, so these reads + types + pure helpers cannot live there). SERVER components import the
// reads straight from here; the actions import the pure helpers for their authz decision.
//
// The row IS the relationship (unlike event_placement_requests, approval sets no external column). The
// table is newer than the generated Database types, so we reach it through an untyped admin handle
// (ADR-246, the same convention as lib/events/placement.ts). Reads FAIL-SAFE (empty / null on any error).

export type CollaborationStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

/** A raw space_collaborations row (the shape the actions' authz path loads). */
export interface CollaborationRow {
  id: string
  host_space_id: string
  collaborator_space_id: string
  invited_by_space_id: string
  status: CollaborationStatus
  requested_by: string
  created_at: string | null
}

/** One collaboration as a viewer's space sees it: the OTHER party resolved for display, this space's
 *  role in it, and whether this space's owner/admin is the one who must approve a pending row. */
export interface CollaborationView {
  id: string
  status: CollaborationStatus
  /** From `forSpaceId`'s perspective: is it the host of this collaboration, or the collaborator? */
  role: 'host' | 'collaborator'
  /** The OTHER space (what the card + cross-link render). */
  partner: { id: string; slug: string; name: string; logoUrl: string | null; tagline: string | null }
  /** True when `forSpaceId` did NOT initiate a pending row (so its owner/admin is the approver). */
  awaitingMyApproval: boolean
  createdAt: string | null
}

// ── PURE helpers (no IO, unit-tested) ───────────────────────────────────────────────────────────────

/** The space id that must APPROVE a request: the party that did NOT initiate it (the opposite side of
 *  invited_by_space_id). Pure. */
export function approverSideForRequest(row: Pick<CollaborationRow, 'host_space_id' | 'collaborator_space_id' | 'invited_by_space_id'>): string {
  return row.invited_by_space_id === row.host_space_id ? row.collaborator_space_id : row.host_space_id
}

/** This space's role in a collaboration row. Pure. */
export function roleForSpace(
  row: Pick<CollaborationRow, 'host_space_id' | 'collaborator_space_id'>,
  spaceId: string,
): 'host' | 'collaborator' {
  return row.host_space_id === spaceId ? 'host' : 'collaborator'
}

/** The OTHER party's space id for a given side. Pure. */
export function partnerSideForSpace(
  row: Pick<CollaborationRow, 'host_space_id' | 'collaborator_space_id'>,
  spaceId: string,
): string {
  return row.host_space_id === spaceId ? row.collaborator_space_id : row.host_space_id
}

// ── IO: the untyped admin handle (space_collaborations isn't in the generated types yet, ADR-246) ────

function untyped(): SupabaseClient {
  return createAdminClient()
}

type PartnerSpace = { id: string; slug: string; name: string; logoUrl: string | null; tagline: string | null }

/** Batch-resolve the partner spaces for a set of rows (one query), keyed by id. */
async function resolvePartners(admin: SupabaseClient, ids: string[]): Promise<Map<string, PartnerSpace>> {
  const map = new Map<string, PartnerSpace>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return map
  const { data } = await admin
    .from('spaces')
    .select('id, name, brand_name, slug, brand_logo_url, tagline')
    .in('id', unique)
  for (const r of (data ?? []) as Array<{
    id: string; name: string | null; brand_name: string | null; slug: string; brand_logo_url: string | null; tagline: string | null
  }>) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.brand_name ?? r.name ?? 'Space',
      logoUrl: r.brand_logo_url,
      tagline: r.tagline,
    })
  }
  return map
}

/** Load every collaboration row where `spaceId` is on EITHER side, then shape it into a CollaborationView
 *  (partner resolved, role + approver flag derived). The one place the two-direction union + partner
 *  resolve happens; the public listing / management / inbox reads all filter this. FAIL-SAFE: [] on error. */
async function loadViews(spaceId: string): Promise<CollaborationView[]> {
  if (!spaceId) return []
  try {
    const admin = untyped()
    const [asHost, asCollab] = await Promise.all([
      admin.from('space_collaborations').select('*').eq('host_space_id', spaceId),
      admin.from('space_collaborations').select('*').eq('collaborator_space_id', spaceId),
    ])
    const rows = [
      ...((asHost.data ?? []) as CollaborationRow[]),
      ...((asCollab.data ?? []) as CollaborationRow[]),
    ]
    if (rows.length === 0) return []
    const partners = await resolvePartners(admin, rows.map((r) => partnerSideForSpace(r, spaceId)))
    return rows.flatMap((r) => {
      const partner = partners.get(partnerSideForSpace(r, spaceId))
      if (!partner) return []
      return [
        {
          id: r.id,
          status: r.status,
          role: roleForSpace(r, spaceId),
          partner,
          awaitingMyApproval: r.status === 'pending' && approverSideForRequest(r) === spaceId,
          createdAt: r.created_at,
        } satisfies CollaborationView,
      ]
    })
  } catch {
    return []
  }
}

/** Every ACCEPTED collaboration for a space, both directions (its collaborators + who it collaborates
 *  under), partner resolved. The public "Collaborators" listing + cross-link read this. FAIL-SAFE. */
export async function listAcceptedCollaborations(spaceId: string): Promise<CollaborationView[]> {
  return (await loadViews(spaceId)).filter((v) => v.status === 'accepted')
}

/** All collaborations for a space in any state, both directions — the management surface's full list.
 *  FAIL-SAFE. */
export async function listCollaborationsForSpace(spaceId: string): Promise<CollaborationView[]> {
  return loadViews(spaceId)
}

/** The PENDING rows this space's owner/admin must act on (it did not initiate them) — the approver
 *  inbox. FAIL-SAFE. */
export async function listIncomingCollaborationRequests(spaceId: string): Promise<CollaborationView[]> {
  return (await loadViews(spaceId)).filter((v) => v.awaitingMyApproval)
}

/** True when `spaceId` has at least one ACCEPTED collaboration (the gate for the public Collaborators
 *  tab). FAIL-SAFE: false on error. */
export async function spaceHasCollaborators(spaceId: string): Promise<boolean> {
  return (await listAcceptedCollaborations(spaceId)).length > 0
}

/** A single collaboration row by id (untyped select), for the action authz path. FAIL-SAFE: null. */
export async function loadCollaboration(id: string): Promise<CollaborationRow | null> {
  if (!id) return null
  try {
    const { data } = await untyped().from('space_collaborations').select('*').eq('id', id).maybeSingle()
    return (data as CollaborationRow | null) ?? null
  } catch {
    return null
  }
}

/** Profile ids that may approve/manage a collaboration on behalf of a space: the owner plus every
 *  ACTIVE admin member (mirrors lib/events/placement.ts listSpaceStewardIds). FAIL-SAFE: []. */
export async function listSpaceCollaborationApprovers(spaceId: string): Promise<string[]> {
  const ids = new Set<string>()
  try {
    const admin = untyped()
    const { data: space } = await admin.from('spaces').select('owner_profile_id').eq('id', spaceId).maybeSingle()
    const ownerId = (space as { owner_profile_id: string | null } | null)?.owner_profile_id
    if (ownerId) ids.add(ownerId)
    const { data: admins } = await admin
      .from('space_members')
      .select('profile_id, role, status')
      .eq('space_id', spaceId)
      .eq('role', 'admin')
      .eq('status', 'active')
    for (const m of (admins ?? []) as Array<{ profile_id: string }>) ids.add(m.profile_id)
  } catch {
    /* fail-safe: an empty approver set denies every action (fail-closed) */
  }
  return [...ids]
}
