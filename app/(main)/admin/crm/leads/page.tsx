// Resonance CRM: Signup leads (scan2 L9-03). The induction at /join writes a `signup_leads` row on
// every beat; this is the first surface that reads it back. It lists the people who gave an email
// and never finished, the beat they stopped at, and what the funnel had already learned, with a
// mailto / copy affordance per row and a CSV export. Staff-gated like its CRM siblings, and
// composed on AdminTemplate like every other CRM leaf.
//
// No recovery email is sent from here. That job (one transactional note, once, after 24 h, to a
// lead who reached the feature pick or later) is a cron with its own consent rules and is not in
// this change.

import Link from 'next/link'
import { UserPlus, Users, Mail, ListChecks, UserRoundPen } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdmin } from '@/lib/admin/guard'
import { listAbandonedSignupLeads, countByStep } from '@/lib/crm/signup-leads'
import { LeadsTable, ExportLeadsButton } from './leads-table'

export const dynamic = 'force-dynamic'

const WINDOWS = [7, 30, 90] as const
type Window = (typeof WINDOWS)[number]

function parseWindow(raw: string | string[] | undefined): Window {
  const v = Number(Array.isArray(raw) ? raw[0] : raw)
  return (WINDOWS as readonly number[]).includes(v) ? (v as Window) : 30
}

export default async function CrmSignupLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>
}) {
  await requireAdmin('janitor', { staff: 'marketing' })
  const { days } = await searchParams
  const sinceDays = parseWindow(days)
  const leads = await listAbandonedSignupLeads({ sinceDays, limit: 500 })
  const byStep = countByStep(leads)

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Signup leads"
      icon={UserPlus}
      width="wide"
      description="People who gave an email at /join and never finished. Reach out, or export the list."
      actions={<ExportLeadsButton sinceDays={sinceDays} />}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Unfinished" value={leads.length} icon={Users} bordered detail={`last ${sinceDays} days`} />
        <StatCard label="Stopped at email" value={byStep['Email'] ?? 0} icon={Mail} bordered />
        <StatCard label="Stopped at feature pick" value={byStep['Feature pick'] ?? 0} icon={ListChecks} bordered />
        <StatCard label="Stopped at identity" value={byStep['Identity'] ?? 0} icon={UserRoundPen} bordered />
      </div>

      <AdminSection
        title="Who left, and where"
        description="Newest activity first. Converted rows never show here."
        actions={
          <nav aria-label="Time window" className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                href={w === 30 ? '/admin/crm/leads' : `/admin/crm/leads?days=${w}`}
                aria-current={w === sinceDays ? 'page' : undefined}
                className={`rounded-control px-2.5 py-1 text-body-sm transition-colors ${
                  w === sinceDays ? 'bg-primary-bg font-semibold text-primary-strong' : 'text-muted hover:bg-surface-elevated'
                }`}
              >
                {w}d
              </Link>
            ))}
          </nav>
        }
      >
        {leads.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Nobody left mid-way"
            description={`Every visitor who gave an email in the last ${sinceDays} days finished setting up, or nobody gave one. Widen the window to look further back.`}
          />
        ) : (
          <LeadsTable leads={leads} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
