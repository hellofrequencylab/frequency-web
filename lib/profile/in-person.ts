import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// THE PROFILE'S IN-PERSON NUMBERS (design_handoff/frequency/templates/members/Profile.html: "Check-ins
// this year", "People met in person", the Circles tab's "Since March · 31 check-ins", the Practice
// tab's per-practice counts). Every figure is a count over rows that already exist:
//
//   check-ins      event_rsvps with attended_at set (the host's mark, ADR-1332, the north-star source;
//                  a self-reported "made it" never sets it, LIVE-809)
//   people met     the distinct OTHER members the host marked at the same gatherings
//   circle tenure  memberships.joined_at, and check-ins at events scoped to that Circle
//   practice       completed practice_logs, grouped by practice
//
// Counts only: no names, no events, no places leave this module, so a visitor learns how often a
// member shows up and nothing about where. Fail-safe: a read error is a zero, never a thrown page.

function db() {
  return createAdminClient()
}

function yearStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
}

interface InPersonCounts {
  checkinsThisYear: number
  peopleMet: number
}

export async function getInPersonCounts(profileId: string): Promise<InPersonCounts> {
  try {
    const admin = db()
    const { data: mine } = await admin
      .from('event_rsvps')
      .select('event_id, attended_at')
      .eq('profile_id', profileId)
      .not('attended_at', 'is', null)
      .limit(5000)
    const rows = (mine ?? []) as { event_id: string; attended_at: string }[]
    const since = yearStartIso()
    const checkinsThisYear = rows.filter((r) => r.attended_at >= since).length
    const eventIds = [...new Set(rows.map((r) => r.event_id))]
    if (eventIds.length === 0) return { checkinsThisYear, peopleMet: 0 }

    const met = new Set<string>()
    // Chunked so a long-time regular does not overflow one IN list.
    for (let i = 0; i < eventIds.length; i += 200) {
      const { data: others } = await admin
        .from('event_rsvps')
        .select('profile_id')
        .in('event_id', eventIds.slice(i, i + 200))
        .not('attended_at', 'is', null)
        .not('profile_id', 'is', null)
        .neq('profile_id', profileId)
        .limit(20000)
      for (const o of (others ?? []) as { profile_id: string | null }[]) if (o.profile_id) met.add(o.profile_id)
    }
    return { checkinsThisYear, peopleMet: met.size }
  } catch {
    return { checkinsThisYear: 0, peopleMet: 0 }
  }
}

interface CircleTenure {
  joinedAt: string | null
  checkins: number
}

/** For each listed Circle: when the member joined, and how many of its gatherings they were marked at. */
export async function getCircleTenure(profileId: string, circleIds: string[]): Promise<Map<string, CircleTenure>> {
  const out = new Map<string, CircleTenure>()
  if (circleIds.length === 0) return out
  try {
    const admin = db()
    const [{ data: memberships }, { data: attended }] = await Promise.all([
      admin.from('memberships').select('circle_id, joined_at').eq('profile_id', profileId).in('circle_id', circleIds),
      admin
        .from('event_rsvps')
        .select('event_id')
        .eq('profile_id', profileId)
        .not('attended_at', 'is', null)
        .limit(5000),
    ])
    for (const m of (memberships ?? []) as { circle_id: string; joined_at: string | null }[]) {
      out.set(m.circle_id, { joinedAt: m.joined_at, checkins: 0 })
    }
    const eventIds = [...new Set(((attended ?? []) as { event_id: string }[]).map((r) => r.event_id))]
    for (let i = 0; i < eventIds.length; i += 200) {
      const { data: events } = await admin
        .from('events')
        .select('id, scope_circle_id')
        .in('id', eventIds.slice(i, i + 200))
        .in('scope_circle_id', circleIds)
      for (const e of (events ?? []) as { scope_circle_id: string | null }[]) {
        if (!e.scope_circle_id) continue
        const t = out.get(e.scope_circle_id) ?? { joinedAt: null, checkins: 0 }
        t.checkins += 1
        out.set(e.scope_circle_id, t)
      }
    }
  } catch {
    /* fail-safe: whatever was read */
  }
  return out
}

interface PracticeCount {
  id: string
  title: string
  slug: string | null
  sessions: number
}

/** The member's practices by completed sessions, most first. */
export async function getPracticeCounts(profileId: string, limit = 4): Promise<PracticeCount[]> {
  try {
    const admin = db()
    const { data: logs } = await admin
      .from('practice_logs')
      .select('practice_id')
      .eq('profile_id', profileId)
      .eq('completed', true)
      .not('practice_id', 'is', null)
      .limit(10000)
    const counts = new Map<string, number>()
    for (const l of (logs ?? []) as { practice_id: string | null }[]) {
      if (l.practice_id) counts.set(l.practice_id, (counts.get(l.practice_id) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    if (top.length === 0) return []
    const { data: practices } = await admin
      .from('practices')
      .select('id, title, slug')
      .in(
        'id',
        top.map(([id]) => id),
      )
    const byId = new Map(((practices ?? []) as { id: string; title: string; slug: string | null }[]).map((p) => [p.id, p]))
    return top
      .filter(([id]) => byId.has(id))
      .map(([id, sessions]) => ({ id, title: byId.get(id)!.title, slug: byId.get(id)!.slug, sessions }))
  } catch {
    return []
  }
}

/** "Since March" (this year) or "Since March 2025" (an earlier one). */
export function sinceLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return d.getFullYear() === now.getFullYear() ? `Since ${month}` : `Since ${month} ${d.getFullYear()}`
}
