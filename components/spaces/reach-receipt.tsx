import Link from 'next/link'
import { Eye, MousePointerClick, Users, Heart, CalendarCheck, Compass } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { StandingLever } from '@/lib/spaces/standing'

// THE OPERATOR RECEIPT (LIVE-265 - docs/CORE-MODEL.md Phase 10 §8.4). Two questions, in this order:
// WHAT DID THE NETWORK SEND ME, and WHAT WOULD SEND MORE.
//
// Why this page exists at all. The Space directory now orders by an earned standing score instead of
// the alphabet, and a ranking nobody can see reads as favouritism. So the same seven signals that
// decide the order are printed here, for the operator, in the same words, with the one next move
// beside each. That is the difference between a ranking and a black box, and it is the whole reason
// earned exposure is a promise worth making.
//
// Presentational + server-friendly (no hooks, no client JS). Semantic DAWN tokens only, no hex.
// Voice canon (CONTENT-VOICE §10): plain sentences, no em dashes, no narrating the operator's
// feelings, no promises about outcomes we cannot keep.

/** Page activity in the trailing window, alongside current audience totals. */
export interface ReachSummary {
  windowDays: number
  profileViews: number | null
  ctaClicks: number | null
  /** Members who follow this Space. Null when it was not measured. */
  followers: number | null
  /** Active members of this Space. Null when it was not measured. */
  members: number | null
  /** Gatherings still ahead. Null when it was not measured. */
  upcoming: number | null
}

/** Where this Space sits in the directory, when it is listed there at all. */
export interface DirectoryPlacement {
  /** 1-based position among the listed Spaces, best standing first. */
  position: number
  /** How many Spaces are listed. */
  total: number
}

const BAND_STYLE: Record<StandingLever['band'], { label: string; cls: string }> = {
  strong: { label: 'Strong', cls: 'bg-success-bg text-success' },
  building: { label: 'Building', cls: 'bg-primary-bg text-primary-strong' },
  quiet: { label: 'Nothing yet', cls: 'bg-surface-elevated text-subtle' },
  unmeasured: { label: 'Not counted yet', cls: 'bg-surface-elevated text-subtle' },
}

/** A plain count, or a dash when the number was not measured (never a confident zero). */
function count(n: number | null): string {
  return n === null ? '--' : String(n)
}

export function ReachReceipt({
  spaceSlug,
  reach,
  levers,
  placement,
  listed,
  computedAt,
}: {
  spaceSlug: string
  reach: ReachSummary
  /** Every standing signal, weakest first, from `standingLevers`. Empty when standing has not been
   *  computed for this Space yet. */
  levers: readonly StandingLever[]
  /** Where the Space sits in the directory, or null when it is not listed. */
  placement: DirectoryPlacement | null
  /** Whether this Space is listed in the network directory at all. */
  listed: boolean
  /** When the nightly rollup last measured this Space, or null when it has not yet. */
  computedAt: string | null
}) {
  return (
    <div className="space-y-10">
      {/* ── 1. What the network sent ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="reach-sent">
        <SectionHeader id="reach-sent" title={`Your Space page, last ${reach.windowDays} days`} />
        <div data-visual-mask="space-console-profile-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            bordered
            label="Daily page views"
            value={count(reach.profileViews)}
            icon={Eye}
            detail="One per signed-in account per UTC day. Anonymous views share one daily count."
          />
          <StatCard
            bordered
            label="Button taps"
            value={count(reach.ctaClicks)}
            icon={MousePointerClick}
            detail="Recorded taps on your main action, including repeat taps"
          />
          <StatCard bordered label="Followers" value={count(reach.followers)} icon={Heart} detail="People who asked to hear from you" />
          <StatCard bordered label="Members" value={count(reach.members)} icon={Users} detail="People who joined your Space" />
        </div>

        <p className="mt-3 text-meta text-subtle">These counts are not unique visitors or proof that the network brought someone here. A dash means the count is unavailable. Followers and members are current totals, not new joins in this window.</p>

        {/* Placement, said plainly. A number in a list is the honest version of "how visible am I". */}
        <div className="mt-3 rounded-card border border-border bg-surface p-4">
          {listed && placement ? (
            <p className="text-body-sm text-text">
              <Compass className="mr-1.5 -mt-0.5 inline h-4 w-4 text-primary-strong" aria-hidden />
              You are <strong className="font-semibold">number {placement.position} of {placement.total}</strong> in the
              Space directory right now.{' '}
              <Link href="/spaces/directory" className="font-medium text-primary-strong underline-offset-2 hover:underline">
                See the directory
              </Link>
            </p>
          ) : listed ? (
            <p className="text-body-sm text-muted">
              Your Space is listed in the directory. Its position is worked out from the signals below.
            </p>
          ) : (
            <p className="text-body-sm text-muted">
              Your Space is not listed in the network directory. People can still reach it through other links. Turn
              listing on in your Space settings to appear in the directory.
            </p>
          )}
        </div>
      </section>

      {/* ── 2. What would send more ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="reach-more">
        <SectionHeader id="reach-more" title="Signals behind placement" />
        <p className="mb-4 text-body-sm text-muted">
          The directory orders Spaces by these seven things and nothing else. They are listed weakest first, so the top
          of this list is the next thing worth doing.
        </p>

        {levers.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            variant="first-use"
            title="Nothing measured yet."
            description="Your standing is worked out overnight. Check back tomorrow, or run a gathering and open a Circle in the meantime."
          />
        ) : (
          <ol className="space-y-2">
            {levers.map((lever) => {
              const band = BAND_STYLE[lever.band]
              return (
                <li key={lever.signal} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-body-sm font-semibold text-text">{lever.label}</h3>
                    <span className={`rounded-control px-2 py-0.5 text-meta font-medium ${band.cls}`}>{band.label}</span>
                  </div>
                  <p className="mt-1 text-body-sm text-muted">{lever.measures}</p>
                  <p className="mt-2 text-body-sm text-text">{lever.move}</p>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* ── 3. The promise, in writing ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="reach-rules" className="rounded-card border border-border bg-surface-elevated p-5">
        <h2 id="reach-rules" className="text-body-sm font-bold text-text">
          How placement works here
        </h2>
        <ul className="mt-3 space-y-2 text-body-sm text-muted">
          <li>
            <strong className="font-semibold text-text">Placement is earned, and it cannot be bought.</strong> No plan,
            no tier, no ad slot, no payment of any kind moves a Space up this list. The seven signals above are the whole
            formula. A free Space and a paying Space are ranked by exactly the same numbers.
          </li>
          <li>
            <strong className="font-semibold text-text">A Space is judged on what it has, not what it lacks.</strong> A
            signal nobody on the platform can measure yet is left out of the maths rather than counted as a zero, so a
            new Space is never marked down for something that does not exist yet.
          </li>
          <li>
            <strong className="font-semibold text-text">Doing and belonging both count.</strong> Running gatherings for
            nobody, or gathering a following and never opening the doors, both score lower than doing some of each.
          </li>
          <li>
            <strong className="font-semibold text-text">Host-marked attendance counts when measured.</strong> The roster
            records seats you marked present at held gatherings. Marked ticket seats also require a succeeded, unrefunded payment.
            These are attendance records, not unique people across gatherings. Without a complete attendance read,
            this signal is left out of standing. Gatherings held is a separate count of published gatherings that started.
          </li>
        </ul>
        {computedAt && (
          <p className="mt-4 text-meta text-subtle">
            Last worked out {new Date(computedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}. It updates
            overnight.
          </p>
        )}
      </section>

      <p className="text-meta text-subtle">
        Want more of the numbers? Your{' '}
        <Link href={`/spaces/${spaceSlug}/settings/qr`} className="font-medium text-primary-strong underline-offset-2 hover:underline">
          QR codes and scans
        </Link>{' '}
        live beside this page.
      </p>
    </div>
  )
}
