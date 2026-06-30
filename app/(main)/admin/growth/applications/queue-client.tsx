'use client'

// The review-queue list + filters (Growth OS Engine 3, GE3-4, ADR-456). The page
// passes presentation-ready rows; this client renders the track/status filter chips
// (which navigate by querystring, so the server re-queries + re-gates) and the row
// list. Decisions happen on the per-application detail console, not here. Strings are
// CONTENT-VOICE (plain, no em dashes); semantic tokens only.

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { APPLICATION_TRACKS, APPLICATION_STATUSES, STATUS_LABEL, APPLICATION_TRACK_DEFS } from '@/lib/applications/tracks'

const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'info',
  in_review: 'warning',
  accepted: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
}

export interface QueueRow {
  id: string
  track: string
  trackLabel: string
  status: string
  applicant: string
  handle: string | null
  createdAt: string
}

export function QueueClient({
  rows,
  activeTrack,
  activeStatus,
}: {
  rows: QueueRow[]
  activeTrack: string | null
  activeStatus: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()

  function navigate(next: { track?: string | null; status?: string | null }) {
    const track = next.track === undefined ? activeTrack : next.track
    const status = next.status === undefined ? activeStatus : next.status
    const params = new URLSearchParams()
    if (track) params.set('track', track)
    if (status) params.set('status', status)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="space-y-4">
      {/* Track filter. */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!activeTrack} onClick={() => navigate({ track: null })}>
          All tracks
        </Chip>
        {APPLICATION_TRACKS.map((t) => (
          <Chip key={t} active={activeTrack === t} onClick={() => navigate({ track: t })}>
            {APPLICATION_TRACK_DEFS[t].label}
          </Chip>
        ))}
      </div>

      {/* Status filter. */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!activeStatus} onClick={() => navigate({ status: null })}>
          Open
        </Chip>
        {APPLICATION_STATUSES.map((s) => (
          <Chip key={s} active={activeStatus === s} onClick={() => navigate({ status: s })}>
            {STATUS_LABEL[s]}
          </Chip>
        ))}
      </div>

      {/* Rows. */}
      <div className="space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/growth/applications/${r.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-sm font-bold text-text">{r.applicant}</h4>
                {r.handle && <span className="text-xs text-subtle">@{r.handle}</span>}
                <StatusChip tone={STATUS_TONE[r.status] ?? 'neutral'} size="sm">
                  {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}
                </StatusChip>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-semibold text-text">{r.trackLabel}</span> ·{' '}
                {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-on-primary'
          : 'bg-surface-elevated text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
