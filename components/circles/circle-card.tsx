import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { StatusBadge } from '@/components/groups/status-badge'
import { joinCircle } from '@/app/(main)/circles/actions'

export type CircleCardData = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  /** Precomputed "Outpost · Nexus" breadcrumb, or the interest name for online circles. */
  context?: string | null
}

// The one circle card, shared across the Circles surface (near-you, results,
// region/interest browse). Calm entity card per the browse-page standard.
export function CircleCard({ circle, isMember }: { circle: CircleCardData; isMember: boolean }) {
  const pct = Math.min(100, Math.round((circle.member_count / Math.max(1, circle.member_cap)) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary-bg hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/circles/${circle.slug}`}
              className="text-base font-semibold text-text transition-colors hover:text-primary-strong"
            >
              {circle.name}
            </Link>
            <StatusBadge status={circle.status} />
            {circle.type === 'in-person' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-xs font-medium text-primary-strong">
                <MapPin className="h-3 w-3" />
                In person
              </span>
            )}
          </div>
          {circle.context && <p className="mt-0.5 truncate text-xs text-subtle">{circle.context}</p>}
        </div>
      </div>

      {circle.about && <p className="mt-3 line-clamp-2 text-sm text-muted">{circle.about}</p>}

      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-subtle">
            {circle.member_count} / {circle.member_cap} members
          </span>
          {full ? (
            <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">Full</span>
          ) : nearCap ? (
            <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning">Almost full</span>
          ) : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className={`h-full rounded-full ${full ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-4">
          {isMember ? (
            <Link
              href={`/circles/${circle.slug}`}
              className="inline-flex rounded-lg bg-primary-bg px-3 py-1.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
            >
              Open circle →
            </Link>
          ) : !full ? (
            <form action={joinCircle.bind(null, circle.id, circle.slug)}>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Join circle
              </button>
            </form>
          ) : (
            <Link
              href={`/circles/${circle.slug}`}
              className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              View
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
