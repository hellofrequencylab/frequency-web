import { Suspense } from 'react'
import Link from 'next/link'
import { Users, Zap, CalendarDays, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getSpaceHealth } from '@/lib/dashboard/scores'
import { listEventsForSpace } from '@/lib/events/store'
import { loadMemberSummaries } from '@/app/(main)/admin/crm/member-summaries'
import { relativeTime } from '@/lib/utils'

// THE SPACE RESONANCE RAIL (ADR-789): the space-scoped twin of the admin AdminInfoRail's three
// live widgets, pared to what a space operator glances at beside their roster — LIVE (Members /
// Active this week / Upcoming events), NEEDS ATTENTION (the at-risk nudge, or "all clear"), and
// JUST JOINED (the newest members with their join date). Every read is SPACE-SCOPED and fail-safe:
// the health read degrades to zeros, the events + roster reads to []. Server Component; the two
// data groups stream behind their own <Suspense> (PAGE-FRAMEWORK §5) so a slow roster read never
// holds the glance numbers. The caller has already gated on space-manage, so nothing re-gates here.
// Semantic DAWN tokens only; no em dashes (CONTENT-VOICE §10).

/** How many newest members the "Just joined" list shows. */
const JUST_JOINED_LIMIT = 5

/** The in-tab scroll target the "needs attention" nudge and the roster link jump to (the id lives
 *  on the member-viewer wrapper in space-resonance-crm.tsx). */
const ROSTER_ANCHOR = '#space-resonance-roster'

// ── LIVE + NEEDS ATTENTION (one health read, two sections) ────────────────────────────────────

/** A presentational glance row: glyph + label on the left, the value on the right. Unlike the admin
 *  rail's linked rows these are read-only (the space roster is the inline island beside them, not a
 *  separate route), so there is no hover affordance to imply a dead link. */
function GlanceRow({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
      <span className="flex items-center gap-2.5 text-sm font-medium text-muted">
        <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        {label}
      </span>
      <span className="text-base font-bold tabular-nums text-text">{value}</span>
    </div>
  )
}

async function SpaceRailGlance({ spaceId }: { spaceId: string }) {
  // LIVE + NEEDS ATTENTION share the one fail-safe health read; the events read is separate but
  // parallel so the glance never waits on it serially. Both degrade to a calm zero on any error.
  const [health, upcoming] = await Promise.all([
    getSpaceHealth(spaceId),
    listEventsForSpace(spaceId, { upcomingOnly: true, limit: 100 }),
  ])
  const atRisk = health.atRisk

  return (
    <>
      <section className="rounded-2xl border border-border bg-surface p-2">
        <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Live</p>
        <GlanceRow label="Members" value={health.members.toLocaleString()} icon={Users} />
        <GlanceRow label="Active this week" value={health.weeklyActive} icon={Zap} />
        <GlanceRow label="Upcoming events" value={upcoming.length} icon={CalendarDays} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-2">
        <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Needs attention
        </p>
        {atRisk > 0 ? (
          <Link
            href={ROSTER_ANCHOR}
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-muted">
              <Activity className="h-4 w-4 shrink-0 text-danger" aria-hidden />
              {atRisk === 1 ? '1 member needs a nudge' : `${atRisk} members need a nudge`}
            </span>
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-danger-bg px-2 py-0.5 text-xs font-bold tabular-nums text-danger">
              {atRisk}
            </span>
          </Link>
        ) : (
          <p className="px-3 pb-2 pt-0.5 text-sm text-success">All clear. Nothing waiting.</p>
        )}
      </section>
    </>
  )
}

// ── JUST JOINED (the newest members with their join date) ──────────────────────────────────────

/** Render a member's join epoch (the roster's `joined` sortValue) as a relative label. The value is
 *  a real millisecond epoch when profiles.created_at is known and a small ordinal fallback when it is
 *  not (see loadMemberSummaries); guard on a plausible epoch so an ordinal never renders as 1970. */
function joinedLabel(joined: number | string | undefined): string | null {
  if (typeof joined !== 'number' || joined < 1e12) return null
  return relativeTime(new Date(joined).toISOString())
}

async function SpaceRailJustJoined({ spaceId }: { spaceId: string }) {
  // Reuse the same scored-roster mapper the viewer reads, scoped to this space, then take the newest
  // by the `joined` epoch. Fail-safe: [] on any miss (the reader returns [] when nobody is scored).
  const members = await loadMemberSummaries({ kind: 'all' }, { spaceId })
  const newest = [...members]
    .sort((a, b) => Number(b.sortValues?.joined ?? 0) - Number(a.sortValues?.joined ?? 0))
    .slice(0, JUST_JOINED_LIMIT)

  return (
    <section>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Just joined</p>
        <Link href={ROSTER_ANCHOR} className="text-xs font-semibold text-primary-strong hover:underline">
          Roster
        </Link>
      </div>
      <div className="space-y-0.5">
        {newest.map((m) => {
          const when = joinedLabel(m.sortValues?.joined)
          return (
            <Link
              key={m.id}
              href={`/people/${m.handle}`}
              className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-surface-elevated"
            >
              <span className="min-w-0 truncate text-sm font-medium text-text">{m.displayName}</span>
              {when && <span className="shrink-0 pl-2 text-xs text-subtle">{when}</span>}
            </Link>
          )
        })}
        {newest.length === 0 && <p className="px-3 py-2 text-sm text-subtle">No members scored yet.</p>}
      </div>
    </section>
  )
}

// ── The rail ───────────────────────────────────────────────────────────────────────────────────

/** A slim skeleton block matching a rail section's footprint (no CLS, PAGE-FRAMEWORK §5.4). */
function RailSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-2">
      <div className="mx-3 my-2 h-3 w-16 animate-pulse rounded bg-surface-elevated/70" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mx-1 my-1 h-10 animate-pulse rounded-xl bg-surface-elevated/50" />
      ))}
    </div>
  )
}

export function SpaceResonanceRail({ spaceId }: { spaceId: string; slug?: string }) {
  return (
    <div className="space-y-5">
      {/* LIVE + NEEDS ATTENTION ride the fast health + events reads; the heavier roster read below
          streams on its own so it never holds these numbers back. */}
      <Suspense
        fallback={
          <div className="space-y-5">
            <RailSkeleton rows={3} />
            <RailSkeleton rows={1} />
          </div>
        }
      >
        <SpaceRailGlance spaceId={spaceId} />
      </Suspense>

      <Suspense fallback={<RailSkeleton rows={JUST_JOINED_LIMIT} />}>
        <SpaceRailJustJoined spaceId={spaceId} />
      </Suspense>
    </div>
  )
}
