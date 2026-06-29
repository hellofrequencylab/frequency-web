import Link from 'next/link'
import { Zap } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, getPracticesToLogToday, getPartialMapToday, type Practice, type PartialToday } from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { PracticeRowActions } from '@/components/practice/practice-row-actions'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { SectionHeader } from '@/components/ui/section-header'

// The Pillar / cadence / reward chips under a "Your practices" card title. Kept to ONE row
// (nowrap + overflow clipped): the category chip + reward stay fixed, and the length·cadence
// text truncates to absorb overflow, so the stats never spill to a second line.
function PracticeMeta({ p }: { p: { category: string | null; cadence: string | null; duration_min: number | null; reward_note: string | null } }) {
  const lengthCadence = [p.duration_min ? `${p.duration_min} min` : null, p.cadence].filter(Boolean).join(' · ')
  if (!p.category && !lengthCadence && !p.reward_note) return null
  return (
    <div className="mt-1.5 flex flex-nowrap items-center gap-x-2 overflow-hidden text-xs">
      {p.category && (
        <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
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

// "Your practices" are compact VERTICAL cards (two-up in the main column): the title links to
// the practice, a one-row meta sits under it, and the action row (Log / Continue, with Edit/
// Remove in the overflow) docks at the bottom. The card title carries the link, so the action
// row runs in `compact` mode (no redundant "View practice"). After a successful log the action
// row collapses to "Logged today" (B.4), which lives in the client wrapper.
function MineRow({
  p,
  byId,
  profileId,
  loggedToday,
  partialToday,
}: {
  p: Practice
  byId: Map<string, Pillar>
  profileId: string
  loggedToday: boolean
  /** A banked-but-unfinished log today → the card offers "Continue Practice". */
  partialToday: PartialToday | null
}) {
  const href = `/practices/${p.slug ?? p.id}`
  return (
    <li>
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md motion-reduce:transition-none">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-tight text-text transition-colors hover:text-primary-strong">
              {p.title}
            </h3>
          </Link>
          {p.domain_id && byId.has(p.domain_id) && (
            <div className="shrink-0">
              <PillarBadge name={byId.get(p.domain_id)!.name} />
            </div>
          )}
        </div>
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
// practices yet. Keeps the id="practices-mine" anchor.
export async function PracticesMine() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  // Seed the per-practice "logged today" state from the server (B.4) so a practice
  // already logged today paints in the collapsed state, never flashing a live button.
  // getPracticesToLogToday returns the NOT-yet-logged set; the complement is logged.
  // "Today" is the member's LOCAL day: getPracticesToLogToday resolves it from
  // profiles.home_timezone server-side, so an already-logged practice stays collapsed
  // until the member's OWN midnight (not UTC's). A member with no home_timezone falls
  // back to UTC for this first paint; the client row still collapses optimistically on
  // a fresh log, and a revalidate re-seeds it after.
  // partialMap: practices started but not finished today (a banked partial). A partial reads as
  // "logged" in toLog (it cleared the day), so we re-surface it as a "Continue Practice" row that
  // resumes the right timer. One extra read, no per-row query.
  const [mine, pillars, toLog, partialMap] = await Promise.all([
    getMemberPractices(profileId),
    getPillars(),
    getPracticesToLogToday(profileId),
    getPartialMapToday(profileId),
  ])
  if (mine.length === 0) return null
  const byId = pillarsById(pillars)
  const toLogIds = new Set(toLog.map((p) => p.id))

  return (
    <section id="practices-mine" className="scroll-mt-20">
      <SectionHeader title="Your practices" count={mine.length} />
      {/* Compact vertical cards, two-up in the main column (one-up on a phone). Container-query
          sized so they read 2-wide wherever the block lands in a wide slot. */}
      <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        {mine.map((p) => (
          <MineRow
            key={p.id}
            p={p}
            byId={byId}
            profileId={profileId}
            loggedToday={!toLogIds.has(p.id)}
            partialToday={partialMap.get(p.id) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}
