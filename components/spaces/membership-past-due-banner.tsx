import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import {
  spacePastDueMemberBody,
  spacePastDueMemberTitle,
  type PastDueSpaceMembership,
} from '@/lib/spaces/membership-dunning'

// SPACE MEMBERSHIP PAST-DUE BANNER (LIVE-429 / ADR-1478). Display only.
// Access stays open. No em dashes (CONTENT-VOICE §10).

export function MembershipPastDueBanner({
  spaceName,
  href,
}: {
  spaceName: string
  href?: string | null
}) {
  return (
    <div className="rounded-2xl border border-warning/50 bg-warning-bg/30 p-4 text-left">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-text">{spacePastDueMemberTitle()}</p>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">
            {spacePastDueMemberBody(spaceName)}
          </p>
          {href ? (
            <p className="mt-3">
              <Link
                href={href}
                className="text-body-sm font-semibold text-primary-strong hover:underline"
              >
                Open {spaceName}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function MembershipPastDueList({ rows }: { rows: PastDueSpaceMembership[] }) {
  if (rows.length === 0) return null
  return (
    <div className="mb-4 space-y-3">
      {rows.map((row) => (
        <MembershipPastDueBanner
          key={row.membershipId}
          spaceName={row.spaceName}
          href={`/spaces/${row.spaceSlug}`}
        />
      ))}
    </div>
  )
}
