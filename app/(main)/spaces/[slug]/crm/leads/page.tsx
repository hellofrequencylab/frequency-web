import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Gauge, Lock, QrCode, UserPlus, CircleCheck, Mail } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { spaceManageHref } from '@/lib/spaces/types'
import { listSpaceLeads, spaceLeadStats } from '@/lib/crm/lead-capture'
import { LeadsView } from '@/components/crm/leads/leads-view'

// SPACE CRM — LEAD CAPTURE / ENTRY POINTS (CRM-MASTER-BUILD-PLAN §Phase 3, deliverable 7). The Space's
// captured leads, each with the immutable door they came through + whether they have joined Frequency,
// plus always-on guidance for making a lead-grab QR code and what each door does.
//
// GATE: reuses the CRM board's exact gate (plan ENTITLEMENT + owner/admin role via
// spaceFunctionAccessLive('crm')). A viewer who cannot use the CRM sees a calm locked/upgrade state, not
// a 404 (we still 404 a missing / not-visible space, the no-existence-leak rule). Every read is
// fail-safe (lib/crm/lead-capture.ts returns [] / zeros on error).
//
// MENU ROW (orchestrator to register in lib/admin/modules/space-modules.ts, per docs/MENU-CONTRACT.md):
//   { id: 'space.leads', label: 'Lead capture', desc: 'Captured leads and the door each came through.',
//     Icon: UserPlus, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' },
//     featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/leads`, order: 37, tier: 'primary' }

export const metadata = { title: 'Lead capture' }

export default async function SpaceLeadsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const canUseCrm = await spaceFunctionAccessLive(space, 'crm', caps.role, space.plan)
  const hasCrm = spaceHasEntitlement(space, 'crm')

  const boardHref = `/spaces/${space.slug}/crm`
  const codesHref = `/spaces/${space.slug}/settings/qr`

  if (!canUseCrm) {
    return (
      <DashboardTemplate
        eyebrow={brandName}
        title="Lead capture"
        description="Turn scans and sign-ups into people in your CRM, with the door each came through."
        width="default"
      >
        <EmptyState
          icon={hasCrm ? Lock : Gauge}
          variant="permission"
          title={hasCrm ? 'This is a team tool' : 'Do more with your Space CRM'}
          description={
            hasCrm
              ? 'Lead capture is for the people who run this space. Ask an admin to bring you onto the team, or open the space.'
              : 'Lead-grabs come with your Space CRM. They turn a scanned code or a sign-up into a lead you can work, with the door they came through kept forever.'
          }
          action={
            <Link
              href={hasCrm ? `/spaces/${space.slug}` : spaceManageHref(space.type, space.slug)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              {hasCrm ? `Open ${brandName}` : `Manage ${brandName}`}
            </Link>
          }
        />
      </DashboardTemplate>
    )
  }

  return (
    <DashboardTemplate
      eyebrow={brandName}
      title="Lead capture"
      description="Everyone you have captured, and the door each came through. The door is set once and never changes, so you always know where a relationship started."
      back={{ href: boardHref, label: 'CRM' }}
      stats={
        <Suspense fallback={<StatsSkeleton />}>
          <LeadStats spaceId={space.id} />
        </Suspense>
      }
      width="wide"
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-elevated/50" />}>
        <LeadsSection spaceId={space.id} boardHref={boardHref} codesHref={codesHref} />
      </Suspense>
    </DashboardTemplate>
  )
}

async function LeadStats({ spaceId }: { spaceId: string }) {
  const stats = await spaceLeadStats(spaceId)
  return (
    <>
      <StatCard size="sm" label="Leads captured" value={stats.total} icon={UserPlus} />
      <StatCard size="sm" label="Joined Frequency" value={stats.claimed} icon={CircleCheck} />
      <StatCard size="sm" label="Mailable" value={stats.mailable} icon={Mail} />
    </>
  )
}

async function LeadsSection({
  spaceId,
  boardHref,
  codesHref,
}: {
  spaceId: string
  boardHref: string
  codesHref: string
}) {
  const leads = await listSpaceLeads(spaceId)
  return <LeadsView leads={leads} boardHref={boardHref} codesHref={codesHref} />
}

function StatsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ))}
    </>
  )
}
