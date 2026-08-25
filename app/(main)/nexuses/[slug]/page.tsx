import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, LayoutDashboard, Settings } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { DetailTemplate } from '@/components/templates/detail-template'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { InlineText } from '@/components/admin/inline/inline-text'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { getNexusCapabilities } from '@/lib/core/load-capabilities'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { showsScopedInsight } from '@/lib/core/scoped-surface-ui'
import { updateNexusField } from '../admin-actions'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressTrack } from '@/components/ui/progress-track'

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

  // Caps + the standard entity cover (PROG-P5, ADR-1136) in one round-trip. A Nexus carries no
  // cover column, so the ladder is the operator's /nexuses Settings image or nothing.
  const [caps, hero] = await Promise.all([
    getNexusCapabilities(nexus.id),
    resolveDetailHero(`/nexuses/${slug}`),
  ])
  const canManage = caps.has('nexus.manage')

  // Scoped Insight surface (P1.6 adoption, ADR-225): the IN-SCOPE matrix question, so a
  // Mentor who leads THIS nexus by stewardship edge — even a global member — gets the
  // nexus Insight summary (a nexus confers mentor level ⇒ `full`). Additive: a non-leader
  // resolves `none` and the section stays hidden, exactly today's behavior.
  const showsInsight = showsScopedInsight(
    await surfaceAccess('insight', { type: 'nexus', id: nexus.id }),
  )

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
        className="inline-flex items-center gap-1 text-meta text-subtle hover:text-muted mb-4 transition-colors"
      >
        ← Circles
      </Link>

      <HierarchyBreadcrumb crumbs={crumbs} className="mb-4" />

      {/* ── Header (DetailTemplate) ─────────────────── */}
      <DetailTemplate
        {...hero}
        title={
          canManage ? (
            <InlineText
              value={nexus.name}
              save={updateNexusField.bind(null, nexus.id, slug, 'name')}
              inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-lead sm:text-page-title font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
            />
          ) : (
            nexus.name
          )
        }
        badges={<StatusBadge status={nexus.status} />}
        // Owner/operator entries, stacked: Edit (Settings drawer) then Manage (console).
        // Gated on nexus.manage — the same capability every settings action re-checks server-side.
        actions={
          canManage ? (
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <OpenAdminBarButton
                scope={{ kind: 'nexus', id: nexus.id }}
                caps={Array.from(caps)}
                label="Edit nexus"
                icon={<Settings className="h-4 w-4" />}
              />
              <Link
                href={`/nexuses/${nexus.slug}/manage`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                <LayoutDashboard className="h-4 w-4 text-subtle" />
                Manage nexus
              </Link>
            </div>
          ) : undefined
        }
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
            <ProgressTrack
              value={totalMembers}
              max={nexus.member_cap}
              animate
              className="mt-2 max-w-xs"
              label={`${totalMembers} of ${nexus.member_cap} members`}
            />
          </>
        }
      >
        {/* ── Insight (scoped) — in-scope analytics for the nexus Mentor, ADR-225 ── */}
        {showsInsight && (
          <section className="mb-8">
            <SectionHeader title="Insight" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Members" value={totalMembers.toLocaleString()} icon={Users} />
              <StatCard label="Hubs" value={hubs.length.toLocaleString()} />
              <StatCard
                label="Avg per hub"
                value={hubs.length > 0 ? Math.round(totalMembers / hubs.length).toLocaleString() : '0'}
              />
            </div>
          </section>
        )}

        {/* ── Hubs ───────────────────────────────────── */}
        <section>
          <SectionHeader title="Hubs" count={hubs.length} />
          {hubs.length === 0 ? (
            <EmptyState title="No hubs yet." />
          ) : (
            <div className="space-y-1">
              {hubs.map((hub) => {
                const hubTotal = hub.circles.reduce((s, c) => s + (c.member_count ?? 0), 0)
                return (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="group flex items-center gap-3 rounded-control px-4 py-3 transition-colors hover:bg-surface-elevated/60 motion-reduce:transition-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body-sm font-semibold text-text">{hub.name}</span>
                        <StatusBadge status={hub.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-meta text-subtle">
                        {hub.guide && <span>Guide: {hub.guide.display_name}</span>}
                        <span>·</span>
                        <span className="tabular-nums">{hub.circles.length} circles · {hubTotal} members</span>
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
