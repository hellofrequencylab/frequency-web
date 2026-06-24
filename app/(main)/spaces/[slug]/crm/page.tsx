import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Briefcase, CircleDollarSign, ListChecks, Lock, Trophy } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement, spaceAutonomyLevel } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { getDeals, countOpenTasks, computeMetrics, formatMoney, ensureSpaceStages } from '@/lib/crm/pipeline'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SpacePipeline } from '@/components/spaces/crm/space-pipeline'
import { CrmFunnelPanel } from '@/components/spaces/crm/crm-funnel-panel'
import { SpaceContacts } from '@/components/spaces/crm/space-contacts'
import { SpaceContactDetail } from '@/components/spaces/crm/space-contact-detail'
import { SpaceTasks } from '@/components/spaces/crm/space-tasks'
import { ImportContactsForm } from '@/components/spaces/crm/import-contacts-form'
import { SpaceCockpitBand } from './space-cockpit-band'
import { AutonomyControl } from './autonomy-control'

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
  // The CRM gate now runs through the LIVE per-Space resolver (ADR-370): it folds the plan ENTITLEMENT
  // (the on/off switch via spaceHasEntitlement), the per-Space MIN-ROLE (CRM defaults to 'admin', which
  // reproduces the old caps.isAdmin threshold; an operator/owner can lower it via the feature grids),
  // AND the consistent featureAllowed('space_crm') plan-ladder check. While billing is OFF, featureAllowed
  // grants everything, so this returns EXACTLY what the pure resolver returned before (today's behavior).
  // Projecting spaces.entitlements onto the Space (lib/spaces/store.ts) lets the entitlement half read
  // `crm:true` instead of always seeing undefined.
  const canUseCrm = await spaceFunctionAccessLive(space, 'crm', caps.role, space.plan)
  const hasCrm = spaceHasEntitlement(space, 'crm') // drives only the LOCKED-state reason split below

  // GATE: a viewer whose role is too low, OR a space whose plan lacks CRM, gets the locked state.
  if (!canUseCrm) {
    return (
      <LockedCrm
        brandName={brandName}
        slug={space.slug}
        // Tailor the message: an admin on a plan without CRM sees an upgrade nudge; a viewer whose role
        // is too low sees a "this is for the team" note. Both are calm next steps, never a dead end. The
        // entitlement (hasCrm) decides which: no entitlement -> upgrade; entitlement present but role
        // too low -> team note.
        reason={hasCrm ? 'not-admin' : 'no-entitlement'}
      />
    )
  }

  // The space has CRM and the viewer runs it: make sure the per-segment starting pipeline exists, then
  // render the board. ensureSpaceStages is idempotent + fail-safe (a no-op once seeded / customized).
  await ensureSpaceStages(space.id, space.type)

  const boardHref = `/spaces/${space.slug}/crm`

  // CONTACT DETAIL MODE: when a contact is selected (?contact=<id>) the board hands the full surface to
  // the on-board detail (identity + fields + timeline + deals + note composer). The detail read is
  // owner-gated + space-scoped inside getSpaceContactDetail, so a wrong-space / non-editor id shows the
  // calm "pick a contact" prompt rather than another Space's data.
  if (selectedContactId) {
    return (
      <DashboardTemplate
        eyebrow={brandName}
        title="Contact"
        description="One person in your space CRM: their details, history, deals, and your private notes."
        back={{ href: boardHref, label: 'CRM board' }}
        width="default"
      >
        <Suspense fallback={<ListSkeleton />}>
          <SpaceContactDetail
            spaceId={space.id}
            contactId={selectedContactId}
            backHref={boardHref}
          />
        </Suspense>
      </DashboardTemplate>
    )
  }

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="CRM"
      description="Your space's pipeline, tasks, and contacts. Bring people in from My Contacts and track each one through your stages."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      stats={
        <Suspense fallback={<StatsSkeleton />}>
          <CrmStats spaceId={space.id} />
        </Suspense>
      }
      width="wide"
    >
      {/* RESONANCE COCKPIT BAND (Phase 2 · ADR-383): the verdict line + four Space-scoped health
          StatCards + the Space who-needs-attention worklist, ABOVE the existing pipeline / funnel /
          tasks (which stay intact). Its own Suspense so the cockpit reads never block the board, and
          every read is fail-safe (zeros / empty). Gated by the same canUseCrm check that gates the
          whole board (entitlement + owner/admin). */}
      <Suspense fallback={<CockpitSkeleton />}>
        <SpaceCockpitBand spaceId={space.id} slug={space.slug} />
      </Suspense>

      {/* AUTONOMY SLIDER (Phase 3 · ADR-384): the owner's dial for how much Vera does on its own.
          Owner/admin only (caps.canManageMembers); the setter re-gates server-side. Fail-closed to
          suggest_only by default, so nothing auto-executes until the owner explicitly raises it. */}
      {caps.canManageMembers && (
        <AutonomyControl slug={space.slug} level={spaceAutonomyLevel(space)} />
      )}

      <ImportContactsForm spaceId={space.id} />

      <Suspense fallback={<BoardSkeleton />}>
        <SpacePipeline spaceId={space.id} />
      </Suspense>

      {/* Funnel analytics (ADR-381): a read-only conversion + engagement view. Behind its own Suspense
          so the funnel read never blocks the pipeline / tasks / contacts above and below it. */}
      <Suspense fallback={<FunnelSkeleton />}>
        <CrmFunnelPanel spaceId={space.id} />
      </Suspense>

      <div className="grid gap-6 @3xl:grid-cols-2">
        <Suspense fallback={<ListSkeleton />}>
          <SpaceTasks spaceId={space.id} slug={space.slug} />
        </Suspense>

        <Suspense fallback={<ListSkeleton />}>
          {/* Each contact row opens the on-board detail (?contact=<id> on this board). */}
          <SpaceContacts
            spaceId={space.id}
            slug={space.slug}
            selectedContactId={null}
            linkBase={boardHref}
          />
        </Suspense>
      </div>
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

function CockpitSkeleton() {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-surface-elevated/50" />
    </section>
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

function FunnelSkeleton() {
  return (
    <section>
      <SectionHeader title="Funnel" />
      <div className="mb-4 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/50" />
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
