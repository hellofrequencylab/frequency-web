import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceVerification, formatEin } from '@/lib/spaces/nonprofit-verification'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { VerifyForm } from './verify-form'

// NON PROFIT VERIFICATION — the owner submit surface (ADR-552, AUDIT #6). Non Profit is the
// verified-501(c)(3) sibling of Business: the same full depth, discounted per seat, gated behind this
// human review. This page owns the ROUTE + AUTH gate (resolveSpaceManageAccess, notFound on a miss so
// there is no existence leak), shows the CURRENT request status if one exists, and otherwise the submit
// form. Staff previewing get a read-only form (the write action re-gates on canManage). No em dashes.

export const metadata = {
  title: 'Non Profit verification',
}

const STATUS_UI = {
  pending: {
    icon: Clock,
    tone: 'text-warning',
    title: 'Verification in review',
    body: 'A person on our team is checking your 501(c)(3) status. You will see the result here, usually within a few business days.',
  },
  verified: {
    icon: CheckCircle2,
    tone: 'text-success',
    title: 'Verified Non Profit',
    body: 'Your organization is verified. This space is on the Non Profit plan: the full Business depth, discounted per licensed seat.',
  },
  rejected: {
    icon: XCircle,
    tone: 'text-danger',
    title: 'Verification not approved',
    body: 'We could not confirm your 501(c)(3) status from what was submitted. Check the note below, then submit a new request.',
  },
} as const

export default async function NonprofitVerifyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const current = await getSpaceVerification(space.id)

  // A rejected request may be resubmitted, so show the form again alongside the rejection note; a pending
  // or verified request shows status only (no duplicate submission).
  const showForm = !current || current.status === 'rejected'

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Non Profit verification"
      description="Verified 501(c)(3) organizations get the full Business depth, discounted per licensed seat. Submit your details and we will confirm your status."
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-6">
        <Link
          href={`/spaces/${slug}/settings/billing`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to plan and usage
        </Link>

        {current && (
          <StatusCard status={current.status} note={current.note} ein={current.ein} orgLegalName={current.orgLegalName} />
        )}

        {showForm && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <VerifyForm slug={slug} readOnly={staffViewing} />
          </div>
        )}
      </div>
    </FocusTemplate>
  )
}

function StatusCard({
  status,
  note,
  ein,
  orgLegalName,
}: {
  status: 'pending' | 'verified' | 'rejected'
  note: string | null
  ein: string | null
  orgLegalName: string | null
}) {
  const ui = STATUS_UI[status]
  const Icon = ui.icon
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ui.tone}`} aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold text-text">{ui.title}</p>
          <p className="text-xs leading-relaxed text-muted">{ui.body}</p>
          {(orgLegalName || ein) && (
            <p className="pt-1 text-2xs text-subtle">
              {orgLegalName}
              {orgLegalName && ein ? ' · ' : ''}
              {ein ? `EIN ${formatEin(ein)}` : ''}
            </p>
          )}
          {status === 'rejected' && note && (
            <p className="mt-2 rounded-lg bg-surface-elevated px-3 py-2 text-xs text-text">{note}</p>
          )}
        </div>
      </div>
    </div>
  )
}
