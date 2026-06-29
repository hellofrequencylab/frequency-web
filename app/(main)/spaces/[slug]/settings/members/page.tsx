import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { listInvites } from '@/lib/spaces/invites'
import { createAdminClient } from '@/lib/supabase/admin'
import { PersonCard } from '@/components/cards/person-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { InviteForm } from '@/components/spaces/invite-form'

// MEMBERS — the owner back-end's TEAM surface (entity-spaces owner hub). A centered, no-rail Focus
// surface (registered 'none' for /spaces/<slug>/settings/members in page-chrome.ts, alongside the
// other settings sub-surfaces). It resolves the Space, gates RENDER on canManage || staffViewing
// (404s otherwise so a non-editor / non-staff viewer cannot tell the surface exists), then lists who
// is already on the team and the role each one holds.
//
// SCOPE: this lists the current team AND lets an owner / admin (canManageMembers) invite a teammate
// by email (space_invites — lib/spaces/invites.ts). Email DELIVERY is not built yet, so the invite
// section surfaces a copyable link to share by hand and says so plainly (CONTENT-VOICE skeptic test).
// The OWNER is always seated here as Admin (the owner is all-powerful on their own Space; they hold no
// member row, so we seat them explicitly). A STAFF PREVIEW (a janitor) does NOT manage the Space, so
// the invite section is hidden for them (read-only); they still see the roster.
//
// READ NOTE: listSpaceMembers reads through the service-role admin client (NOT gated on
// canEditProfile), so a STAFF PREVIEW (a janitor) sees the real roster here. There is nothing to
// write on this surface, so read-only is the same view for everyone who may open it.
//
// COPY: plain labels, the space-role nouns (Owner / Admin / Moderator / Editor / Member), no em/en
// dashes.

export const metadata = {
  title: 'Members',
}

// Space-role value to its member-facing noun. (viewer reads as the plain "Member".)
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
  editor: 'Editor',
  viewer: 'Member',
}

export default async function SpaceMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else so the surface never confirms it exists.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Members defaults to editor (the old
  // canEditProfile threshold), so behavior is unchanged unless an operator/owner tunes it. A staff
  // janitor keeps the read-only roster preview (every write stays gated server-side).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'members', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Members"
        description="The team for this space."
        back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          label="Members"
          reason={spaceFunctionAccess(space, 'members', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  // The INVITE section is owner / admin only (canManageMembers); a staff janitor previewing the
  // Space does not manage it, so they see the roster read-only without the invite controls. The
  // pending-invite list is gated the same way inside listInvites (fail-safe to []), so this only
  // decides whether to mount the section.
  const pendingInvites = caps.canManageMembers ? await listInvites(space.id) : []

  // The team: the OWNER first (always seated as Admin), then active members. De-duped by profile id
  // (an owner who also carries a member row appears once, as Owner).
  const members = (await listSpaceMembers(space.id)).filter((m) => m.status === 'active')
  const byProfile = new Map<string, string>() // profileId -> role label
  if (space.ownerProfileId) byProfile.set(space.ownerProfileId, 'Owner')
  for (const m of members) {
    if (!byProfile.has(m.profileId)) byProfile.set(m.profileId, ROLE_LABEL[m.role] ?? 'Member')
  }
  const profileIds = [...byProfile.keys()]

  // Resolve each person's public profile card (handle + name + avatar). Same shape entity-team reads;
  // a row with no handle/name (an incomplete profile) is dropped so PersonCard always has a link.
  interface PersonRow {
    id: string
    handle: string
    displayName: string
    avatarUrl: string | null
    isDemo: boolean
  }
  let people: PersonRow[] = []
  if (profileIds.length > 0) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('id, handle, display_name, avatar_url, is_demo')
      .in('id', profileIds)
      .eq('is_active', true)
    people = (data ?? []).flatMap((p) =>
      p.handle && p.display_name
        ? [
            {
              id: p.id as string,
              handle: p.handle as string,
              displayName: p.display_name as string,
              avatarUrl: (p.avatar_url as string | null) ?? null,
              isDemo: (p as { is_demo?: boolean }).is_demo ?? false,
            },
          ]
        : [],
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Members"
      description="Who is on your team, and the role each one holds. Invite a teammate by email below, then share their link until email delivery ships."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {caps.canManageMembers && (
        <section className="mb-10">
          <SectionHeader title="Invite a teammate" />
          <InviteForm spaceId={space.id} initialInvites={pendingInvites} />
        </section>
      )}

      <section>
        <SectionHeader title="On the team" count={people.length} />
        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet."
            description="When someone accepts an invite, they show here with their role."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {people.map((p) => (
              <PersonCard
                key={p.id}
                handle={p.handle}
                displayName={p.displayName}
                avatarUrl={p.avatarUrl}
                isDemo={p.isDemo}
                meta={
                  <span className="font-medium text-primary-strong">{byProfile.get(p.id)}</span>
                }
              />
            ))}
          </div>
        )}
      </section>
    </FocusTemplate>
  )
}
