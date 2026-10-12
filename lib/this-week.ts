// "This week in <region>" (LIVE-806, ADR-1720 workstream 9): the pure half of the Thursday email.
//
// The Sunday digest (lib/digest.ts) is per member and shows the Events a member already said yes
// to. This email is per REGION: every public Event coming up in the next seven days in a seeded
// nexus_region, sent to every member whose home region that is. Nothing here reads a database;
// app/api/cron/this-week/route.ts gathers the rows through lib/this-week-reads.ts and feeds them
// in, so the window, the grouping, the subject and both renderings are unit-tested with no
// Supabase import (lib/this-week.test.ts).
//
// THE REGION MATCH. An Event carries `scope_region_id` (migration 20260829000000, the H1-1 typed
// scope arc): the trigger `trg_events_sync_scope_arc` sets it to the nexus_region whenever
// `scope_type = 'public'`, and the column is a real FK to nexus_regions with a partial index. A
// member carries `profiles.nexus_region_id`, the region picked at onboarding Step 3 and read by
// `get_my_region_id()` in every regional RLS clause. So the match is an id equality, not a text
// match on `events.city` against the seeded names: the city column is free text a host typed
// ("Carlsbad Village", "Oside", blank), while the two ids are the same seeded row on both sides.
// The free-text city stays what it is, the "where" line of the Event, and never decides who is
// told about it.

import { eventInstant, resolveZone, zoneAbbrev } from '@/lib/time/zone'

/** The look-ahead: the next seven days from the moment the cron runs. */
const THIS_WEEK_WINDOW_DAYS = 7

/** The most Events one region's email lists. A region with more is a region with a calendar page;
 *  the button at the foot of the email leads there. */
const THIS_WEEK_MAX_EVENTS_PER_REGION = 8

/** The widest real UTC offset any IANA zone reaches. `starts_at` stores the Event's wall-clock as
 *  UTC parts (lib/time/zone.ts), so a database band on it must be this much wider than the real
 *  window on each side, and the precise cut is made here through `eventInstant`. */
const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000

export interface ThisWeekRegion {
  id: string
  name: string
  slug: string
}

/** One `events` row as the reads module selects it. Column names, not camelCase, on purpose: this
 *  is the shape the database answers with and the test builds the same way. */
export interface ThisWeekEventRow {
  id: string
  slug: string
  title: string
  starts_at: string | null
  time_zone: string | null
  location: string | null
  venue_name: string | null
  city: string | null
  scope_region_id: string | null
}

/** One Event as the email renders it. */
export interface ThisWeekEvent {
  id: string
  title: string
  /** The stored wall-clock ISO (UTC parts), kept so the renderer can label it with the zone. */
  startsAt: string
  timeZone: string | null
  /** The one-line "where": venue, else location, else city. Null when the host gave none. */
  where: string | null
  url: string
}

export interface ThisWeekRegionBundle {
  region: ThisWeekRegion
  events: ThisWeekEvent[]
}

/** ISO-8601 week label (`2026-W41`) for the Monday-based week containing `at`. Pure, UTC. The same
 *  arithmetic the weekly digest uses; a Thursday run and the following Sunday's digest are in one
 *  ISO week, which is fine, because the two crons claim under different prefixes. */
function isoWeekOf(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The idempotency key for one member's "This week in" email in one ISO week (the SCAN-611
 *  lesson: a re-fired run must find the claim, not the member's inbox). */
export function thisWeekDedupeKey(profileId: string, at: Date): string {
  return `this-week:${profileId}:${isoWeekOf(at)}`
}

/** The real window: [now, now + 7 days]. */
function thisWeekWindow(now: Date): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + THIS_WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000) }
}

/** The database band on `starts_at` that is guaranteed to contain every row in the real window,
 *  whatever zone the Event is in. Wider than the window by MAX_TZ_OFFSET_MS on each side. */
export function thisWeekQueryBand(now: Date): { fromIso: string; toIso: string } {
  const { from, to } = thisWeekWindow(now)
  return {
    fromIso: new Date(from.getTime() - MAX_TZ_OFFSET_MS).toISOString(),
    toIso: new Date(to.getTime() + MAX_TZ_OFFSET_MS).toISOString(),
  }
}

/** The true instant an Event starts, or null when the row has no usable start. */
function startInstant(row: ThisWeekEventRow): number | null {
  const inst = eventInstant(row.starts_at, row.time_zone)
  return inst ? inst.getTime() : null
}

/** Pure: the rows whose true start falls inside the window and that belong to a region. The order
 *  is by true start, earliest first. Rows without a start, without a region, or outside the window
 *  are dropped, including the ones the widened SQL band let through. */
function selectUpcomingEvents(rows: readonly ThisWeekEventRow[], now: Date): ThisWeekEventRow[] {
  const { from, to } = thisWeekWindow(now)
  return rows
    .map((row) => ({ row, at: startInstant(row) }))
    .filter((x): x is { row: ThisWeekEventRow; at: number } => x.at !== null && !!x.row.scope_region_id)
    .filter((x) => x.at >= from.getTime() && x.at <= to.getTime())
    .sort((a, b) => a.at - b.at || a.row.id.localeCompare(b.row.id))
    .map((x) => x.row)
}

/** The "where" line: the venue a host named, else the free-text location, else the city. */
function eventWhere(row: Pick<ThisWeekEventRow, 'venue_name' | 'location' | 'city'>): string | null {
  for (const v of [row.venue_name, row.location, row.city]) {
    const s = (v ?? '').trim()
    if (s) return s
  }
  return null
}

/**
 * Pure: group the selected rows by region. ONLY regions with at least one Event come back, so a
 * caller that iterates the result sends nothing for an empty region, by construction. A row whose
 * region id is not in `regions` (a region deleted after the Event was scoped) is dropped.
 */
export function groupEventsByRegion(
  regions: readonly ThisWeekRegion[],
  rows: readonly ThisWeekEventRow[],
  opts: { now: Date; baseUrl: string; maxPerRegion?: number },
): ThisWeekRegionBundle[] {
  const max = opts.maxPerRegion ?? THIS_WEEK_MAX_EVENTS_PER_REGION
  const byId = new Map(regions.map((r) => [r.id, r]))
  const buckets = new Map<string, ThisWeekEvent[]>()
  for (const row of selectUpcomingEvents(rows, opts.now)) {
    const regionId = row.scope_region_id as string
    if (!byId.has(regionId)) continue
    const list = buckets.get(regionId) ?? []
    if (list.length >= max) continue
    list.push({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at as string,
      timeZone: row.time_zone,
      where: eventWhere(row),
      url: `${opts.baseUrl}/events/${row.slug}`,
    })
    buckets.set(regionId, list)
  }
  return regions
    .filter((r) => (buckets.get(r.id)?.length ?? 0) > 0)
    .map((r) => ({ region: r, events: buckets.get(r.id) as ThisWeekEvent[] }))
}

/** The subject line, exactly. */
function thisWeekSubject(regionName: string): string {
  return `This week in ${regionName}`
}

/** `Thu Oct 15 · 7:00 PM PDT`: the stored UTC parts read back as the Event's own wall-clock, then
 *  labelled with the Event's zone. The same shape as the reminder emails' when-line. */
function formatThisWeekWhen(startsAt: string, timeZone: string | null): string {
  const d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(startsAt.trim()) ? startsAt.trim() : `${startsAt.trim()}Z`)
  if (Number.isNaN(d.getTime())) return ''
  // Assembled from parts, not from the locale string: ICU's punctuation ("Sat, Oct 17, 7:00 AM"
  // today, "at" on some versions) is not ours to depend on.
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).formatToParts(d)
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? ''
  const base = `${p('weekday')} ${p('month')} ${p('day')} · ${p('hour')}:${p('minute')} ${p('dayPeriod')}`.replace(/\s+/g, ' ').trim()
  const abbr = zoneAbbrev(startsAt, resolveZone(timeZone))
  return abbr ? `${base} ${abbr}` : base
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface RenderThisWeekInput {
  regionName: string
  recipientName: string
  events: readonly ThisWeekEvent[]
  baseUrl: string
  unsubscribeUrl: string
}

interface RenderedThisWeek {
  subject: string
  /** The CARD BODY only. The sender wraps it in `emailShell` (lib/email.ts) so it carries the
   *  wordmark, the footer and the postal line like every other Frequency email. */
  bodyHtml: string
  text: string
}

/**
 * Pure: the subject, the card body and the plain-text twin for one region's email. Voice per
 * docs/CONTENT-VOICE.md: plain, warm, the counselor you actually respect, no em dashes. Every
 * host-typed string is escaped; the links are ours.
 */
export function renderThisWeek(input: RenderThisWeekInput): RenderedThisWeek {
  const { regionName, recipientName, events, baseUrl, unsubscribeUrl } = input
  const subject = thisWeekSubject(regionName)
  const count = events.length
  const lead =
    count === 1
      ? `One gathering is on the calendar near you this week. Go if you can.`
      : `${count} gatherings are on the calendar near you this week. Pick one and show up.`
  const calendarUrl = `${baseUrl}/discover/events`

  const rowsHtml = events
    .map(
      (e) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E9E1D4;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D352A;">${escapeHtml(e.title)}</p>
            <p style="margin:0;font-size:13px;color:#777;">
              ${escapeHtml(formatThisWeekWhen(e.startsAt, e.timeZone))}${e.where ? ` · ${escapeHtml(e.where)}` : ''}
            </p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #E9E1D4;text-align:right;">
            <a href="${e.url}" style="font-size:13px;font-weight:600;color:#9A5E12;text-decoration:none;">Go</a>
          </td>
        </tr>`,
    )
    .join('')

  const bodyHtml = `
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9A5E12;margin:28px 0 8px;">
      ${escapeHtml(subject)}
    </p>
    <h1 style="font-size:24px;font-weight:800;color:#3D352A;margin:22px 0 12px;line-height:1.25;">Hi ${escapeHtml(recipientName)},</h1>
    <p style="font-size:15px;color:#6B6253;line-height:1.65;margin:0 0 20px;">${escapeHtml(lead)}</p>
    <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${rowsHtml}
    </table>
    <p style="margin:26px 0 0;">
      <a href="${calendarUrl}" style="display:inline-block;background:#E2912F;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;">See the whole calendar</a>
    </p>
    <hr style="border:none;border-top:1px solid #E9E1D4;margin:26px 0;">
    <p style="font-size:13px;color:#8F8675;">
      You get this on Thursdays because ${escapeHtml(regionName)} is your home region on Frequency.
      <a href="${baseUrl}/settings/notifications" style="color:#8F8675;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from weekly emails</a>.
    </p>
  `

  const lines: string[] = [`${subject}`, '', `Hi ${recipientName}, ${lead}`, '']
  for (const e of events) {
    lines.push(`  · ${e.title}, ${formatThisWeekWhen(e.startsAt, e.timeZone)}${e.where ? ` · ${e.where}` : ''}`)
    lines.push(`    ${e.url}`)
  }
  lines.push('')
  lines.push(`See the whole calendar: ${calendarUrl}`)
  lines.push('')
  lines.push(`You get this on Thursdays because ${regionName} is your home region on Frequency.`)
  lines.push(`Manage preferences: ${baseUrl}/settings/notifications`)
  lines.push(`Unsubscribe from weekly emails: ${unsubscribeUrl}`)

  return { subject, bodyHtml, text: lines.join('\n') + '\n' }
}
