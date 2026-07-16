import { Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceMembers, type SpaceRole, type SpaceMemberStatus } from '@/lib/spaces/membership'
import { listInvites } from '@/lib/spaces/invites'
import { getSeatUsage } from '@/lib/spaces/seats'
import { billingLive } from '@/lib/pricing/settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { PersonCard } from '@/components/cards/person-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { InviteForm } from '@/components/spaces/invite-form'
import { RosterManager, type RosterRow } from '@/components/spaces/roster-manager'
import { SeatCounter } from '@/components/spaces/seat-counter'

// MEMBERS BODY — the chrome-free team-management UI (Entity Management Overhaul EM2-2), lifted out of the
// standalone /settings/members page so it can render in TWO places from one source: (1) that page, wrapped
// in its FocusTemplate chrome, and (2) INLINE in the Space profile body as the Members `?panel=` workspace
// (Stage D1, components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (no FocusTemplate,
// no eyebrow/title/description) — the caller frames it — and SELF-GATES server-side so it is safe to mount
// anywhere: it returns null when the viewer may not manage this Space (the standalone page still 404s via
// its own gate, so a null here never renders a bare 200).
//
// SCOPE (unchanged from the page it was lifted from): a manager (canManageMembers, owner / admin) gets the
// full roster TABLE (role assignment, remove, suspend / reactivate, bulk ops — RosterManager, every write
// re-checked server-side) plus the invite-by-email section. The invite now emails the accept link AND
// surfaces a copyable link to share by hand. The OWNER is always seated first as
// Owner. A STAFF PREVIEW (a janitor) gets a READ-ONLY roster grid; every write stays gated server-side.
//
// COPY: plain labels, the space-role nouns (Owner / Admin / Moderator / Editor / Member), no em/en dashes.

// Space-role value to its member-facing noun. (viewer reads as the plain "Member".)
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
  editor: 'Editor',
  viewer: 'Member',
}

export async function MembersBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Members defaults to editor (the old
  // canEditProfile threshold), so behavior is unchanged unless an operator/owner tunes it. A staff
  // janitor keeps the read-only roster preview (every write stays gated server-side).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'members', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Members"
        reason={spaceFunctionAccess(space, 'members', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  // The INVITE section is owner / admin only (canManageMembers); a staff janitor previewing the
  // Space does not manage it, so they see the roster read-only without the invite controls. The
  // pending-invite list is gated the same way inside listInvites (fail-safe to []), so this only
  // decides whether to mount the section.
  const pendingInvites = caps.canManageMembers ? await listInvites(space.id) : []

  // SEAT USAGE (Phase D, ADR-465). A manager (owner / admin) sees a "X of Y operator seats used"
  // counter + an "add a seat" link to the plan and billing page. While billing is OFF this is a
  // PREVIEW (the limit is not enforced yet); when billing goes live the same counter reflects the real
  // licensed allowance + enforcement. Read once here (two cheap queries) for managers only.
  const [seatUsage, billingIsLive] = caps.canManageMembers
    ? await Promise.all([getSeatUsage(space.id), billingLive()])
    : [null, false]

  // The team: the OWNER first (always seated as Owner), then members (active + suspended; an invited
  // row has no accepted seat yet, so it is excluded — it lives in the pending-invite list above). The
  // owner's effective role + status are fixed (admin / active). De-duped by profile id: an owner who
  // also carries a member row appears once, as the Owner.
  const members = (await listSpaceMembers(space.id)).filter(
    (m) => m.status === 'active' || m.status === 'suspended',
  )
  // profileId -> { role, status, isOwner } — the management facts each row needs.
  const facts = new Map<string, { role: SpaceRole; status: SpaceMemberStatus; isOwner: boolean }>()
  if (space.ownerProfileId)
    facts.set(space.ownerProfileId, { role: 'admin', status: 'active', isOwner: true })
  for (const m of members) {
    if (!facts.has(m.profileId)) facts.set(m.profileId, { role: m.role, status: m.status, isOwner: false })
  }
  const profileIds = [...facts.keys()]

  // Resolve each person's public profile card (handle + name + avatar). A row with no handle/name (an
  // incomplete profile) is dropped so every row has a valid link. Suspended members are NOT gated on
  // is_active here — that flag is the profile's own account state, unrelated to space membership — so a
  // suspended teammate still resolves and shows in the roster.
  const { data: profileData } = await createAdminClient()
    .from('profiles')
    .select('id, handle, display_name, avatar_url, is_demo')
    .in('id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('is_active', true)

  // Owner first, then members in ladder order (admin -> moderator -> editor -> viewer), active before
  // suspended, so the most-privileged + active rows read at the top.
  const RANK: Record<SpaceRole, number> = { admin: 3, moderator: 2, editor: 1, viewer: 0 }
  const rows: RosterRow[] = (profileData ?? [])
    .flatMap((p) => {
      const f = facts.get(p.id as string)
      if (!f || !p.handle || !p.display_name) return []
      return [
        {
          profileId: p.id as string,
          handle: p.handle as string,
          displayName: p.display_name as string,
          avatarUrl: (p.avatar_url as string | null) ?? null,
          isDemo: (p as { is_demo?: boolean }).is_demo ?? false,
          isOwner: f.isOwner,
          role: f.role,
          status: f.status,
        } satisfies RosterRow,
      ]
    })
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return RANK[b.role] - RANK[a.role]
    })

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {caps.canManageMembers && seatUsage && (
        <section className="mb-8">
          <SeatCounter
            usage={seatUsage}
            billingHref={`/spaces/${space.slug}/settings/billing`}
            enforced={billingIsLive}
            canManage={caps.canManageMembers}
          />
        </section>
      )}

      {caps.canManageMembers && (
        <section className="mb-10">
          <SectionHeader title="Invite a teammate" />
          <InviteForm spaceId={space.id} initialInvites={pendingInvites} />
        </section>
      )}

      <section>
        <SectionHeader title="On the team" count={rows.length} />
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet."
            description="When someone accepts an invite, they show here with their role."
          />
        ) : caps.canManageMembers ? (
          // A manager (owner / admin) gets the full roster table: role assignment, remove, suspend /
          // reactivate, and bulk multi-select ops. Every write re-checks canManageMembers server-side.
          <RosterManager spaceId={space.id} rows={rows} />
        ) : (
          // A staff janitor previewing the Space reads the roster only (no management controls).
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((r) => (
              <PersonCard
                key={r.profileId}
                handle={r.handle}
                displayName={r.displayName}
                avatarUrl={r.avatarUrl}
                isDemo={r.isDemo}
                meta={
                  <span className="font-medium text-primary-strong">
                    {r.isOwner ? 'Owner' : ROLE_LABEL[r.role] ?? 'Member'}
                    {r.status === 'suspended' && (
                      <span className="ml-2 font-medium text-warning">Suspended</span>
                    )}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
