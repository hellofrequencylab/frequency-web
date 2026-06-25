import Link from 'next/link'
import { CalendarPlus, UserPlus, Sprout, CalendarClock, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (/lead, per-route module engine): "What needs you" —
// a short, ranked list of concrete nudges derived from the leader's own circles, in the
// spirit of Vera's admin read (plain, honest, one next move each). Every signal below is
// read live and SCOPED to getLedCircles(me.id) — there is no platform-wide query, and we
// never invent a count: each item only appears when the underlying rows confirm it. The
// block self-hides when there is nothing real to flag.
//
// Signals, most actionable first:
//   1. A circle with 0 upcoming, non-cancelled events   → "Add a gathering" (events)
//   2. A new active member in the last 7 days            → "Welcome them" (memberships)
//   3. A circle still 'forming' with few members         → "Help it find its footing" (circles.status)
//   4. A gathering within 7 days with few 'going' RSVPs  → "Give it a nudge" (events + event_rsvps)

const DAY = 24 * 60 * 60 * 1000
const NEW_MEMBER_WINDOW = 7 * DAY
const EVENT_SOON_WINDOW = 7 * DAY
const FORMING_MEMBER_FLOOR = 5 // a forming circle under this many active members needs help getting going
const LOW_RSVP_FLOOR = 3 // a soon gathering with fewer than this many "going" wants a push
const MAX_ITEMS = 5

type Nudge = {
  key: string
  Icon: LucideIcon
  eyebrow: string
  text: string
  href: string
  /** Lower sorts first — drives the "most important first" ordering. */
  rank: number
}

export async function LeadAttention(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const circles = await getLedCircles(me.id)
  if (circles.length === 0) return null

  const admin = createAdminClient()
  const now = new Date().getTime()
  const nowIso = new Date(now).toISOString()
  const circleIds = circles.map((c) => c.id)
  const byId = new Map(circles.map((c) => [c.id, c]))

  // One scoped sweep: upcoming events in the led circles, and active members who joined
  // this week. Both are filtered to circleIds, so neither is an unscoped read.
  const [{ data: upcomingRows }, { data: newMemberRows }] = await Promise.all([
    admin
      .from('events')
      .select('id, slug, title, scope_id, starts_at')
      .in('scope_id', circleIds)
      .eq('is_cancelled', false)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true }),
    admin
      .from('memberships')
      .select('circle_id, joined_at')
      .in('circle_id', circleIds)
      .eq('status', 'active')
      .gte('joined_at', new Date(now - NEW_MEMBER_WINDOW).toISOString()),
  ])

  const events = (upcomingRows ?? []) as {
    id: string
    slug: string
    title: string
    scope_id: string | null
    starts_at: string
  }[]

  // Per-circle upcoming-event tally (verified rows only).
  const upcomingByCircle = new Map<string, number>()
  for (const e of events) {
    if (e.scope_id) upcomingByCircle.set(e.scope_id, (upcomingByCircle.get(e.scope_id) ?? 0) + 1)
  }

  // New active members this week, tallied per circle.
  const newMembersByCircle = new Map<string, number>()
  for (const m of (newMemberRows ?? []) as { circle_id: string; joined_at: string | null }[]) {
    newMembersByCircle.set(m.circle_id, (newMembersByCircle.get(m.circle_id) ?? 0) + 1)
  }

  // "Going" RSVP counts for the gatherings happening within the next week, so we can
  // surface a soon event that is light on commitments.
  const soonCutoff = now + EVENT_SOON_WINDOW
  const soonEvents = events.filter((e) => new Date(e.starts_at).getTime() <= soonCutoff)
  const goingByEvent = new Map<string, number>()
  if (soonEvents.length > 0) {
    const { data: rsvpRows } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in(
        'event_id',
        soonEvents.map((e) => e.id),
      )
      .eq('status', 'going')
    for (const r of (rsvpRows ?? []) as { event_id: string }[]) {
      goingByEvent.set(r.event_id, (goingByEvent.get(r.event_id) ?? 0) + 1)
    }
  }

  const nudges: Nudge[] = []

  // 1. Circles with nothing on the calendar.
  for (const c of circles) {
    if ((upcomingByCircle.get(c.id) ?? 0) === 0) {
      nudges.push({
        key: `no-events-${c.id}`,
        Icon: CalendarPlus,
        eyebrow: 'Empty calendar',
        text: `${c.name} has nothing on the calendar. Add a gathering so members have a reason to show up.`,
        href: `/circles/${c.slug}`,
        rank: 0,
      })
    }
  }

  // 2. Circles that gained a new member this week.
  for (const [cid, count] of newMembersByCircle) {
    const c = byId.get(cid)
    if (!c) continue
    nudges.push({
      key: `new-member-${cid}`,
      Icon: UserPlus,
      eyebrow: 'New face',
      text:
        count === 1
          ? `Someone new joined ${c.name} this week. Say hello and help them land.`
          : `${count} people joined ${c.name} this week. Welcome them so they stick around.`,
      href: `/circles/${c.slug}`,
      rank: 1,
    })
  }

  // 3. Circles still forming with only a handful of members.
  for (const c of circles) {
    if (c.status === 'forming' && c.member_count < FORMING_MEMBER_FLOOR) {
      nudges.push({
        key: `forming-${c.id}`,
        Icon: Sprout,
        eyebrow: 'Still forming',
        text: `${c.name} is still forming with ${c.member_count} ${c.member_count === 1 ? 'member' : 'members'}. Invite a few people to help it find its footing.`,
        href: `/circles/${c.slug}`,
        rank: 2,
      })
    }
  }

  // 4. A soon gathering that is light on "going" RSVPs.
  for (const e of soonEvents) {
    const going = goingByEvent.get(e.id) ?? 0
    if (going < LOW_RSVP_FLOOR) {
      nudges.push({
        key: `low-rsvp-${e.id}`,
        Icon: CalendarClock,
        eyebrow: 'Coming up',
        text:
          going === 0
            ? `${e.title} is coming up with no RSVPs yet. Give it a nudge in the circle.`
            : `${e.title} is coming up with ${going} going so far. A quick reminder can fill the room.`,
        href: `/events/${e.slug}`,
        rank: 3,
      })
    }
  }

  if (nudges.length === 0) return null

  const items = nudges.sort((a, b) => a.rank - b.rank).slice(0, MAX_ITEMS)

  return (
    <section>
      <SectionHeader title="What needs you" count={items.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((n) => (
          <li key={n.key}>
            <Link
              href={n.href}
              className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <n.Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-semibold uppercase tracking-widest text-primary-strong">
                  {n.eyebrow}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-text">{n.text}</span>
              </span>
              <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
