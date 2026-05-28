import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { joinCircle } from './actions'
import { StatusBadge } from '@/components/groups/status-badge'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

type CircleRow = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
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

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default async function CirclesPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let myCircleIds: string[] = []
  let isAdmin = false

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
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

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-1">Circles</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your local crew. Circles are where you post, connect, and show up. Regular rides, shared
            updates, and the people you&apos;ll see week to week. Join one to get started.
          </p>
        </div>
        {isAdmin && <NewCircleCompose />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Main column: circles list ────────────────────────── */}
        <div className="lg:col-span-2">

          {/* ── Your circles ────────────────────────────── */}
          {myCircles.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Your Circles
              </h2>
              <div className="space-y-2">
                {myCircles.map((circle) => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    isMember
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Discover ────────────────────────────────── */}
          {otherCircles.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {myCircles.length > 0 ? 'Other Circles' : 'All Circles'}
              </h2>
              <div className="space-y-2">
                {otherCircles.map((circle) => (
                  <CircleCard
                    key={circle.id}
                    circle={circle}
                    isMember={false}
                  />
                ))}
              </div>
            </section>
          )}

          {circles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200/60 bg-gray-50/50 dark:bg-gray-900/50 p-12 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No circles yet. Check back soon.</p>
            </div>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* My Circles quick-links */}
          <SidebarCard title="My Circles">
            {myCircles.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500 text-center">
                No circles yet – join one!
              </p>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {myCircles.map((circle) => (
                  <li key={circle.id}>
                    <div className="flex items-center justify-between px-4 py-2.5 gap-2">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                        {circle.name}
                      </span>
                      <Link
                        href={`/circles/${circle.slug}`}
                        className="shrink-0 text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        View →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          {/* Admin card */}
          {isAdmin && (
            <SidebarCard title="Admin">
              <div className="px-4 py-3 space-y-2">
                <Link
                  href="/circles/new"
                  className="flex items-center justify-between text-xs font-medium text-indigo-600 hover:underline"
                >
                  Create Circle →
                </Link>
                <Link
                  href="/admin/circles"
                  className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Manage Circles
                </Link>
              </div>
            </SidebarCard>
          )}
        </div>
      </div>
    </div>
  )
}

function CircleCard({
  circle,
  isMember,
}: {
  circle: CircleRow
  isMember: boolean
}) {
  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap
  const location = circle.hub?.nexus?.outpost?.name ?? null
  const nexusName = circle.hub?.nexus?.name ?? null

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/circles/${circle.slug}`}
              className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
            >
              {circle.name}
            </Link>
            <StatusBadge status={circle.status} />
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
              {circle.type}
            </span>
          </div>

          {/* Breadcrumb */}
          {(location || nexusName) && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
              {location && (
                <>
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{location}</span>
                  {nexusName && <span>·</span>}
                </>
              )}
              {nexusName && (
                <Link
                  href={`/nexuses/${circle.hub?.nexus?.slug}`}
                  className="hover:text-indigo-500 transition-colors"
                >
                  {nexusName}
                </Link>
              )}
              {circle.hub && (
                <>
                  <span>·</span>
                  <Link
                    href={`/hubs/${circle.hub.slug}`}
                    className="hover:text-indigo-500 transition-colors"
                  >
                    {circle.hub.name}
                  </Link>
                </>
              )}
            </div>
          )}

          {circle.about && (
            <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{circle.about}</p>
          )}

          {/* Capacity bar */}
          <div className="mt-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {circle.member_count} / {circle.member_cap} members
              </span>
              {nearCap && !full && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                  Almost full
                </span>
              )}
              {full && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  Full
                </span>
              )}
            </div>
            <div className="mt-1 h-1 max-w-xs rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  full ? 'bg-red-400' : nearCap ? 'bg-orange-400' : 'bg-indigo-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {isMember ? (
            <Link
              href={`/circles/${circle.slug}`}
              className="inline-block rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              View →
            </Link>
          ) : !full ? (
            <form action={joinCircle.bind(null, circle.id, circle.slug)}>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Join
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
