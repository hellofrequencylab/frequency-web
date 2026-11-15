process.on('uncaughtException', e => { console.error(e.message); process.exit(1) })
process.on('unhandledRejection', e => { console.error(e.message, e.detail || '', e.where || ''); process.exit(1) })
// Run against isolated PostgreSQL WASM, never a shared Supabase database.
// PGLITE_MODULE may name an externally installed test-only PGlite module.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.role() returns text language sql as $f$ select current_setting('request.jwt.claim.role', true) $f$;
  create table profiles(id uuid primary key, created_at timestamptz, is_system boolean default false, acquisition jsonb, meta jsonb default '{}');
  create table event_rsvps(profile_id uuid, event_id uuid, attended_by uuid, attended_at timestamptz, guest_email text, status text default 'going', approval_status text default 'none');
  create table event_tickets(buyer_profile_id uuid, event_id uuid, attended_by uuid, attended_at timestamptz, guest_email text);
  create table events(id uuid primary key, ends_at timestamptz, is_cancelled boolean default false);
  create table engagement_events(event_type text, created_at timestamptz, idempotency_key text, actor_profile_id uuid);
  create table create_space_drafts(created_at timestamptz);
  create table signup_leads(created_at timestamptz, attribution jsonb default '{}', converted_profile_id uuid, id uuid default gen_random_uuid());
`)
const migration = readFileSync(new URL('../../supabase/migrations/20270346050200_analytics_growth_snapshot.sql', import.meta.url), 'utf8')
await db.exec(migration)
await assert.rejects(db.query('select analytics_growth_snapshot()'), /not authorized/)
await db.exec(`set role anon`)
await assert.rejects(db.query('select analytics_growth_snapshot()'), /permission denied/)
await db.exec(`reset role; select set_config('request.jwt.claim.role', 'service_role', false)`)
const snap = async (days = 30) => (await db.query('select analytics_growth_snapshot($1) as s', [days])).rows[0].s
const empty = await snap()
assert.equal(empty.showingUp, 0)
assert.equal(empty.lastEventAt, null)
assert.deepEqual(empty.weeklyAttendance, Array(8).fill(0))
assert.equal((await snap(900)).windowDays, 90)
assert.equal((await snap(-4)).windowDays, 1)
assert.equal((await snap(null)).windowDays, 30)
await db.exec(`
  insert into profiles(id, created_at, acquisition) select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
    now() - make_interval(days => case i when 1 then 40 when 2 then 20 when 3 then 3 else 10 end),
    '{"source":"email","medium":"newsletter","campaign":"launch"}'::jsonb from generate_series(1,5) i;
  insert into event_rsvps(profile_id, event_id, attended_by, attended_at) select id, ('10000000-0000-0000-0000-' || lpad(row_number() over()::text, 12, '0'))::uuid,
    '99999999-0000-0000-0000-000000000000'::uuid,
    now() - make_interval(days => case right(id::text, 1) when '1' then 35 when '2' then 19 when '3' then 2 else 5 end)
    from profiles where right(id::text,1) <> '5';
  insert into event_rsvps(profile_id, event_id, attended_by, attended_at) select id, '20000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', now() - interval '20 days' from profiles where right(id::text,1)='1';
  insert into event_tickets(buyer_profile_id, event_id, attended_by, attended_at) select profile_id, event_id, attended_by, attended_at + interval '1 minute' from event_rsvps;
  insert into event_rsvps(profile_id, event_id, attended_by, attended_at) select id, '20000000-0000-0000-0000-000000000005', id, now() - interval '1 day' from profiles where right(id::text,1)='5';
  insert into engagement_events(event_type, created_at, idempotency_key) values
    ('createspace.name_started', now()-interval '4 minutes', 'create_space:visitor_no_view_123:createspace.name_started:'),
    ('createspace.name_started', now()-interval '4 minutes', 'create_space:visitor_reversed_1:createspace.name_started:'),
    ('createspace.view', now()-interval '3 minutes', 'create_space:visitor_reversed_1:createspace.view:'),
    ('createspace.view', now()-interval '4 minutes', 'create_space:visitor_valid_123:createspace.view:'),
    ('createspace.name_started', now()-interval '3 minutes', 'create_space:visitor_valid_123:createspace.name_started:'),
    ('createspace.accent_picked', now()-interval '2 minutes', 'create_space:visitor_valid_123:createspace.accent_picked:'),
    ('createspace.offer', now()-interval '1 minute', 'create_space:visitor_valid_123:createspace.offer:'),
    ('createspace.lead', now()-interval '30 seconds', 'create_space:visitor_valid_123:createspace.lead:');
  insert into events select event_id, min(attended_at), false from event_rsvps group by event_id;
  insert into create_space_drafts values (now()-interval '1 day');
  insert into signup_leads(created_at, attribution, converted_profile_id) values (now()-interval '10 days', '{"first_touch":{"utm":{"source":"email","medium":"newsletter","campaign":"launch"}}}', '00000000-0000-0000-0000-000000000004');
`)
const d = await snap()
assert.equal(d.showingUp, 2, 'self marks excluded; duplicate seats deduplicated')
assert.equal(d.weeklyAttendance.at(-1), 2)
assert.equal(d.repeatEligible, 1)
assert.equal(d.repeatReturned, 1, 'repeat must be a different event')
assert.equal(d.campaigns.length, 1)
assert.equal(d.campaigns[0].signups, 4)
assert.equal(d.campaigns[0].eligible, 3)
assert.equal(d.campaigns[0].pending, 1)
assert.equal(d.campaigns[0].activated, 2, 'pending signup excluded from seven-day rate')
assert.equal(d.savedDrafts, 1)
assert.equal(d.builderPendingVisits, 2)
assert.ok(d.builder.every(s => s.matureVisits === 0), 'recent visitors still need seven-day follow-up')
assert.equal(d.measurement.signupEventsExpected, 4)
assert.equal(d.measurement.signupEventsObserved, 0)
assert.equal(d.measurement.leadEventsExpected, 1)
assert.equal(d.measurement.leadEventsObserved, 0)
assert.equal(d.rsvpEligible, 5)
assert.equal(d.rsvpAttended, 4)
assert.ok(d.timeToFirstMedianHours > 0)
assert.equal(d.leadCampaigns[0].leads, 1)
assert.equal(d.leadCampaigns[0].attended, 1)
assert.deepEqual(d.builder.map(s => s.visits), [2,1,1,1,1,0], 'out of order and missing view cannot inflate cohort')
assert.ok(!JSON.stringify(d).includes('00000000-0000'), 'no member IDs in aggregate export')
// Host re-marking updates evidence time; gathering occurrence cohorts must remain stable.
await db.exec(`update event_rsvps set attended_at = now()-interval '1 hour' where attended_by <> profile_id;
  update event_tickets set attended_at = now()-interval '1 hour' where attended_by <> buyer_profile_id;`)
const remarked = await snap()
for (const key of ['showingUp', 'previousShowingUp', 'repeatEligible', 'repeatReturned', 'firstAttendanceObserved', 'timeToFirstMedianHours', 'timeToFirstP90Hours', 'weeklyAttendance', 'campaigns', 'leadCampaigns']) {
  assert.deepEqual(remarked[key], d[key], `host re-mark cannot shift ${key}`)
}

await db.exec(`
  insert into events values ('30000000-0000-0000-0000-000000000001', now()-interval '1 day', false);
  insert into event_rsvps(profile_id, event_id, attended_by, attended_at, guest_email) values
    (null, '30000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', now()-interval '1 day', 'Guest@Example.com');
  insert into event_tickets(buyer_profile_id, event_id, attended_by, attended_at, guest_email) values
    (null, '30000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', now()-interval '1 day', 'guest@example.com');
  update events set is_cancelled = true where id = '10000000-0000-0000-0000-000000000002';
`)
const changed = await snap()
assert.equal(changed.guestsShowingUp, 1, 'guest email case and duplicate seat cannot inflate unique guests')
assert.equal(changed.showingUp, 2, 'guests do not inflate Member attendance')
assert.equal(changed.rsvpEligible, 4, 'cancelled events excluded from RSVP denominator')
assert.equal(changed.rsvpAttended, 3)
await db.exec(`
  insert into engagement_events(event_type, created_at, idempotency_key, actor_profile_id)
    values ('account.created', now()-interval '1 minute', 'account.created:one', '00000000-0000-0000-0000-000000000002');
  insert into engagement_events(event_type, created_at, idempotency_key)
    select 'lead.captured', now()-interval '1 minute', 'lead.captured:' || id::text from signup_leads;
  insert into engagement_events(event_type, created_at, idempotency_key)
    values ('nav.page_view', now()+interval '10 minutes', 'future-event');
`)
await db.exec(`
  insert into engagement_events(event_type, created_at, idempotency_key)
    select 'createspace.' || marker, now() - make_interval(days => age_days),
      'create_space:mature_visitor_123:createspace.' || marker || ':'
    from (values ('view', 9), ('name_started', 8), ('accent_picked', 7), ('offer', 6), ('lead', 5), ('photos', 1)) as steps(marker, age_days);
`)
const coverage = await snap()
assert.equal(coverage.builderPendingVisits, 2)
assert.deepEqual(coverage.builder.map(s => s.matureVisits), [1,1,1,1,1,0], 'mature visits count in order; late outcomes outside seven days do not count')
assert.equal(coverage.measurement.signupEventsObserved, 1)
assert.equal(coverage.measurement.leadEventsObserved, 1)
assert.equal(coverage.measurement.futureEventRows, 1)
assert.ok(coverage.recentEvents.every(e => e.latest < coverage.computedAt), 'future events never enter current activity')
await db.exec('set role authenticated')
await assert.rejects(db.query('select analytics_growth_snapshot()'), /permission denied/)
await db.exec('reset role')
console.log('Growth SQL integration: passed (empty, clamps, role denial, self-marks, dedupe, mature cohorts, ordered steps, no identity export)')
await db.close()
