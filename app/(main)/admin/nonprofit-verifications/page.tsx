import Link from 'next/link'
import { ShieldCheck, Inbox } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdmin } from '@/lib/admin/guard'
import { listPendingVerifications, formatEin } from '@/lib/spaces/nonprofit-verification'
import { ReviewConsole } from './review-console'

// NON PROFIT (501(c)(3)) VERIFICATION REVIEW (ADR-552, AUDIT #6). The operator queue for Space owners who
// requested the discounted Non Profit plan: each pending row shows the org legal name + EIN + who
// submitted it, one console to approve (grants the Non Profit plan via setSpacePlan) or reject with a
// reason. Composes the kit: AdminTemplate, StatCard, AdminSection, EmptyState. Gate matches the
// billing-adjacent admin surfaces (Pricing / Payments): platform staff only, re-checked in every action.

export const dynamic = 'force-dynamic'

export default async function NonprofitVerificationsPage() {
  await requireAdmin('janitor')

  const pending = await listPendingVerifications()

  return (
    <AdminTemplate
      eyebrow="Studio"
      title="Non Profit verifications"
      icon={ShieldCheck}
      width="wide"
      description="Space owners requesting the Non Profit plan submit their 501(c)(3) details here. Approve to grant the discounted plan, or reject with a reason the owner can act on."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Awaiting review" value={pending.length} icon={Inbox} />
      </div>

      <AdminSection
        title={`${pending.length} pending`}
        description="Confirm each organization's 501(c)(3) status against public records before approving. Approval grants the Non Profit plan (the full Business depth, discounted per seat)."
      >
        {pending.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing to review."
            description="New Non Profit verification requests will appear here as Space owners submit them."
          />
        ) : (
          <ul className="space-y-3">
            {pending.map((v) => (
              <li key={v.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-text">{v.orgLegalName || 'No legal name given'}</p>
                    <p className="text-xs text-muted">EIN {formatEin(v.ein)}</p>
                    <p className="text-2xs text-subtle">
                      {v.spaceSlug ? (
                        <Link href={`/spaces/${v.spaceSlug}`} className="font-semibold text-primary-strong hover:underline">
                          {v.spaceName}
                        </Link>
                      ) : (
                        v.spaceName
                      )}{' '}
                      · submitted by {v.submitterName} on {new Date(v.submittedAt).toLocaleDateString('en-US')}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto">
                    <ReviewConsole id={v.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
