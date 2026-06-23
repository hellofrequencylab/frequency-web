import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Briefcase, CircleDollarSign, ListChecks, Lock, Trophy } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { getDeals, countOpenTasks, computeMetrics, formatMoney, ensureSpaceStages } from '@/lib/crm/pipeline'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SpacePipeline } from '@/components/spaces/crm/space-pipeline'
import { SpaceContacts } from '@/components/spaces/crm/space-contacts'
import { ImportContactsForm } from '@/components/spaces/crm/import-contacts-form'

// PER-SPACE CRM BOARD (CRM-STRATEGY §6/§7, ADR-361 P3). The paid, full-width Dashboard a Space runs:
// its pipeline (per-segment stages + deals) plus its contacts, scoped to this space_id, with the
// graduation entry point ("Bring your contacts into your Space CRM"). Distinct from the Focus
// /spaces/<slug>/settings/crm notes surface; this is the member-facing operator workspace.
//
// GATE (two parts, both required): the space's PLAN must grant CRM (spaceHasEntitlement crm), AND the
// viewer must be an OWNER / ADMIN of the space. When either fails we render a tasteful locked / upgrade
// state (not a 404 dead end), so an owner whose plan lacks CRM, or a non-admin member, sees a calm
// "here's what this is + how to get it" rather than a wall. (We still 404 a missing / not-visible
// space, the no-existence-leak rule.) Every read is fail-safe (lib/crm/pipeline.ts returns [] on error).
//
// The rail is registered 'none' for this route in lib/layout/page-chrome.ts (a full-width board).
// No em or en dashes; voice per CONTENT-VOICE §10.

export const metadata = {
  title: 'Space CRM',
}

export default async function SpaceCrmBoardPage({
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

  // Resolve the space, failing closed on a missing / not-visible space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const hasCrm = spaceHasEntitlement(space, 'crm')

  // GATE: a non-owner / non-admin viewer, or a space whose plan lacks CRM, gets the locked state.
  if (!caps.isAdmin || !hasCrm) {
    return (
      <LockedCrm
        brandName={brandName}
        slug={space.slug}
        // Tailor the message: an admin on a plan without CRM sees an upgrade nudge; a non-admin sees a
        // "this is for the team" note. Both are calm next steps, never a dead end.
        reason={!caps.isAdmin ? 'not-admin' : 'no-entitlement'}
      />
    )
  }

  // The space has CRM and the viewer runs it: make sure the per-segment starting pipeline exists, then
  // render the board. ensureSpaceStages is idempotent + fail-safe (a no-op once seeded / customized).
  await ensureSpaceStages(space.id, space.type)

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="CRM"
      description="Your space's pipeline and contacts. Bring people in from My Contacts and track each one through your stages."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      stats={
        <Suspense fallback={<StatsSkeleton />}>
          <CrmStats spaceId={space.id} />
        </Suspense>
      }
      width="wide"
    >
      <ImportContactsForm spaceId={space.id} />

      <Suspense fallback={<BoardSkeleton />}>
        <SpacePipeline spaceId={space.id} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <SpaceContacts spaceId={space.id} slug={space.slug} selectedContactId={selectedContactId} />
      </Suspense>
    </DashboardTemplate>
  )
}

// The locked / upgrade state: a calm card that explains what a Space CRM is and the next step, instead
// of a 404. Two reasons get two next steps; the page never dead-ends.
function LockedCrm({
  brandName,
  slug,
  reason,
}: {
  brandName: string
  slug: string
  reason: 'not-admin' | 'no-entitlement'
}) {
  const description =
    reason === 'not-admin'
      ? 'The CRM is for the people who run this space. Ask an admin to bring you onto the team, or open the space.'
      : 'A CRM turns the people you meet into a pipeline you can work: stages, deals, and contacts you bring over from My Contacts. It is part of a paid plan for this space.'

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="CRM"
      description="The relationship workspace for this space."
      back={{ href: `/spaces/${slug}`, label: brandName }}
      width="default"
    >
      <EmptyState
        icon={Lock}
        variant="permission"
        title={reason === 'not-admin' ? 'This is a team tool' : 'Unlock a CRM for this space'}
        description={description}
        action={
          reason === 'not-admin' ? (
            <Link
              href={`/spaces/${slug}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Open {brandName}
            </Link>
          ) : (
            <Link
              href={`/spaces/${slug}/settings`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              <Briefcase className="h-4 w-4" aria-hidden /> Manage {brandName}
            </Link>
          )
        }
      />
      {reason === 'no-entitlement' && (
        <p className="mt-4 text-center text-xs text-subtle">
          Want it turned on? Reach out and we will set up the plan for your space.
        </p>
      )}
    </DashboardTemplate>
  )
}

// The live stats band for THIS space's pipeline (deals + tasks scoped by space_id). Fail-safe reads.
async function CrmStats({ spaceId }: { spaceId: string }) {
  const [deals, tasksDue] = await Promise.all([getDeals(spaceId), countOpenTasks(spaceId)])
  const metrics = computeMetrics(deals, tasksDue)
  return (
    <>
      <StatCard size="sm" label="Open deals" value={metrics.openCount} icon={Briefcase} />
      <StatCard size="sm" label="Open value" value={formatMoney(metrics.openValue)} icon={CircleDollarSign} />
      <StatCard size="sm" label="Won value" value={formatMoney(metrics.wonValue)} icon={Trophy} />
      <StatCard size="sm" label="Tasks due" value={metrics.tasksDue} icon={ListChecks} />
    </>
  )
}

// ── Dimension-matched skeletons (no CLS, PAGE-FRAMEWORK §5.4) ────────────────────────────────────

function StatsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ))}
    </>
  )
}

function BoardSkeleton() {
  return (
    <section>
      <SectionHeader title="Pipeline" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 w-64 shrink-0 animate-pulse rounded-2xl bg-surface-elevated/50" />
        ))}
      </div>
    </section>
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
