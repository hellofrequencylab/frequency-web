// The practice lifecycle sweep (ADR-920 Phase 3): the two time-driven moments of the
// commitment model, run hourly by /api/cron/practice-lifecycle.
//
//   1. TERM COMPLETIONS — an active self-adopted row whose ends_on has passed in the
//      MEMBER'S OWN calendar retires with reason 'completed' and gets the completion
//      notice: "N weeks of <practice> complete", with the practice link where "Go again"
//      (re-adopt) and "Keep it going" (ongoing) live. This is the moment the evidence
//      says re-commitment converts, so it is a celebration, never a silent expiry.
//      Journey-sourced rows are NOT swept — their lifecycle is the journey's (Phase 2).
//
//   2. DAILY REMINDERS — members with the `practice` notification category on, at least
//      one active practice still unlogged today, get at most ONE nudge a day, in the
//      hour they usually practice (the mode of their own log hours; the evidence:
//      reminders at the member's own habitual hour outperform fixed sends, and >1/day
//      is churn fuel). In-app always (when inapp_practice), push for opt-ins.
//
// The engine is split PURE (hour derivation, due filters — unit-tested, no I/O) over a
// thin IO sweep. Every send is idempotent per member per local day.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { memberDay } from '@/lib/member-day'
import { sendPushToProfile } from '@/lib/push'
import { getPreferences } from '@/lib/notification-preferences'

// Untyped handle (ADR-246): the term columns (source/ends_on/retired_*) are newer than the
// generated types; regenerate lib/database.types.ts after the migration applies, then drop.
function db(): SupabaseClient {
  return createAdminClient()
}

/** The reminder hour when a member has no log history yet (a morning bias: most
 *  starter practices are morning-shaped, and a 9am nudge is polite everywhere). */
export const DEFAULT_REMINDER_HOUR = 9

/** Max members processed per sweep pass (a runaway guard; the cron runs hourly). */
const SWEEP_CAP = 2000

// ── PURE ────────────────────────────────────────────────────────────────────────────

/** The member's habitual practice hour: the most common local hour across their recent
 *  log timestamps (ties break toward the EARLIER hour — nudge before, not after). Empty
 *  history → DEFAULT_REMINDER_HOUR. `timestamps` are ISO strings; `timezone` the member's
 *  IANA tz (invalid → UTC). PURE. */
export function habitualHour(timestamps: string[], timezone: string | null): number {
  if (!timestamps.length) return DEFAULT_REMINDER_HOUR
  const counts = new Map<number, number>()
  for (const iso of timestamps) {
    const h = localHour(iso, timezone)
    if (h == null) continue
    counts.set(h, (counts.get(h) ?? 0) + 1)
  }
  if (!counts.size) return DEFAULT_REMINDER_HOUR
  let best = DEFAULT_REMINDER_HOUR
  let bestCount = -1
  for (const [h, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (c > bestCount) {
      best = h
      bestCount = c
    }
  }
  return best
}

/** The local hour (0-23) of an ISO instant in a timezone, or null on garbage. PURE. */
export function localHour(iso: string, timezone: string | null): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    const h = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone || 'UTC' })
        .formatToParts(d)
        .find((p) => p.type === 'hour')?.value,
    )
    return Number.isFinite(h) ? h % 24 : null
  } catch {
    return d.getUTCHours()
  }
}

/** Is a term row DUE for completion? ends_on is inclusive, so the completion fires once
 *  the member's own today is PAST it. PURE. */
export function termIsComplete(endsOn: string | null, memberToday: string): boolean {
  return endsOn != null && memberToday > endsOn
}

/** The completion notice copy. Plain voice: name the win, no narrated feelings. */
export function completionBody(title: string, termWeeks: number | null): string {
  const span = termWeeks === 1 ? '1 week' : termWeeks != null ? `${termWeeks} weeks` : 'Your run'
  return termWeeks != null
    ? `${span} of ${title} complete. Go again, or keep it going for good.`
    : `${span} of ${title} is complete. Go again, or keep it going for good.`
}

// ── IO ──────────────────────────────────────────────────────────────────────────────

export interface LifecycleSweepResult {
  completionsRetired: number
  completionNotices: number
  remindersSent: number
  stalePrompts: number
  errors: number
}

/** Days of silence before an ONGOING self adoption earns the one quiet "still keeping this?"
 *  prompt. Two weeks: one missed day is noise (Lally), a fortnight of silence is a real
 *  signal the list is carrying dead weight against the few-held-practices aim. */
export const STALE_AFTER_DAYS = 14

/** One sweep pass. `now` injectable for tests. Never throws. */
export async function runPracticeLifecycleSweep(now: Date = new Date()): Promise<LifecycleSweepResult> {
  const result: LifecycleSweepResult = { completionsRetired: 0, completionNotices: 0, remindersSent: 0, stalePrompts: 0, errors: 0 }
  const admin = db()

  // ── 1. Term completions ─────────────────────────────────────────────────────────
  try {
    // Candidates: active SELF terms whose ends_on is on/before UTC-today. A member west of
    // UTC may still be ON their last day, so each row re-checks against the member's OWN
    // today below (never completes early; a completion fires within a day of local midnight).
    const utcToday = now.toISOString().slice(0, 10)
    const { data: dueRows } = await admin
      .from('member_practices')
      .select('profile_id, practice_id, term_weeks, ends_on, practice:practices(title)')
      .eq('active', true)
      .eq('source', 'self')
      .not('ends_on', 'is', null)
      .lte('ends_on', utcToday)
      .limit(SWEEP_CAP)
    type DueRow = {
      profile_id: string
      practice_id: string
      term_weeks: number | null
      ends_on: string
      practice: { title: string } | null
    }
    const due = ((dueRows ?? []) as unknown as DueRow[])
    if (due.length) {
      const profileIds = [...new Set(due.map((r) => r.profile_id))]
      const { data: tzRows } = await admin.from('profiles').select('id, home_timezone').in('id', profileIds)
      const tzById = new Map(
        ((tzRows ?? []) as { id: string; home_timezone: string | null }[]).map((r) => [r.id, r.home_timezone]),
      )
      for (const row of due) {
        const today = memberDay(tzById.get(row.profile_id), now)
        if (!termIsComplete(row.ends_on, today)) continue
        try {
          const { error: retireErr } = await admin
            .from('member_practices')
            .update({ active: false, retired_at: now.toISOString(), retired_reason: 'completed' } as never)
            .eq('profile_id', row.profile_id)
            .eq('practice_id', row.practice_id)
            .eq('active', true)
          if (retireErr) {
            result.errors++
            continue
          }
          result.completionsRetired++
          // The completion notice rides the `practice` category (in-app default-on).
          const prefs = await getPreferences(row.profile_id)
          const title = row.practice?.title ?? 'Your practice'
          if (prefs.inapp_practice) {
            const { error: noticeErr } = await admin.from('notifications').insert({
              recipient_id: row.profile_id,
              actor_id: null,
              type: 'practice_term_complete',
              reference_type: 'practice',
              reference_id: row.practice_id,
              body: completionBody(title, row.term_weeks),
            })
            if (!noticeErr) result.completionNotices++
          }
          await sendPushToProfile(
            row.profile_id,
            {
              title: 'Practice complete',
              body: completionBody(title, row.term_weeks),
              url: `/practices/${row.practice_id}`,
              tag: `practice-term-${row.profile_id}-${row.practice_id}-${row.ends_on}`,
            },
            'practice',
          ).catch(() => 0)
        } catch {
          result.errors++
        }
      }
    }
  } catch {
    result.errors++
  }

  // ── 2. Daily reminders at the habitual hour ─────────────────────────────────────
  try {
    // Members with at least one ACTIVE practice, batched; the per-member gates below do
    // the narrowing (pref on, unlogged today, right hour, not already nudged today).
    const { data: activeRows } = await admin
      .from('member_practices')
      .select('profile_id')
      .eq('active', true)
      .limit(10000)
    const memberIds = [...new Set(((activeRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id))].slice(
      0,
      SWEEP_CAP,
    )
    if (memberIds.length) {
      const [{ data: tzRows }, { data: recentNudges }] = await Promise.all([
        admin.from('profiles').select('id, home_timezone').in('id', memberIds),
        // One send a day: anything of this type in the last 20h counts as today's.
        admin
          .from('notifications')
          .select('recipient_id')
          .eq('type', 'practice_reminder')
          .gte('created_at', new Date(now.getTime() - 20 * 3600_000).toISOString()),
      ])
      const tzById = new Map(
        ((tzRows ?? []) as { id: string; home_timezone: string | null }[]).map((r) => [r.id, r.home_timezone]),
      )
      const nudgedToday = new Set(
        ((recentNudges ?? []) as { recipient_id: string }[]).map((r) => r.recipient_id),
      )
      for (const profileId of memberIds) {
        try {
          if (nudgedToday.has(profileId)) continue
          const tz = tzById.get(profileId) ?? null
          const today = memberDay(tz, now)
          // The habitual hour, from the member's own recent log instants.
          const { data: logRows } = await admin
            .from('practice_logs')
            .select('created_at')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(30)
          const hour = habitualHour(
            ((logRows ?? []) as { created_at: string }[]).map((r) => r.created_at),
            tz,
          )
          if (localHour(now.toISOString(), tz) !== hour) continue
          // Anything still unlogged today?
          const { data: todayLogs } = await admin
            .from('practice_logs')
            .select('practice_id')
            .eq('profile_id', profileId)
            .eq('logged_for', today)
          const loggedIds = new Set(
            ((todayLogs ?? []) as { practice_id: string | null }[]).map((r) => r.practice_id).filter(Boolean),
          )
          const { data: mineRows } = await admin
            .from('member_practices')
            .select('practice_id, practice:practices(title)')
            .eq('profile_id', profileId)
            .eq('active', true)
          type MineRow = { practice_id: string; practice: { title: string } | null }
          const waiting = ((mineRows ?? []) as unknown as MineRow[]).filter((r) => !loggedIds.has(r.practice_id))
          if (!waiting.length) continue
          const prefs = await getPreferences(profileId)
          if (!prefs.inapp_practice && !prefs.push_practice) continue
          const first = waiting[0].practice?.title ?? 'your practice'
          const body =
            waiting.length === 1
              ? `${first} is still waiting today.`
              : `${first} and ${waiting.length - 1} more are still waiting today.`
          if (prefs.inapp_practice) {
            await admin.from('notifications').insert({
              recipient_id: profileId,
              actor_id: null,
              type: 'practice_reminder',
              reference_type: 'practice',
              reference_id: waiting[0].practice_id,
              body,
            })
          }
          await sendPushToProfile(
            profileId,
            { title: 'Time to practice', body, url: '/on-air', tag: `practice-reminder-${today}` },
            'practice',
          ).catch(() => 0)
          result.remindersSent++
        } catch {
          result.errors++
        }
      }
    }
  } catch {
    result.errors++
  }

  // ── 3. The staleness prompt (ADR-920 Phase 4) ───────────────────────────────────
  // An ONGOING self adoption that has gone STALE_AFTER_DAYS with no log gets ONE quiet
  // "still keeping this?" in-app note — the aim is few, held practices, so dead weight
  // earns a prompt, never an auto-drop. One per (member, practice), ever: the existing
  // notification is the dedupe. Termed rows are excluded (their end is the sweep above);
  // journey rows are excluded (their lifecycle is the journey's).
  try {
    const cutoff = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10)
    const { data: staleCandidates } = await admin
      .from('member_practices')
      .select('profile_id, practice_id, practice:practices(title)')
      .eq('active', true)
      .eq('source', 'self')
      .is('ends_on', null)
      .lte('starts_on', cutoff)
      .limit(SWEEP_CAP)
    type StaleRow = { profile_id: string; practice_id: string; practice: { title: string } | null }
    const candidates = (staleCandidates ?? []) as unknown as StaleRow[]
    for (const row of candidates) {
      try {
        // Any log inside the window clears it.
        const { data: recent } = await admin
          .from('practice_logs')
          .select('id')
          .eq('profile_id', row.profile_id)
          .eq('practice_id', row.practice_id)
          .gte('logged_for', cutoff)
          .limit(1)
        if ((recent ?? []).length) continue
        // One prompt per (member, practice), ever.
        const { data: prior } = await admin
          .from('notifications')
          .select('id')
          .eq('recipient_id', row.profile_id)
          .eq('type', 'practice_stale_check')
          .eq('reference_id', row.practice_id)
          .limit(1)
        if ((prior ?? []).length) continue
        const prefs = await getPreferences(row.profile_id)
        if (!prefs.inapp_practice) continue
        const title = row.practice?.title ?? 'One of your practices'
        await admin.from('notifications').insert({
          recipient_id: row.profile_id,
          actor_id: null,
          type: 'practice_stale_check',
          reference_type: 'practice',
          reference_id: row.practice_id,
          body: `${title} has been quiet for two weeks. Keep it, or set it down to make room.`,
        })
        result.stalePrompts++
      } catch {
        result.errors++
      }
    }
  } catch {
    result.errors++
  }

  return result
}
