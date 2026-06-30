import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Briefcase, CircleDollarSign, ListChecks, Trophy } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getDeals, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpacePipeline } from '@/components/spaces/crm/space-pipeline'
import { SpaceContacts } from '@/components/spaces/crm/space-contacts'
import { SpaceNotes } from '@/components/spaces/crm/space-notes'

// PER-SPACE CRM (ENTITY-SPACES-BUILD §C Phase 2). The owner's OWN pipeline + contacts + client notes,
// scoped to this Space by space_id, distinct from the GLOBAL /admin/crm operator tool (host-gated,
// unscoped). A centered, no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/crm in
// page-chrome.ts, alongside availability + memberships). It resolves the Space, gates RENDER on
// canManage || staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the
// surface exists), then renders, each behind its own <Suspense> (PAGE-FRAMEWORK §5):
//   1. a live stats band (open deals + open value + won value + tasks due) for THIS Space,
//   2. the per-space pipeline (deals by stage, read-only in v1),
//   3. the contacts list (pick a contact -> ?contact=<id>), and
//   4. the client notes panel for the selected contact (PERSONAL DATA, owner-gated, space-scoped).
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// notes panel is read-only. The notes reads themselves are gated on canEditProfile inside
// listClientNotes, so a staff viewer reads empty (personal data never leaks to a non-owner). No
// em/en dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'CRM',
}

export default async function SpaceCrmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ contact?: string | string[] }>
}) {
  const { slug } = await params
  const { contact } = await searchParams
  const selectedContactId = Array.isArray(contact) ? (contact[0] ?? null) : (contact ?? null)

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The notes WRITES + reads stay gated on canEditProfile, so staff
  // viewing is read-only end to end and never sees personal data.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="CRM"
      description="Your pipeline, contacts, and private notes for this space. Only your team sees these."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <Suspense fallback={<StatsSkeleton />}>
          <CrmStats spaceId={space.id} />
        </Suspense>

        <Suspense fallback={<BoardSkeleton />}>
          <SpacePipeline spaceId={space.id} />
        </Suspense>

        <div className="grid gap-6 @3xl:grid-cols-2">
          <Suspense fallback={<ListSkeleton />}>
            <SpaceContacts
              spaceId={space.id}
              slug={space.slug}
              selectedContactId={selectedContactId}
            />
          </Suspense>

          <section>
            <SectionHeader title="Notes" />
            <Suspense fallback={<ListSkeleton />}>
              <SpaceNotes
                spaceId={space.id}
                contactId={selectedContactId}
                readOnly={staffViewing}
              />
            </Suspense>
          </section>
        </div>
      </div>
    </FocusTemplate>
  )
}

// The live stats band for THIS Space's pipeline (deals + tasks scoped by space_id).
async function CrmStats({ spaceId }: { spaceId: string }) {
  const [deals, tasksDue] = await Promise.all([getDeals(spaceId), countOpenTasks(spaceId)])
  const metrics = computeMetrics(deals, tasksDue)
  return (
    <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
      <StatCard size="sm" label="Open deals" value={metrics.openCount} icon={Briefcase} />
      <StatCard
        size="sm"
        label="Open value"
        value={formatMoney(metrics.openValue)}
        icon={CircleDollarSign}
      />
      <StatCard size="sm" label="Won value" value={formatMoney(metrics.wonValue)} icon={Trophy} />
      <StatCard size="sm" label="Tasks due" value={metrics.tasksDue} icon={ListChecks} />
    </div>
  )
}

// ── Dimension-matched skeletons (no CLS, PAGE-FRAMEWORK §5.4) ────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-40 w-64 shrink-0 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
