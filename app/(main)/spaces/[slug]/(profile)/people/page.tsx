import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getMyMembership } from '@/lib/spaces/memberships'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import {
  canSeeSpaceMemberDirectory,
  listSpaceMemberDirectory,
} from '@/lib/spaces/member-directory'
import { EntityCard } from '@/components/cards/entity-card'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

// SPACE MEMBER DIRECTORY (LIVE-420 / ADR-1471).
//
// Lives inside the (profile) group so the cover, identity row, and tab menu come
// from the layout. This file is only the body. Never a second <h1>.
//
// Not a public tab. A crawler and a visitor who has not joined see a join door,
// never the roster. noindex on the metadata so the URL cannot advertise people.

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'people',
    label: 'People',
    describe: (brandName) => `Who belongs at ${brandName}.`,
    noindex: true,
  })
}

export default async function SpacePeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  if (space.type === 'root') redirect(`/spaces/${slug}`)
  setActiveSpace(space)

  const brandName = space.brandName ?? space.name
  const manage = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null)
  const mine = viewerProfileId ? await getMyMembership(space.id) : null
  const canSee = canSeeSpaceMemberDirectory({
    spaceType: space.type,
    isActiveMember: mine?.status === 'active',
    canManage: manage.canManage || manage.staffViewing,
  })

  if (!canSee) {
    return (
      <div className="space-y-4">
        <SectionHead brandName={brandName} />
        <EmptyState
          icon={Users}
          title="This list is for people who belong here"
          description={`Join ${brandName} and you will see the other members.`}
          action={
            <Link href={`/spaces/${space.slug}`} className={buttonClasses('primary', 'sm')}>
              See how to join
            </Link>
          }
        />
      </div>
    )
  }

  const people = await listSpaceMemberDirectory(space.id)

  if (people.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHead brandName={brandName} />
        <EmptyState
          icon={Users}
          title="No one to find yet"
          description={
            manage.canManage || manage.staffViewing
              ? 'When someone joins, they show up here. Your team roster is still under Your people.'
              : `${brandName} has not listed anyone here yet.`
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHead brandName={brandName} count={people.length} />
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person) => (
          <li key={person.profileId}>
            <EntityCard
              href={`/people/${person.handle}`}
              anchor={<Avatar src={person.avatarUrl} name={person.displayName} size="md" />}
              title={person.displayName}
              context={`@${person.handle}`}
              description={person.tierName}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SectionHead({ brandName, count }: { brandName: string; count?: number }) {
  return (
    <div>
      <h2 className="font-section text-lead font-bold text-text">People</h2>
      <p className="text-body-sm text-muted">
        {count == null
          ? `Who belongs at ${brandName}.`
          : count === 1
            ? `One person belongs at ${brandName}.`
            : `${count} people belong at ${brandName}.`}
      </p>
    </div>
  )
}
