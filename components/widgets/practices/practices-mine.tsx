import Link from 'next/link'
import { Zap, Map as MapIcon } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import {
  getMemberAdoptions,
  getPracticesToLogToday,
  getPartialMapToday,
  type MemberAdoption,
  type Practice,
  type PartialToday,
} from '@/lib/practices'
import { termProgress } from '@/lib/practices/adoption'
import { timerPreview } from '@/lib/movement'
import { memberDay } from '@/lib/member-day'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { PracticeRowActions } from '@/components/practice/practice-row-actions'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { SectionHeader } from '@/components/ui/section-header'

// The Pillar / cadence / reward chips under a "Your practices" card title. Kept to ONE row
// (nowrap + overflow clipped): the category chip + reward stay fixed, and the length·cadence
// text truncates to absorb overflow, so the stats never spill to a second line.
function PracticeMeta({ p }: { p: Practice }) {
  // The timer preview (PRACTICE-TIMER-REWORK P4, shipped with ADR-920 Phase 5): the same pure
  // string the detail page + builder render ("Be Still · 10 min" / "Get Moving · Walk · ~20 min"
  // / "Log it"), so a card says how a practice is DONE before it is opened. The base-table read
  // behind getMemberAdoptions carries the timer columns, so this is derived, no extra query.
  const preview = timerPreview({ timerKind: p.timer_kind, movementConfig: p.movement_config, durationMin: p.duration_min })
  const lengthCadence = [preview, p.cadence].filter(Boolean).join(' · ')
  if (!p.category && !lengthCadence && !p.reward_note) return null
  return (
    <div className="mt-1.5 flex flex-nowrap items-center gap-x-2 overflow-hidden text-meta">
      {p.category && (
        <span className="shrink-0 rounded-pill bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
          {p.category.replace(/-/g, ' ')}
        </span>
      )}
      {lengthCadence && <span className="truncate text-subtle">{lengthCadence}</span>}
      {p.reward_note && (
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-warning">
          <Zap className="h-3 w-3 fill-warning" aria-hidden />
          {p.reward_note}
        </span>
      )}
    </div>
  )
}

/** The commitment line (ADR-920): "Week 2 of 4 · Day 9 of 28" for a termed self adoption,
 *  a quiet journey chip for a journey-sourced row, nothing for ongoing. Endowed + clamped
 *  (the adoption day reads Day 1 of 28 immediately). */
function CommitmentLine({ a, today }: { a: MemberAdoption; today: string }) {
  if (a.source === 'journey') {
    // Plain "Part of a Journey": an Anchor rides every week and a no-drip Journey has all
    // weeks open, so "this week" would over-claim (copy canon: the skeptic test).
    return (
      <p className="mt-1 flex items-center gap-1 text-2xs font-medium text-primary-strong">
        <MapIcon className="h-3 w-3" aria-hidden />
        Part of a Journey
      </p>
    )
  }
  if (!a.startsOn || !a.endsOn) return null
  const prog = termProgress({ startsOn: a.startsOn, endsOn: a.endsOn, today })
  if (prog.totalDays == null) return null
  return (
    <p className="mt-1 text-2xs font-medium text-muted">
      Week {prog.week} of {prog.totalWeeks} · Day {prog.day} of {prog.totalDays}
    </p>
  )
}

// "Your practices" are compact VERTICAL cards (two-up in the main column): the title links to
// the practice, a one-row meta sits under it, and the action row (Log / Continue, with Edit/
// Remove in the overflow) docks at the bottom. The card title carries the link, so the action
// row runs in `compact` mode (no redundant "View practice"). After a successful log the action
// row collapses to "Logged today" (B.4), which lives in the client wrapper.
function MineRow({
  a,
  byId,
  profileId,
  loggedToday,
  partialToday,
  today,
}: {
  a: MemberAdoption
  byId: Map<string, Pillar>
  profileId: string
  loggedToday: boolean
  /** A banked-but-unfinished log today → the card offers "Continue Practice". */
  partialToday: PartialToday | null
  today: string
}) {
  const p: Practice = a.practice
  const href = `/practices/${p.slug ?? p.id}`
  return (
    <li>
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 lift-2 transition-colors hover:border-primary-bg motion-reduce:transition-none">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="min-w-0 flex-1">
            <h3 className="truncate text-body-sm font-bold leading-tight text-text transition-colors hover:text-primary-strong">
              {p.title}
            </h3>
          </Link>
          {p.domain_id && byId.has(p.domain_id) && (
            <div className="shrink-0">
              <PillarBadge name={byId.get(p.domain_id)!.name} />
            </div>
          )}
        </div>
        <CommitmentLine a={a} today={today} />
        <PracticeMeta p={p} />
        <div className="mt-auto pt-3">
          <PracticeRowActions
            practiceId={p.id}
            title={p.title}
            href={href}
            loggedToday={loggedToday}
            timerKind={p.timer_kind}
            mindlessMode={p.mindless_mode}
            movementConfig={p.movement_config}
            partialToday={partialToday}
            isOwner={p.created_by === profileId}
            compact
          />
        </div>
      </div>
    </li>
  )
}

// Practices layout module (ADR-270/294): "Your practices" — the member's adopted + built list in a
// readable column. Self-fetching RSC; renders nothing for a logged-out viewer or one with no
// practices yet. Keeps the id="practices-mine" anchor. TODAY-FIRST ordering (ADR-920 Phase 4):
// a banked partial leads (finish what you started), then anything still unlogged, then done —
// the front door answers "what do I do right now" before it offers a browse.
export async function PracticesMine() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  // Seed the per-practice "logged today" state from the server (B.4) so a practice
  // already logged today paints in the collapsed state, never flashing a live button.
  // getPracticesToLogToday returns the NOT-yet-logged set; the complement is logged.
  // "Today" is the member's LOCAL day (profiles.home_timezone), the same framing the
  // term progress line uses.
  const [mine, pillars, toLog, partialMap, { data: prof }] = await Promise.all([
    getMemberAdoptions(profileId),
    getPillars(),
    getPracticesToLogToday(profileId),
    getPartialMapToday(profileId),
    createAdminClient().from('profiles').select('home_timezone').eq('id', profileId).maybeSingle(),
  ])
  if (mine.length === 0) return null
  const byId = pillarsById(pillars)
  const toLogIds = new Set(toLog.map((p) => p.id))
  const today = memberDay((prof as { home_timezone: string | null } | null)?.home_timezone)

  // Today-first: partials (finish it), then unlogged, then logged; stable within groups.
  const rank = (a: MemberAdoption) =>
    partialMap.has(a.practice.id) ? 0 : toLogIds.has(a.practice.id) ? 1 : 2
  const ordered = [...mine].sort((a, b) => rank(a) - rank(b))

  return (
    <section id="practices-mine" className="scroll-mt-20">
      <SectionHeader title="Your practices" count={mine.length} />
      {/* Compact vertical cards, two-up in the main column (one-up on a phone). Container-query
          sized so they read 2-wide wherever the block lands in a wide slot. */}
      <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        {ordered.map((a) => (
          <MineRow
            key={a.practice.id}
            a={a}
            byId={byId}
            profileId={profileId}
            loggedToday={!toLogIds.has(a.practice.id)}
            partialToday={partialMap.get(a.practice.id) ?? null}
            today={today}
          />
        ))}
      </ul>
    </section>
  )
}
