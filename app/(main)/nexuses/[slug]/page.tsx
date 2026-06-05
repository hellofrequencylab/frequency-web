import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { DetailTemplate } from '@/components/templates/detail-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

type NexusDetail = {
  id: string
  name: string
  slug: string
  status: string
  member_cap: number
  mentor: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  outpost: {
    id: string
    name: string
    region: { name: string } | null
  } | null
}

type HubRow = {
  id: string
  name: string
  slug: string
  status: string
  guide: { display_name: string; handle: string } | null
  circles: { member_count: number }[]
}

export default async function NexusPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawNexus } = await admin
    .from('nexuses')
    .select(
      `id, name, slug, status, member_cap,
       mentor:profiles!mentor_id ( id, display_name, handle, avatar_url ),
       outpost:outposts!outpost_id (
         id, name,
         region:nexus_regions!region_id ( name )
       )`
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!rawNexus) notFound()
  const nexus = rawNexus as unknown as NexusDetail

  const { data: rawHubs } = await admin
    .from('hubs')
    .select(
      `id, name, slug, status,
       guide:profiles!guide_id ( display_name, handle ),
       circles ( member_count )`
    )
    .eq('nexus_id', nexus.id)
    .order('name', { ascending: true })

  const hubs = (rawHubs ?? []) as unknown as HubRow[]

  const totalMembers = hubs.reduce(
    (sum, h) => sum + h.circles.reduce((s, c) => s + (c.member_count ?? 0), 0),
    0
  )

  const crumbs = [
    nexus.outpost?.region?.name ? { label: nexus.outpost.region.name } : null,
    nexus.outpost ? { label: nexus.outpost.name } : null,
    { label: nexus.name },
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
        title={nexus.name}
        badges={<StatusBadge status={nexus.status} />}
        subtitle={
          <>
            {nexus.mentor && (
              <span>
                Mentor:{' '}
                <Link
                  href={`/people/${nexus.mentor.handle}`}
                  className="text-primary-strong hover:underline"
                >
                  {nexus.mentor.display_name}
                </Link>
              </span>
            )}
            <span className="mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {totalMembers} / {nexus.member_cap} members · {hubs.length} hubs
            </span>
            {/* Nexus capacity bar */}
            <div className="mt-2 h-1.5 max-w-xs rounded-full bg-surface-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.round((totalMembers / nexus.member_cap) * 100))}%` }}
              />
            </div>
          </>
        }
      >
        {/* ── Hubs ───────────────────────────────────── */}
        <section>
          <SectionHeader title="Hubs" count={hubs.length} />
          {hubs.length === 0 ? (
            <EmptyState title="No hubs yet." />
          ) : (
            <div className="space-y-2">
              {hubs.map((hub) => {
                const hubTotal = hub.circles.reduce((s, c) => s + (c.member_count ?? 0), 0)
                return (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary-bg hover:bg-primary-bg/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{hub.name}</span>
                        <StatusBadge status={hub.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-subtle">
                        {hub.guide && <span>Guide: {hub.guide.display_name}</span>}
                        <span>·</span>
                        <span>{hub.circles.length} circles · {hubTotal} members</span>
                      </div>
                    </div>
                    <span className="text-xs text-subtle">→</span>
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
