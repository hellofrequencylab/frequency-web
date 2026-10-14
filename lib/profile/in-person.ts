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
// member shows up and nothing about where. Fail-safe: a read error is a zero, never a thrown page,
// and it logs a tagged line so the zero is noticed (AGENTS.md: every fail-safe needs a signal).
//
// PAGED. A select without `.range()` is capped at PostgREST's `max_rows` (1000, supabase/config.toml
// and hosted alike) whatever `.limit()` asks for, so a member past 1000 check-ins or logs read short.
// Every full-history read below goes through `readAll`.

function db() {
  return createAdminClient()
}

function note(section: string, error: unknown): void {
  if (!error) return
  const detail = typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
  console.error(`[profile-in-person] ${section} read failed; that figure degraded:`, detail)
}

/** PostgREST's `max_rows`; a short page is an unambiguous end of data. */
const PAGE = 1000
/** At most this many pages (50,000 rows): a profile figure is never worth an unbounded scan. */
const MAX_PAGES = 50

/** Every row of an ORDERED query, page by page. A refused page logs and ends the read with what it has. */
async function readAll<T>(
  section: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1)
    if (error) {
      note(section, error)
      break
    }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
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
    const rows = await readAll<{ event_id: string; attended_at: string }>('my check-ins', (from, to) =>
      admin
        .from('event_rsvps')
        .select('event_id, attended_at')
        .eq('profile_id', profileId)
        .not('attended_at', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    )
    const since = yearStartIso()
    const checkinsThisYear = rows.filter((r) => r.attended_at >= since).length
    const eventIds = [...new Set(rows.map((r) => r.event_id))]
    if (eventIds.length === 0) return { checkinsThisYear, peopleMet: 0 }

    const met = new Set<string>()
    // Chunked so a long-time regular does not overflow one IN list.
    for (let i = 0; i < eventIds.length; i += 200) {
      const batch = eventIds.slice(i, i + 200)
      const others = await readAll<{ profile_id: string | null }>('people met', (from, to) =>
        admin
          .from('event_rsvps')
          .select('profile_id')
          .in('event_id', batch)
          .not('attended_at', 'is', null)
          .not('profile_id', 'is', null)
          .neq('profile_id', profileId)
          .order('id', { ascending: true })
          .range(from, to),
      )
      for (const o of others) if (o.profile_id) met.add(o.profile_id)
    }
    return { checkinsThisYear, peopleMet: met.size }
  } catch (e) {
    note('in-person counts', e)
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
    const [{ data: memberships, error: membershipsError }, attended] = await Promise.all([
      admin.from('memberships').select('circle_id, joined_at').eq('profile_id', profileId).in('circle_id', circleIds),
      readAll<{ event_id: string }>('circle check-ins', (from, to) =>
        admin
          .from('event_rsvps')
          .select('event_id')
          .eq('profile_id', profileId)
          .not('attended_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ])
    note('circle memberships', membershipsError)
    for (const m of (memberships ?? []) as { circle_id: string; joined_at: string | null }[]) {
      out.set(m.circle_id, { joinedAt: m.joined_at, checkins: 0 })
    }
    const eventIds = [...new Set(attended.map((r) => r.event_id))]
    for (let i = 0; i < eventIds.length; i += 200) {
      const { data: events, error } = await admin
        .from('events')
        .select('id, scope_circle_id')
        .in('id', eventIds.slice(i, i + 200))
        .in('scope_circle_id', circleIds)
      note('circle events', error)
      for (const e of (events ?? []) as { scope_circle_id: string | null }[]) {
        if (!e.scope_circle_id) continue
        const t = out.get(e.scope_circle_id) ?? { joinedAt: null, checkins: 0 }
        t.checkins += 1
        out.set(e.scope_circle_id, t)
      }
    }
  } catch (e) {
    note('circle tenure', e) // fail-safe: whatever was read
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
    const logs = await readAll<{ practice_id: string | null }>('practice logs', (from, to) =>
      admin
        .from('practice_logs')
        .select('practice_id')
        .eq('profile_id', profileId)
        .eq('completed', true)
        .not('practice_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    )
    const counts = new Map<string, number>()
    for (const l of logs) {
      if (l.practice_id) counts.set(l.practice_id, (counts.get(l.practice_id) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    if (top.length === 0) return []
    const { data: practices, error } = await admin
      .from('practices')
      .select('id, title, slug')
      .in(
        'id',
        top.map(([id]) => id),
      )
    note('practices', error)
    const byId = new Map(((practices ?? []) as { id: string; title: string; slug: string | null }[]).map((p) => [p.id, p]))
    return top
      .filter(([id]) => byId.has(id))
      .map(([id, sessions]) => ({ id, title: byId.get(id)!.title, slug: byId.get(id)!.slug, sessions }))
  } catch (e) {
    note('practice counts', e)
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
