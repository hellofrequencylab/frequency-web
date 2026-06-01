import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { joinCircle } from './actions'
import { StatusBadge } from '@/components/groups/status-badge'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { NearYou } from '@/components/circles/near-you'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

type CircleRow = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  host: { display_name: string; handle: string } | null
  hub: {
    id: string
    name: string
    slug: string
    nexus: {
      id: string
      name: string
      slug: string
      outpost: { name: string; region: { name: string } | null } | null
    } | null
  } | null
}

export default async function CirclesPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myCircleIds: string[] = []
  let isAdmin = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      isAdmin = ['host', 'guide', 'mentor', 'janitor'].includes(profile?.community_role ?? '')
      const { data: mems } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
      myCircleIds = (mems ?? []).map((m) => m.circle_id as string)
    }
  }

  // Fetch all non-archived circles with full breadcrumb
  const { data: rawCircles } = await admin
    .from('circles')
    .select(
      `id, name, slug, about, type, member_count, member_cap, status,
       latitude, longitude, neighborhood,
       host:profiles!host_id ( display_name, handle ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id (
           id, name, slug,
           outpost:outposts!outpost_id (
             name,
             region:nexus_regions!region_id ( name )
           )
         )
       )`
    )
    .neq('status', 'archived')
    .order('name', { ascending: true })

  const circles = (rawCircles ?? []) as unknown as CircleRow[]

  const myCircles = circles.filter((c) => myCircleIds.includes(c.id))
  const otherCircles = circles.filter((c) => !myCircleIds.includes(c.id))

  // In-person circles with coordinates -> "Circles near you" (client geolocation).
  const locatableCircles = circles
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      latitude: c.latitude as number,
      longitude: c.longitude as number,
      neighborhood: c.neighborhood,
    }))

  // Interests (topical channels) for the member-driven "start a circle" picker.
  const { data: interestRows } = await admin
    .from('topical_channels')
    .select('id, name')
    .order('name')
  const interests = (interestRows ?? []) as { id: string; name: string }[]

  return (
    <IndexTemplate
      title="Circles"
      description="Your local crew — where you post, connect, and show up week to week. Join one or start your own."
      action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
      toolbar={
        isAdmin ? (
          <Link
            href="/admin/circles"
            className="text-sm font-medium text-muted hover:text-primary-strong transition-colors"
          >
            Manage circles →
          </Link>
        ) : undefined
      }
    >
      <NearYou circles={locatableCircles} />

      <div className="space-y-8">
        {myCircles.length > 0 && (
          <section>
            <SectionHeader title="Your circles" count={myCircles.length} />
            <div className="grid gap-3 sm:grid-cols-2">
              {myCircles.map((circle) => (
                <CircleCard key={circle.id} circle={circle} isMember />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title={myCircles.length > 0 ? 'Discover' : 'All circles'} count={otherCircles.length} />
          {otherCircles.length === 0 ? (
            <EmptyState
              icon={Users}
              title={myCircles.length > 0 ? "You're in every circle going" : 'No circles yet'}
              description="Start one for your neighborhood or an interest, and gather your people."
              action={user ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {otherCircles.map((circle) => (
                <CircleCard key={circle.id} circle={circle} isMember={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}

function CircleCard({ circle, isMember }: { circle: CircleRow; isMember: boolean }) {
  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap
  const location = circle.hub?.nexus?.outpost?.name ?? null
  const nexusName = circle.hub?.nexus?.name ?? null
  const context = [location, nexusName].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary-bg hover:shadow-md">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/circles/${circle.slug}`}
              className="text-base font-semibold text-text transition-colors hover:text-primary-strong"
            >
              {circle.name}
            </Link>
            <StatusBadge status={circle.status} />
            {circle.type === 'in-person' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-xs font-medium text-primary-strong">
                <MapPin className="h-3 w-3" />
                In person
              </span>
            )}
          </div>
          {context && <p className="mt-0.5 truncate text-xs text-subtle">{context}</p>}
        </div>
      </div>

      {/* Description */}
      {circle.about && <p className="mt-3 line-clamp-2 text-sm text-muted">{circle.about}</p>}

      {/* Footer: capacity + action */}
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-subtle">
            {circle.member_count} / {circle.member_cap} members
          </span>
          {full ? (
            <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">Full</span>
          ) : nearCap ? (
            <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning">Almost full</span>
          ) : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={`h-full rounded-full ${full ? 'bg-danger' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4">
          {isMember ? (
            <Link
              href={`/circles/${circle.slug}`}
              className="inline-flex rounded-lg bg-primary-bg px-3 py-1.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
            >
              Open circle →
            </Link>
          ) : !full ? (
            <form action={joinCircle.bind(null, circle.id, circle.slug)}>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Join circle
              </button>
            </form>
          ) : (
            <Link
              href={`/circles/${circle.slug}`}
              className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              View
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
