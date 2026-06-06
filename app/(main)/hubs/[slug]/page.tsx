import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { DetailTemplate } from '@/components/templates/detail-template'
import { StaffEditButton } from '@/components/ui/staff-edit-button'
import { EditModeButton } from '@/components/admin/inline/edit-mode-button'
import { InlineText } from '@/components/admin/inline/inline-text'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import { updateHubField } from '../admin-actions'
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

  const caps = await getHubCapabilities(hub.id)
  const canManage = caps.has('hub.manage')

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
        actions={
          <>
            {canManage && <EditModeButton />}
            <StaffEditButton href={`/admin/hubs?edit=${hub.id}`} label="Edit hub" />
          </>
        }
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
