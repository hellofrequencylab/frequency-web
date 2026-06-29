import Link from 'next/link'
import { Flame, UserPlus, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (/lead): "People to celebrate" — a short, ranked list
// of members IN THE LEADER'S OWN CIRCLES who are worth a thank-you or a promotion, tying
// the work of leading back to the Quest. Self-fetching RSC scoped to the caller via
// getCallerProfile + getLedCircles(me.id); there is no platform-wide read. Every signal is
// read live and confirmed by real rows — we never invent a number, and the block self-hides
// when nothing real surfaces.
//
// Signals, each verified against the schema, most notable first:
//   1. A strong current practice streak (profiles.current_streak ≥ STREAK_FLOOR, the "Week"
//      milestone) → "on a long streak" → say thanks. This is the headline Quest streak owned
//      by lib/practice-streak.ts (docs/THE-QUEST.md).
//   2. Brought new people in (profiles.referred_by_profile_id pointing at this member — the
//      referral attribution column, lib/referral/stats.ts) → "brought people in" → consider
//      promoting.
// Both are read straight from profiles, scoped to the active members of the led circles.

const STREAK_FLOOR = 7 // the "Week" streak milestone (lib/streak.ts STREAK_MILESTONES) — a real run worth noting
const MAX_ITEMS = 5

type Honoree = {
  key: string
  Icon: LucideIcon
  name: string
  handle: string
  eyebrow: string
  /** The plain reason, e.g. "on a 24 day practice streak". */
  reason: string
  /** The nudge to the leader, e.g. "Say thanks." */
  hint: string
  /** Drives sort: higher is more notable. */
  score: number
}

export async function LeadRecognition(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const circles = await getLedCircles(me.id)
  if (circles.length === 0) return null

  const admin = createAdminClient()
  const circleIds = circles.map((c) => c.id)

  // The active members of the led circles. Scoped to circleIds, so this is not an unscoped read.
  const { data: memberRows } = await admin
    .from('memberships')
    .select('profile_id')
    .in('circle_id', circleIds)
    .eq('status', 'active')

  // De-dupe across circles (a member can belong to more than one) and drop the leader's own row.
  const memberIds = [
    ...new Set(
      ((memberRows ?? []) as { profile_id: string }[]).map((m) => m.profile_id),
    ),
  ].filter((id) => id !== me.id)
  if (memberIds.length === 0) return null

  // Two scoped reads against profiles, both keyed to the member ids above:
  //   • the members themselves (identity + current streak),
  //   • who THEY referred in (referred_by_profile_id pointing back at a member).
  const [{ data: profileRows }, { data: referralRows }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, handle, current_streak')
      .in('id', memberIds),
    admin
      .from('profiles')
      .select('referred_by_profile_id')
      .in('referred_by_profile_id', memberIds),
  ])

  const profiles = (profileRows ?? []) as {
    id: string
    display_name: string
    handle: string
    current_streak: number
  }[]

  // Referral tally per member (how many people each member brought in), verified rows only.
  const referralsBy = new Map<string, number>()
  for (const r of (referralRows ?? []) as { referred_by_profile_id: string | null }[]) {
    if (r.referred_by_profile_id) {
      referralsBy.set(
        r.referred_by_profile_id,
        (referralsBy.get(r.referred_by_profile_id) ?? 0) + 1,
      )
    }
  }

  const honorees: Honoree[] = []
  for (const p of profiles) {
    const streak = p.current_streak ?? 0
    const referrals = referralsBy.get(p.id) ?? 0

    // 1. A strong current practice streak — say thanks for keeping the rhythm.
    if (streak >= STREAK_FLOOR) {
      honorees.push({
        key: `streak-${p.id}`,
        Icon: Flame,
        name: p.display_name,
        handle: p.handle,
        eyebrow: 'On a streak',
        reason: `on a ${streak} day practice streak`,
        hint: 'Say thanks for keeping the rhythm going.',
        // Longer streaks sort first; kept well clear of the referral band below.
        score: 1000 + streak,
      })
    }

    // 2. Brought new people in — the kind of member worth promoting.
    if (referrals >= 1) {
      honorees.push({
        key: `referrals-${p.id}`,
        Icon: UserPlus,
        name: p.display_name,
        handle: p.handle,
        eyebrow: 'Brought people in',
        reason:
          referrals === 1
            ? 'brought a new person in'
            : `brought ${referrals} new people in`,
        hint: 'Consider giving them a bigger role.',
        // More invites sort first, and an invite tops a bare streak.
        score: 2000 + referrals,
      })
    }
  }

  if (honorees.length === 0) return null

  const items = honorees.sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS)

  return (
    <section>
      <SectionHeader title="People to celebrate" count={items.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((h) => (
          <li key={h.key}>
            <Link
              href={`/people/${h.handle}`}
              className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <h.Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-semibold uppercase tracking-widest text-primary-strong">
                  {h.eyebrow}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-text">
                  <span className="font-semibold">{h.name}</span> is {h.reason}. {h.hint}
                </span>
              </span>
              <ArrowRight
                className="mt-1 hidden h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 sm:block"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
