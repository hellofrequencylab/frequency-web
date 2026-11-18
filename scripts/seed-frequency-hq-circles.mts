// Seed Frequency HQ's Creator Lab circles and calls (owner brief, 2026-11-17). Pure: every export
// returns data or a SQL string; nothing here touches a database. Print the seed with
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types \
//     scripts/seed-frequency-hq-circles.mts --sql > /tmp/hq-circles.sql
//
// and the owner applies that ONE transaction by hand. Idempotent: every row has a deterministic id
// (md5 of a key) or a natural key (slug), every write is an upsert, and every update is guarded so it
// only lands on rows that belong to Frequency HQ (spaces.id below, owned by @frequency).
//
// Shapes are copied from the product's own writers, not invented:
//   · circles + circle_profiles + host membership: lib/circles/draft.ts createBlankCircleDraft
//     (memberships upsert on (profile_id, circle_id), status 'active', volunteer_role 'host') and
//     app/(main)/admin/actions.ts createCircle. circles.member_count is NOT written by hand: the
//     trg_memberships_member_count trigger maintains it on every membership insert/status change.
//   · Circle privacy: lib/circles/visibility.ts (ADR-1015). Axis 1 `unlisted`, axis 2 `access`.
//   · A Space event: app/(main)/events/actions.ts createEvent + scripts/seed-wildheart.mts sqlEventInsert
//     (scope_type 'public' + the host's nexus region, else the topmost region; space_id + host_space_id).
//   · A circle event: lib/events/placement.ts livePlacementPatch (scope_type 'circle', scope_id =
//     scope_circle_id = the circle, space_id = the circle's Space) and seed-the-group placement().
//   · Recurrence: lib/event-recurrence.ts INHERITED_COLUMNS + occurrenceRow (slug = anchor slug + day,
//     parent_event_id = anchor, recurrence 'none', every inherited column copied from the anchor).
//   · Times: lib/time/zone.ts (LIVE-905) stores the host's WALL CLOCK as UTC parts, read in time_zone.
//
// ADR-1938: a Space has no built-in Circle. Both circles here are topic circles under HQ's space_id.
// No video link is invented: online_url stays null; the Zoom link goes to registered members by hand.
// Copy obeys docs/CONTENT-VOICE.md: no em dashes, no emoji.

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// ── Fixed ids (read from production on 2026-11-17) ─────────────────────────────────────────────
export const SPACE_ID = '9e17060e-63ca-6dcc-abc1-8fa9edb280e7' // Frequency HQ, slug 'hq'
export const SPACE_SLUG = 'hq'
export const FREQUENCY_ID = '78d47bae-c4c8-4d1c-80a0-ac69aaf98ef8' // @frequency, the house account, HQ's owner
export const DANIEL_ID = 'c1d40f58-318b-4c7b-a331-21788d632fc9' // @danieltyack
export const TZ = 'America/Los_Angeles'

/** A deterministic uuid from a key, so a re-run hits the same rows. */
export function uuidFrom(key: string): string {
  const h = createHash('md5').update(`frequency-hq:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** A wall-clock date + time as the stored ISO: the parts kept literally, in UTC (LIVE-905). */
export function ptIso(date: string, time: string): string {
  return `${date}T${time}:00.000Z`
}

const ZOOM_NOTE = 'Zoom link sent to registered members.'

// ── Circles ────────────────────────────────────────────────────────────────────────────────────
export interface SeedCircle {
  id: string
  slug: string
  name: string
  about: string
  hostId: string
  memberCap: number
  /** circles.access (circles_access_check). */
  access: 'open' | 'invite'
  /** circles.unlisted: axis 1, discovery. */
  unlisted: boolean
  meetup: { text: string; length: string }
}

export const DECEMBER_START: SeedCircle = {
  id: uuidFrom('circle:creator-lab-december-start'),
  slug: 'creator-lab-december-start',
  name: 'Creator Lab · December Start',
  about:
    'Everyone starting The Business of Community this month moves through it together. One week at a time, a short practice, and a thread to share what you tried.',
  hostId: FREQUENCY_ID,
  memberCap: 50,
  access: 'open',
  unlisted: false,
  meetup: { text: 'Online · one week at a time', length: '' },
}

export const PILOT_COHORT: SeedCircle = {
  id: uuidFrom('circle:business-of-community-pilot'),
  slug: 'business-of-community-pilot',
  name: 'The Business of Community · Pilot Cohort',
  about:
    'The first live cohort of The Business of Community 101: 8 to 12 Space owners, four weekly 2.5-hour Zoom workshops, ending in the Certified capstone.',
  hostId: DANIEL_ID,
  memberCap: 12,
  // Invite-only door (lib/circles/visibility.ts: 'invite' refuses a self-join, 'invite-only').
  // Kept LISTED so the name, host and about show in discovery while the roster and posts stay shut.
  access: 'invite',
  unlisted: false,
  meetup: { text: 'Thursdays · 10 AM Pacific · 2.5 hours', length: '2.5 hours' },
}

export const CIRCLES: SeedCircle[] = [DECEMBER_START, PILOT_COHORT]

/** Both house profiles are seated as hosts of both circles (createBlankCircleDraft's membership shape). */
export const CIRCLE_HOSTS = [FREQUENCY_ID, DANIEL_ID]

// ── Events ─────────────────────────────────────────────────────────────────────────────────────
export interface SeedEvent {
  slug: string
  title: string
  description: string
  date: string
  start: string
  end: string
  hostId: string
  /** null = a Space event of HQ; otherwise the circle it lives in. */
  circleId: string | null
  visibility: 'public' | 'unlisted' | 'circle_only' | 'private'
  recurrence?: { type: 'weekly'; rule: string }
}

export const BUSINESS_HOURS_ANCHOR = '2026-11-24' // a Tuesday
export const BUSINESS_HOURS_RULE = 'FREQ=WEEKLY;BYDAY=TU'
export const BUSINESS_HOURS_THROUGH = '2027-02-23'

/** Every Tuesday after the anchor through BUSINESS_HOURS_THROUGH (the anchor itself is its own row,
 *  as generateOccurrencesForAnchor mints them with includeAnchor false). */
export function businessHoursOccurrences(): string[] {
  const out: string[] = []
  const d = new Date(`${BUSINESS_HOURS_ANCHOR}T00:00:00Z`)
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 7)
    const day = d.toISOString().slice(0, 10)
    if (day > BUSINESS_HOURS_THROUGH) break
    out.push(day)
  }
  return out
}

export const BUSINESS_HOURS: SeedEvent = {
  slug: `hq-business-hours-${BUSINESS_HOURS_ANCHOR}`,
  title: 'Business Hours',
  // The owner's words, verbatim. The Zoom note rides details.specialInstructions (the event's notes field).
  description:
    "A weekly hour for paid Space owners. Bring one number and one stuck thing. The room (5 min): who's new, who shipped. Commitments (10 min): last week's if-then, read back out loud. Hot seat (20 min): one operator, a real problem, their own screen. Work block (15 min): everyone does the one thing. Commit (10 min): each person writes and says one if-then for next week. Same hour every week, on Zoom. Paid Space owners are invited by hand while we pilot it.",
  date: BUSINESS_HOURS_ANCHOR,
  start: '10:00',
  end: '11:00',
  hostId: FREQUENCY_ID,
  circleId: null,
  // 'unlisted': link-reachable, never broadcast to the calendar or discovery. circle_only is not
  // valid on a Space event (coerceVisibilityForScope steps it down to unlisted anyway), and
  // 'private' is the guest-card / host-only shape (lib/events/guests.ts), which would hide it from
  // the very owners who get the link by hand.
  visibility: 'unlisted',
  recurrence: { type: 'weekly', rule: BUSINESS_HOURS_RULE },
}

export const PILOT_SESSIONS: SeedEvent[] = [
  { n: 1, name: 'The Engine', date: '2026-12-03' },
  { n: 2, name: 'The Container', date: '2026-12-10' },
  { n: 3, name: 'The Gathering', date: '2026-12-17' },
  { n: 4, name: 'The Exchange', date: '2027-01-07' },
].map(({ n, name, date }) => ({
  slug: `business-of-community-pilot-session-${n}`,
  title: `The Business of Community · Week ${n} · ${name}`,
  description: `Week ${n} of 4 · The Business of Community 101 pilot cohort · a 2.5-hour live workshop on Zoom.`,
  date,
  start: '10:00',
  end: '12:30',
  hostId: DANIEL_ID,
  circleId: PILOT_COHORT.id,
  // Only the cohort sees its calls (the RLS circle_only branch keys on scope_type 'circle').
  visibility: 'circle_only' as const,
}))

// ── SQL ────────────────────────────────────────────────────────────────────────────────────────
const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`)
const qj = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`
const pt = (date: string, time: string) => `timestamptz '${date} ${time}+00'`

export function sqlCircleUpsert(c: SeedCircle): string {
  return [
    `insert into circles (id, name, slug, about, type, member_cap, member_count, status, host_id, space_id, primary_pillar, timezone, access, unlisted)`,
    `values (${q(c.id)}, ${q(c.name)}, ${q(c.slug)}, ${q(c.about)}, 'online', ${c.memberCap}, 0, 'active', ${q(c.hostId)}, ${q(SPACE_ID)}, 'mind', ${q(TZ)}, ${q(c.access)}, ${c.unlisted})`,
    // member_count is left alone on a re-run: the membership trigger owns it.
    `on conflict (id) do update set name = excluded.name, slug = excluded.slug, about = excluded.about, type = excluded.type, member_cap = excluded.member_cap, status = excluded.status, host_id = excluded.host_id, primary_pillar = excluded.primary_pillar, timezone = excluded.timezone, access = excluded.access, unlisted = excluded.unlisted`,
    `where circles.space_id = ${q(SPACE_ID)};`,
    `insert into circle_profiles (circle_id, meetup) values (${q(c.id)}, ${qj(c.meetup)})`,
    `on conflict (circle_id) do update set meetup = excluded.meetup, updated_at = now();`,
  ].join('\n')
}

export function sqlHostMemberships(c: SeedCircle): string {
  return [
    `insert into memberships (profile_id, circle_id, status, volunteer_role)`,
    `select p.id, ${q(c.id)}, 'active', 'host' from (values ${CIRCLE_HOSTS.map((id) => `(${q(id)}::uuid)`).join(', ')}) as p(id)`,
    `where exists (select 1 from circles where id = ${q(c.id)} and space_id = ${q(SPACE_ID)})`,
    `on conflict (profile_id, circle_id) do update set status = 'active', volunteer_role = 'host';`,
  ].join('\n')
}

export function sqlEventUpsert(e: SeedEvent): string {
  const scopeId = e.circleId ? q(e.circleId) : '(select region_id from _hq)'
  const scopeType = e.circleId ? 'circle' : 'public'
  const scopeCircle = e.circleId ? q(e.circleId) : 'null'
  return `insert into events (slug, title, description, host_id, scope_id, scope_type, scope_circle_id, starts_at, ends_at, time_zone, location, details, visibility, status, published_at, join_mode, category, energy_tag, attendance_mode, online_url, source, space_id, host_space_id, recurrence_type, recurrence_rule, is_cancelled)
values (${q(e.slug)}, ${q(e.title)}, ${q(e.description)}, ${q(e.hostId)}, ${scopeId}, ${q(scopeType)}, ${scopeCircle}, ${pt(e.date, e.start)}, ${pt(e.date, e.end)}, ${q(TZ)}, 'Online · Zoom', ${qj({ specialInstructions: ZOOM_NOTE })}, ${q(e.visibility)}, 'published', now(), 'rsvp', 'learning', null, 'online', null, 'manual', ${q(SPACE_ID)}, ${q(SPACE_ID)}, ${q(e.recurrence?.type ?? 'none')}, ${q(e.recurrence?.rule ?? null)}, false)
on conflict (slug) do update set title = excluded.title, description = excluded.description, host_id = excluded.host_id, scope_id = excluded.scope_id, scope_type = excluded.scope_type, scope_circle_id = excluded.scope_circle_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at, time_zone = excluded.time_zone, location = excluded.location, details = events.details || excluded.details, visibility = excluded.visibility, status = excluded.status, published_at = coalesce(events.published_at, excluded.published_at), join_mode = excluded.join_mode, category = excluded.category, attendance_mode = excluded.attendance_mode, space_id = excluded.space_id, host_space_id = excluded.host_space_id, recurrence_type = excluded.recurrence_type, recurrence_rule = excluded.recurrence_rule
where events.space_id = ${q(SPACE_ID)};`
}

/** The occurrences the cron would mint (lib/event-recurrence.ts occurrenceRow): every INHERITED_COLUMNS
 *  value copied from the anchor, duplicates ignored on slug so an edited occurrence is never touched. */
export function sqlOccurrencesInsert(anchor: SeedEvent, days: string[]): string {
  return [
    'insert into events (slug, parent_event_id, starts_at, ends_at, recurrence_type, recurrence_until, recurrence_rule, is_cancelled,',
    '  title, description, host_id, scope_id, scope_type, location, visibility, status, published_at, price_cents, currency, capacity, venmo_handle, join_mode,',
    '  category, energy_tag, time_zone, cover_image_path, gallery_image_paths, poster_path, theme, details, space_id, host_space_id, domain_id,',
    '  attendance_mode, online_url, venue_name, street, city, region, country, postal_code, geog, hide_address, journey_id, source, is_demo,',
    '  posted_by_profile_id, organizer_name, organizer_contact)',
    `select a.slug || '-' || d.day, a.id, (d.day || ' ${anchor.start}+00')::timestamptz, (d.day || ' ${anchor.end}+00')::timestamptz, 'none', null, null, false,`,
    '  a.title, a.description, a.host_id, a.scope_id, a.scope_type, a.location, a.visibility, a.status, a.published_at, a.price_cents, a.currency, a.capacity, a.venmo_handle, a.join_mode,',
    '  a.category, a.energy_tag, a.time_zone, a.cover_image_path, a.gallery_image_paths, a.poster_path, a.theme, a.details, a.space_id, a.host_space_id, a.domain_id,',
    '  a.attendance_mode, a.online_url, a.venue_name, a.street, a.city, a.region, a.country, a.postal_code, a.geog, a.hide_address, a.journey_id, a.source, a.is_demo,',
    '  a.posted_by_profile_id, a.organizer_name, a.organizer_contact',
    `from events a cross join (values ${days.map((d) => `(${q(d)})`).join(', ')}) as d(day)`,
    `where a.slug = ${q(anchor.slug)} and a.space_id = ${q(SPACE_ID)}`,
    'on conflict (slug) do nothing;',
  ].join('\n')
}

export function renderCirclesSql(): string {
  const days = businessHoursOccurrences()
  const L: string[] = []
  const p = (...lines: string[]) => L.push(...lines)
  p(
    '-- Frequency HQ: Creator Lab circles, Business Hours and the pilot cohort calls.',
    '-- GENERATED from scripts/seed-frequency-hq-circles.mts. Edit the .mts, then regenerate.',
    '-- ONE transaction. Idempotent: deterministic ids / slugs, upserts guarded to HQ rows only.',
    '-- No video link is set (online_url null): the Zoom link goes to registered members by hand.',
    '',
    'begin;',
    '',
    '-- The region a Space event is scoped to (lib/events/event-drafts.ts resolveRegionScopeId):',
    "-- the host profile's nexus region, else the topmost region. @frequency has none today.",
    'create temp table _hq on commit drop as',
    `select coalesce((select nexus_region_id from profiles where id = ${q(FREQUENCY_ID)}),`,
    '                (select id from nexus_regions where parent_id is null order by depth asc, id asc limit 1)) as region_id;',
    '',
    '-- Guard: HQ must be the Space this seed was written for, still owned by @frequency, and both',
    '-- profiles must exist. A seeded slug held by a row outside HQ aborts instead of being overwritten.',
    'do $guard$ begin',
    `  if not exists (select 1 from spaces where id = ${q(SPACE_ID)} and slug = ${q(SPACE_SLUG)} and owner_profile_id = ${q(FREQUENCY_ID)}) then`,
    `    raise exception 'seed-frequency-hq-circles: spaces.id ${SPACE_ID} is not Frequency HQ owned by @frequency; nothing written';`,
    '  end if;',
    `  if (select count(*) from profiles where id in (${q(FREQUENCY_ID)}, ${q(DANIEL_ID)})) <> 2 then`,
    `    raise exception 'seed-frequency-hq-circles: a host profile is missing; nothing written';`,
    '  end if;',
    `  if exists (select 1 from circles where slug in (${CIRCLES.map((c) => q(c.slug)).join(', ')}) and space_id is distinct from ${q(SPACE_ID)}) then`,
    `    raise exception 'seed-frequency-hq-circles: a circle slug belongs to another Space; nothing written';`,
    '  end if;',
    `  if exists (select 1 from events where (slug = ${q(BUSINESS_HOURS.slug)} or slug like ${q(BUSINESS_HOURS.slug + '-%')} or slug like 'business-of-community-pilot-session-%') and space_id is distinct from ${q(SPACE_ID)}) then`,
    `    raise exception 'seed-frequency-hq-circles: an event slug belongs to another Space; nothing written';`,
    '  end if;',
    'end $guard$;',
    '',
    '-- 1. Circles: topic circles under HQ (ADR-1938), online, active. December Start is open to anyone;',
    '--    the Pilot Cohort is invite-only (access invite) but listed. Meetup lines on circle_profiles.',
    ...CIRCLES.map(sqlCircleUpsert),
    '',
    '-- 2. Hosts: @frequency and @danieltyack seated in both circles (createBlankCircleDraft shape).',
    '--    member_count follows from trg_memberships_member_count; it is not written by hand.',
    ...CIRCLES.map(sqlHostMemberships),
    '',
    `-- 3. Business Hours: a Space event of HQ, weekly Tuesdays 10:00 to 11:00 PT (${BUSINESS_HOURS_RULE}),`,
    `--    anchor ${BUSINESS_HOURS_ANCHOR}, unlisted (paid owners get the link by hand).`,
    sqlEventUpsert(BUSINESS_HOURS),
    '',
    `--    Occurrences ${days[0]} through ${days[days.length - 1]} (${days.length} Tuesdays), as occurrenceRow mints them.`,
    '--    The daily cron rolls the window forward from here and dedupes on the per-day slug.',
    sqlOccurrencesInsert(BUSINESS_HOURS, days),
    '',
    '-- 4. The four pilot calls, circle events of the Pilot Cohort (livePlacementPatch shape),',
    '--    Thursdays 10:00 AM to 12:30 PM PT (2.5 hours), circle_only.',
    ...PILOT_SESSIONS.map(sqlEventUpsert),
    '',
    `-- VERIFY: select slug, type, access, unlisted, member_cap, member_count, host_id from circles where space_id = '${SPACE_ID}' order by slug;`,
    '-- EXPECT: business-of-community-pilot | online | invite | f | 12 | 2   and   creator-lab-december-start | online | open | f | 50 | 2',
    `-- VERIFY: select count(*) total, count(*) filter (where recurrence_type <> 'none') anchors, count(*) filter (where parent_event_id is not null) occurrences, count(*) filter (where scope_type = 'circle' and scope_circle_id is not null) circle_events from events where space_id = '${SPACE_ID}';`,
    `-- EXPECT: ${1 + days.length + PILOT_SESSIONS.length} | 1 | ${days.length} | ${PILOT_SESSIONS.length}`,
    '',
    'commit;',
  )
  return L.join('\n') + '\n'
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false
if (isMain) process.stdout.write(renderCirclesSql())
