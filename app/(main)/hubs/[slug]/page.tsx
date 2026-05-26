import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'

type HubDetail = {
  id: string
  name: string
  slug: string
  status: string
  guide: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  nexus: {
    id: string
    name: string
    slug: string
    outpost: {
      id: string
      name: string
      region: { name: string } | null
    } | null
  } | null
}

type CircleRow = {
  id: string
  name: string
  slug: string
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  host: { display_name: string; handle: string } | null
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

export default async function HubPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawHub } = await admin
    .from('hubs')
    .select(
      `id, name, slug, status,
       guide:profiles!guide_id ( id, display_name, handle, avatar_url ),
       nexus:nexuses!nexus_id (
         id, name, slug,
         outpost:outposts!outpost_id (
           id, name,
           region:nexus_regions!region_id ( name )
         )
       )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawHub) notFound()
  const hub = rawHub as unknown as HubDetail

  const { data: rawCircles } = await admin
    .from('circles')
    .select(
      `id, name, slug, type, member_count, member_cap, status,
       host:profiles!host_id ( display_name, handle )`
    )
    .eq('hub_id', hub.id)
    .neq('status', 'archived')
    .order('name', { ascending: true })

  const circles = (rawCircles ?? []) as unknown as CircleRow[]
  const totalMembers = circles.reduce((sum, c) => sum + c.member_count, 0)

  const crumbs = [
    hub.nexus?.outpost?.region?.name ? { label: hub.nexus.outpost.region.name } : null,
    hub.nexus?.outpost ? { label: hub.nexus.outpost.name } : null,
    hub.nexus ? { label: hub.nexus.name, href: `/nexuses/${hub.nexus.slug}` } : null,
    { label: hub.name },
  ].filter(Boolean) as { label: string; href?: string }[]

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <Link
        href="/circles"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
      >
        ← Circles
      </Link>

      <HierarchyBreadcrumb crumbs={crumbs} className="mb-4" />

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{hub.name}</h1>
              <StatusBadge status={hub.status as any} />
            </div>

            {hub.guide && (
              <p className="mt-1 text-xs text-gray-500">
                Guide:{' '}
                <Link
                  href={`/people/${hub.guide.handle}`}
                  className="text-indigo-600 hover:underline"
                >
                  {hub.guide.display_name}
                </Link>
              </p>
            )}

            <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-500">
              <Users className="w-4 h-4" />
              <span>
                {totalMembers} members across {circles.length} / 5 circles
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Circles ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Circles</h2>
        {circles.length === 0 ? (
          <p className="text-sm text-gray-400">No circles yet.</p>
        ) : (
          <div className="space-y-2">
            {circles.map((circle) => {
              const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
              const full = circle.member_count >= circle.member_cap

              return (
                <Link
                  key={circle.id}
                  href={`/circles/${circle.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{circle.name}</span>
                      <StatusBadge status={circle.status as any} />
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                        {circle.type}
                      </span>
                    </div>
                    {circle.host && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Host: {circle.host.display_name}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {circle.member_count} / {circle.member_cap}
                      </span>
                      <div className="h-1 w-20 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${full ? 'bg-red-400' : 'bg-indigo-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">→</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
