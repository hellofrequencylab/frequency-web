import { Suspense } from 'react'
import { CalendarClock, Megaphone, Users } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { listPhases, type BetaPhase } from '@/lib/beta/phases'
import { listPhaseOutbound, type OutboundItem, type ApprovalStatus } from '@/lib/beta/approvals'

// TIMELINE — the production runway to Sept 1 (Wave 2, read-only v1). One horizontal
// schedule: each phase gets a band (from starts_on/ends_on where set, otherwise an
// even slice of the runway in plan order) and every scheduled campaign or admission
// wave lands as a marker on its date. Rescheduling still routes through the approval
// spine (approve(ref, { scheduledFor })), so this view stays read-only for now.
//
// Server Component behind a <Suspense> boundary so it never blocks the tab shell.

// The runway target. The Beta bills Founding spots and opens the doors here.
const LAUNCH_ISO = '2026-09-01'

const DAY_MS = 86_400_000

const PHASE_TONE: Record<BetaPhase['status'], { band: string; label: StatusTone }> = {
  not_started: { band: 'bg-surface-elevated border-border', label: 'neutral' },
  in_progress: { band: 'bg-info-bg border-info/40', label: 'info' },
  done: { band: 'bg-success-bg border-success/40', label: 'success' },
}

const APPROVAL_TONE: Record<ApprovalStatus, StatusTone> = {
  draft: 'neutral',
  ready: 'warning',
  approved: 'success',
  scheduled: 'info',
  sending: 'info',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// The runway anchors on the current time. Kept in a plain module helper (not the
// component body) so the render stays pure — the timeline is dynamic (force-dynamic
// page), so reading the clock per request is intended.
function runwayNow(): number {
  return Date.now()
}

function pct(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

export function BetaTimelineSection() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-3xl" />}>
      <TimelineBoard />
    </Suspense>
  )
}

async function TimelineBoard() {
  const phases = await listPhases()

  if (phases.length === 0) {
    return (
      <AdminSection title="Timeline">
        <EmptyState
          variant="first-use"
          title="No phases to schedule yet"
          description="Once the P0 to P4 plan is seeded, its phases and scheduled sends lay out here on the runway to September 1."
        />
      </AdminSection>
    )
  }

  const outboundByPhase = new Map(
    await Promise.all(phases.map(async (p) => [p.id, await listPhaseOutbound(p.id)] as const)),
  )
  const scheduled = [...outboundByPhase.values()]
    .flat()
    .filter((i): i is OutboundItem & { scheduledFor: string } => Boolean(i.scheduledFor))

  // The window: now → Sept 1, widened to include any real phase or send date.
  const now = runwayNow()
  const launch = new Date(LAUNCH_ISO).getTime()
  const dated: number[] = [now, launch]
  for (const p of phases) {
    if (p.startsOn) dated.push(new Date(p.startsOn).getTime())
    if (p.endsOn) dated.push(new Date(p.endsOn).getTime())
  }
  for (const s of scheduled) dated.push(new Date(s.scheduledFor).getTime())
  const min = Math.min(...dated)
  const max = Math.max(...dated)

  // Even fallback slice for phases with no explicit dates (the "lay them out in order"
  // branch): carve now → Sept 1 into one slot per phase, by plan position.
  const coreSpan = Math.max(launch - now, DAY_MS)
  const slot = coreSpan / phases.length

  function bandFor(phase: BetaPhase, index: number): { left: number; width: number } {
    const start =
      phase.startsOn != null ? new Date(phase.startsOn).getTime() : now + slot * index
    const end =
      phase.endsOn != null ? new Date(phase.endsOn).getTime() : start + slot
    const left = pct(start, min, max)
    const right = pct(end, min, max)
    return { left, width: Math.max(right - left, 2) }
  }

  // Month ticks across the window, for a light gridline read.
  const ticks: { label: string; left: number }[] = []
  const cursor = new Date(min)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)
  while (cursor.getTime() < max) {
    ticks.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      left: pct(cursor.getTime(), min, max),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const nowLeft = pct(now, min, max)

  return (
    <AdminSection
      title="Runway to September 1"
      description="Every phase and every scheduled send on one schedule. Read-only for now; rescheduling runs through the approval queue."
    >
      <div className="space-y-6 rounded-3xl border border-border bg-surface p-5 sm:p-6">
        {/* Axis: month ticks + the "today" marker. */}
        <div className="relative h-5">
          {ticks.map((t) => (
            <div
              key={t.label + t.left}
              className="absolute top-0 -translate-x-1/2 text-2xs font-semibold uppercase tracking-wide text-subtle"
              style={{ left: `${t.left}%` }}
            >
              {t.label}
            </div>
          ))}
          <div
            className="absolute top-0 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-2xs font-bold text-on-primary"
            style={{ left: `${nowLeft}%` }}
          >
            Today
          </div>
        </div>

        {/* Phase bands, each with its scheduled sends as markers. */}
        <div className="space-y-3">
          {phases.map((phase, index) => {
            const band = bandFor(phase, index)
            const sends = (outboundByPhase.get(phase.id) ?? []).filter((i) => i.scheduledFor)
            const tone = PHASE_TONE[phase.status]
            const dateLabel =
              phase.startsOn && phase.endsOn
                ? `${fmt(phase.startsOn)} – ${fmt(phase.endsOn)}`
                : 'Order only'
            return (
              <div key={phase.id} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">
                    <span className="text-primary-strong">{phase.key}</span> {phase.title}
                  </p>
                  <p className="text-2xs text-subtle">{dateLabel}</p>
                </div>
                <div className="relative h-9">
                  {/* the today line, faint, across the track */}
                  <div
                    className="absolute inset-y-0 w-px bg-primary/40"
                    style={{ left: `${nowLeft}%` }}
                    aria-hidden
                  />
                  <div
                    className={`absolute top-1/2 flex h-7 -translate-y-1/2 items-center rounded-lg border px-2 ${tone.band}`}
                    style={{ left: `${band.left}%`, width: `${band.width}%` }}
                  >
                    <span className="truncate text-2xs font-semibold text-text/80">
                      {phase.key}
                    </span>
                  </div>
                  {sends.map((s) => (
                    <div
                      key={`${s.type}:${s.id}`}
                      className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary-strong"
                      style={{ left: `${pct(new Date(s.scheduledFor as string).getTime(), min, max)}%` }}
                      title={`${s.label} · ${fmt(s.scheduledFor as string)}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* The scheduled-send list: the accessible, exact read under the visual. */}
        <div className="space-y-2 border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-subtle">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Scheduled sends
          </h3>
          {scheduled.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing is scheduled yet. Scheduled campaigns and admission waves show up here with
              their send date.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {[...scheduled]
                .sort(
                  (a, b) =>
                    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
                )
                .map((item) => {
                  const Icon = item.type === 'campaign' ? Megaphone : Users
                  return (
                    <li
                      key={`${item.type}:${item.id}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-3"
                    >
                      <span className="w-16 shrink-0 text-xs font-bold tabular-nums text-text">
                        {fmt(item.scheduledFor)}
                      </span>
                      <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                        {item.label}
                      </span>
                      <StatusChip tone={APPROVAL_TONE[item.approvalStatus]} size="sm">
                        {item.approvalStatus}
                      </StatusChip>
                    </li>
                  )
                })}
            </ul>
          )}
        </div>
      </div>
    </AdminSection>
  )
}
