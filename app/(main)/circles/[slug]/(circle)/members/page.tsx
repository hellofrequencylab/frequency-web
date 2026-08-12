import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { PersonCard } from '@/components/cards/person-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { RoleBadge } from '@/lib/community-roles'
import { HostInviteButton } from '@/components/circles/host-invite-button'

// ── THE MEMBERS TAB ─────────────────────────────────────────────────────────────────────────────
// A BODY, not a shell: the cover, the title, the capacity bar and the tab strip all belong to the
// route-segment layout one directory up, which owns the single page <h1>. Composing a template here
// would emit a second one (`check:headers`).
//
// The rail already carries a COMPACT roster module (components/widgets/circles/circle-members.tsx —
// five people and a disclosure). This is the full one: every active member as a PersonCard, host
// first, at a size you can actually scan. The two are the same data read through the same memoized
// loader, so the tab costs nothing the page was not already paying.
//
// ADR-089 degradation: production's largest circle holds two people, so the honest state here is a
// short list, not a directory. A circle of one gets a real empty state rather than a grid with a
// single lonely card in it, and its host gets the invite link right there in it.

export default async function CircleMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The same request-memoized load the shell made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, members } = shell

  const [myProfileId, caps] = await Promise.all([getMyProfileId(), circleCapabilities(circle.id)])
  const canManage = caps.has('circle.editSettings')

  // "Just the host, so far" is the common case, not an error. Say so plainly and give the one
  // person who can change it the thing that changes it.
  const aloneHere = members.length <= 1

  return (
    <section aria-labelledby="circle-members-heading">
      <SectionHeader
        id="circle-members-heading"
        title="Members"
        count={members.length}
        action={
          <span className="text-meta text-subtle">
            {circle.member_cap - members.length > 0
              ? `${circle.member_cap - members.length} seats open`
              : 'Full'}
          </span>
        }
      />

      {aloneHere ? (
        <EmptyState
          icon={Users}
          title={canManage ? 'Just you here so far' : 'This circle is still forming'}
          description={
            canManage
              ? 'Share the link with the people you want here. Names land on this list as they join.'
              : 'The host is the only one so far. Join and you will be one of the first.'
          }
          action={canManage ? <HostInviteButton circleId={circle.id} /> : undefined}
        />
      ) : (
        // A plain viewport grid, not `@`-variants: container queries are for blocks that land in a
        // PageModules SLOT (ADR-295), and this body is the tab itself, not a module.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <PersonCard
              key={m.id}
              handle={m.profile.handle}
              displayName={m.profile.display_name}
              avatarUrl={m.profile.avatar_url}
              context={
                circle.host?.id === m.profile.id ? 'Host' : `@${m.profile.handle}`
              }
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  {m.volunteer_role && <RoleBadge role={m.volunteer_role} />}
                  {m.profile.current_streak > 0 && (
                    <span className="text-meta text-subtle">
                      {m.profile.current_streak} day streak
                    </span>
                  )}
                </span>
              }
            />
          ))}
        </div>
      )}

      {/* A member reading their own row is the one case worth naming: it makes the list feel like a
          room they are in rather than a directory they are browsing. */}
      {!aloneHere && myProfileId && members.some((m) => m.profile.id === myProfileId) && (
        <p className="mt-4 text-body-sm text-subtle">You are in this circle.</p>
      )}
    </section>
  )
}
