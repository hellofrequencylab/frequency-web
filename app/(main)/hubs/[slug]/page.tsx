import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { DetailTemplate } from '@/components/templates/detail-template'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { showsScopedInsight } from '@/lib/core/scoped-surface-ui'
import { updateHubField } from '../admin-actions'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { CircleBase } from '@/lib/types/circle'

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

type CircleRow = CircleBase & {
  slug: string
  type: 'in-person' | 'online'
  host: { display_name: string; handle: string } | null
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

  // Caps, the scoped-Insight access check, and the circles list are all independent given the hub
  // id — resolve them in ONE round-trip instead of a serial chain (site-audit PERF-6). The header
  // counts derive from `circles`, so it can't stream behind Suspense; batching is the win here.
  //
  // Scoped Insight surface (P1.6 adoption, ADR-225): the IN-SCOPE matrix question, so a Guide who
  // leads THIS hub by stewardship edge — even a global member — gets the hub's Insight summary (a hub
  // confers guide level ⇒ `full`). Additive: a non-leader resolves `none` and the section stays hidden.
  const [caps, insightAccess, rawCirclesRes] = await Promise.all([
    getHubCapabilities(hub.id),
    surfaceAccess('insight', { type: 'hub', id: hub.id }),
    admin
      .from('circles')
      .select(
        `id, name, slug, type, member_count, member_cap, status,
         host:profiles!host_id ( display_name, handle )`
      )
      .eq('hub_id', hub.id)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
  ])
  const canManage = caps.has('hub.manage')
  const showsInsight = showsScopedInsight(insightAccess)
  const circles = (rawCirclesRes.data ?? []) as unknown as CircleRow[]
  const totalMembers = circles.reduce((sum, c) => sum + c.member_count, 0)

  const crumbs = [
    hub.nexus?.outpost?.region?.name ? { label: hub.nexus.outpost.region.name } : null,
    hub.nexus?.outpost ? { label: hub.nexus.outpost.name } : null,
    hub.nexus ? { label: hub.nexus.name, href: `/nexuses/${hub.nexus.slug}` } : null,
    { label: hub.name },
  ].filter(Boolean) as { label: string; href?: string }[]

  return (
    <div>
      <Link
        href="/circles"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-4 transition-colors"
      >
        ← Circles
      </Link>

      <HierarchyBreadcrumb crumbs={crumbs} className="mb-4" />

      {/* ── Header (DetailTemplate) ─────────────────── */}
      <DetailTemplate
        title={
          canManage ? (
            <InlineText
              value={hub.name}
              save={updateHubField.bind(null, hub.id, slug, 'name')}
              inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-xl sm:text-2xl font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
            />
          ) : (
            hub.name
          )
        }
        badges={<StatusBadge status={hub.status} />}
        subtitle={
          <>
            {hub.guide && (
              <span>
                Guide:{' '}
                <Link
                  href={`/people/${hub.guide.handle}`}
                  className="text-primary-strong hover:underline"
                >
                  {hub.guide.display_name}
                </Link>
              </span>
            )}
            <span className="mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {totalMembers} members across {circles.length} / 5 circles
            </span>
          </>
        }
      >
        {/* ── Insight (scoped) — in-scope analytics for the hub's Guide, ADR-225 ── */}
        {showsInsight && (
          <section className="mb-8">
            <SectionHeader title="Insight" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Members" value={totalMembers.toLocaleString()} icon={Users} />
              <StatCard label="Circles" value={circles.length.toLocaleString()} />
              <StatCard
                label="Avg per circle"
                value={circles.length > 0 ? Math.round(totalMembers / circles.length).toLocaleString() : '0'}
              />
            </div>
          </section>
        )}

        {/* ── Circles ────────────────────────────────── */}
        <section>
          <SectionHeader title="Circles" count={circles.length} />
          {circles.length === 0 ? (
            <EmptyState title="No circles yet." />
          ) : (
            <div className="space-y-1">
              {circles.map((circle) => {
                const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
                const full = circle.member_count >= circle.member_cap

                return (
                  <Link
                    key={circle.id}
                    href={`/circles/${circle.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-surface-elevated/60 motion-reduce:transition-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text">{circle.name}</span>
                        <StatusBadge status={circle.status} />
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                          {circle.type}
                        </span>
                      </div>
                      {circle.host && (
                        <p className="text-xs text-subtle mt-0.5">
                          Host: {circle.host.display_name}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-xs text-subtle tabular-nums">
                          {circle.member_count} / {circle.member_cap}
                        </span>
                        <div className="h-1 w-20 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            className={`h-full rounded-full ${full ? 'bg-danger' : 'bg-primary'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-subtle transition-colors group-hover:text-text">→</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </DetailTemplate>
    </div>
  )
}
