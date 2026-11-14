// Isolated PostgreSQL fixture integration. Never connects to shared Supabase.
process.on('uncaughtException', (e) => { console.error(e.message); process.exit(1) })
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const { readFileSync } = await import('node:fs')
const { default: assert } = await import('node:assert/strict')
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.role() returns text language sql as $f$ select current_setting('request.jwt.claim.role', true) $f$;
  create table profiles(id uuid primary key);
  create table consent_records(profile_id uuid, scope text, granted boolean);
  insert into profiles values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20270346046500_analytics_experiments.sql', import.meta.url), 'utf8'))
await assert.rejects(db.query('select analytics_experiment_results()'), /not authorized/)
await db.exec('set role anon')
await assert.rejects(db.query('select * from analytics_experiment_assignments'), /permission denied/)
await assert.rejects(db.query('select analytics_experiment_results()'), /permission denied/)
await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false)")
const person = '00000000-0000-0000-0000-000000000001'
const second = '00000000-0000-0000-0000-000000000002'
const manage = async (command) => (await db.query("select analytics_experiment_manage('upcoming-next-step',$1,$2) as id", [command, person])).rows[0].id
const assign = async (p = person) => (await db.query("select analytics_experiment_assign('upcoming-next-step',$1) as a", [p])).rows[0].a
assert.equal(await assign(), null)
const id = await manage('draft')
assert.equal(await assign(), null, 'drafts do not allocate traffic')
await db.exec("update analytics_experiments set status='running',started_at=null")
assert.equal(await assign(), null, 'a malformed running row without a start time must fail closed')
await db.exec("update analytics_experiments set status='running',started_at=now()+interval '1 day'")
assert.equal(await assign(), null, 'a future start cannot allocate traffic early')
await db.exec("update analytics_experiments set status='draft',started_at=null")
await manage('start')
const a = await assign()
assert.deepEqual(await assign(), a, 'assignment stable across reads')
await db.query("select analytics_experiment_outcome('event.rsvp',$1)", [person])
let rows = (await db.query('select * from analytics_experiment_assignments')).rows
assert.equal(rows[0].converted_at, null, 'no conversion without exposure')
await db.query('select analytics_experiment_expose($1,$2)', [id,person])
const exposure = (await db.query('select exposed_at from analytics_experiment_assignments')).rows[0].exposed_at
await db.query('select analytics_experiment_expose($1,$2)', [id,person])
assert.deepEqual((await db.query('select exposed_at from analytics_experiment_assignments')).rows[0].exposed_at, exposure, 'exposure is idempotent')
await db.query("select analytics_experiment_outcome('nav.page_view',$1)", [person])
assert.equal((await db.query('select converted_at from analytics_experiment_assignments')).rows[0].converted_at, null)
await db.query("select analytics_experiment_outcome('event.rsvp',$1)", [person])
assert.ok((await db.query('select converted_at from analytics_experiment_assignments')).rows[0].converted_at)
await manage('pause')
assert.deepEqual(await assign(), a, 'pause preserves exposed treatment through follow-up')
assert.equal(await assign(second), null, 'pause blocks new participants')
await assert.rejects(manage('finish'), /minimum enrollment period incomplete/)
await db.exec("update analytics_experiments set started_at=now()-interval '8 days'; update analytics_experiment_assignments set exposed_at=now()-interval '2 days',converted_at=now()-interval '1 day'")
await manage('start')
assert.equal(await assign(second), null, 'fixed deadline blocks new enrollment even before operator closes the record')
await manage('finish')
assert.deepEqual(await assign(), a, 'closed enrollment preserves exposed follow-up')
assert.equal(await assign(second), null)
const results = (await db.query('select analytics_experiment_results() as r')).rows[0].r
assert.equal(results[0][a.variant].pending, 1)
assert.equal(results[0][a.variant].eligible, 0)
assert.ok(!JSON.stringify(results).includes(person), 'aggregate results never expose member identities')
await db.query("insert into consent_records values($1,'analytics',false)", [person])
assert.equal((await db.query('select count(*) as n from analytics_experiment_assignments')).rows[0].n, 0, 'withdrawal deletes experiment membership')
const afterWithdrawal = (await db.query('select analytics_experiment_results() as r')).rows[0].r
assert.equal(afterWithdrawal[0][a.variant].excluded, 1, 'anonymous attrition remains after membership deletion')
await db.query("insert into analytics_experiment_assignments(experiment_id,profile_id,variant,exposed_at) values($1,$2,'control',now()-interval '1 day')", [id,second])
await db.query('delete from profiles where id=$1', [second])
const afterDeletion = (await db.query('select analytics_experiment_results() as r')).rows[0].r[0]
assert.equal(afterDeletion.control.excluded + afterDeletion.treatment.excluded, 2, 'account deletion preserves only anonymous attrition totals')
await db.close()
console.log('Experiment SQL integration passed: role denial, draft isolation, stable assignment, visible exposure seam, authoritative outcomes, paused follow-up, fixed horizon, consent withdrawal, aggregate privacy.')
