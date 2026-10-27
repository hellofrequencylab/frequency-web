import path from 'node:path'
import { pathToFileURL } from 'node:url'
const modulePath = process.env.PGLITE_MODULE
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error('Set PGLITE_MODULE to an existing trusted absolute PGlite module path; no dependency is installed automatically')
const { PGlite } = await import(pathToFileURL(modulePath).href)
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const root = process.argv[2]
if (!root) throw new Error('Pass the isolated proposal checkout')
const db = new PGlite(); const checks = []
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
async function refused(sql, args, code) {
  let error
  try { await db.query(sql, args) } catch (e) { error = e }
  assert.equal(error?.code, code, error?.message ?? 'Expected refusal')
}
async function check(name, action) { await action(); checks.push(name) }
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_user::text$$;
    create table public.profiles(id uuid primary key,auth_user_id uuid unique);
    create publication supabase_realtime;`)
  await db.exec(readFileSync(root + '/supabase/migrations/20240130000000_rooms.sql', 'utf8'))
  const pins = readFileSync(root + '/supabase/migrations/20260612010000_pin_function_search_paths.sql', 'utf8').split('\n').filter(line => /ALTER FUNCTION public\.rooms_(maintain_member_count|touch_last_message)\(\)/i.test(line)).join('\n')
  assert.equal(pins.split('\n').length, 2)
  await db.exec(pins)
  await db.exec(`alter table public.rooms drop constraint rooms_visibility_check;
    alter table public.rooms add constraint rooms_visibility_check check(visibility in ('public','private','circle','hub','nexus','outpost','channel'));
    alter table public.rooms alter column creator_id drop not null;
    alter table public.rooms add constraint rooms_creator_required_check check(visibility='channel' or creator_id is not null);
    grant usage on schema public to anon,authenticated,service_role;
    grant select,insert,update,delete on public.rooms,public.room_members,public.room_messages to service_role;
    grant select on public.profiles to service_role;`)
  for (let n = 1; n <= 6; n++) await db.query('insert into public.profiles values($1,$1)', [id(n)])
  await db.exec(`create function public.test_reject_creator() returns trigger language plpgsql as $$
    begin if new.profile_id='${id(5)}'::uuid then raise exception 'forced membership failure' using errcode='23514'; end if;return new;end;$$;
    create trigger test_reject_creator before insert on public.room_members for each row execute function public.test_reject_creator();`)
  await check('Original independent insert schedule leaves an orphan when membership fails', async () => {
    const room = await scalar("insert into public.rooms(name,creator_id) values('baseline orphan',$1) returning id", [id(5)])
    await refused('insert into public.room_members(room_id,profile_id,is_admin)values($1,$2,true)', [room,id(5)], '23514')
    assert.equal(await scalar('select count(*)::int from public.rooms where id=$1',[room]),1)
    await db.query('delete from public.rooms where id=$1',[room])
  })
  await check('Original stale-count schedule can demote both admins without parallel-session proof', async () => {
    const room = await scalar("insert into public.rooms(name,creator_id)values('baseline count race',$1)returning id",[id(1)])
    await db.query('insert into public.room_members(room_id,profile_id,is_admin)values($1,$2,true),($1,$3,true)',[room,id(1),id(2)])
    const first = await scalar('select count(*)::int from public.room_members where room_id=$1 and is_admin',[room])
    const second = await scalar('select count(*)::int from public.room_members where room_id=$1 and is_admin',[room])
    assert.equal(first,2);assert.equal(second,2)
    await db.query('update public.room_members set is_admin=false where room_id=$1 and profile_id=$2',[room,id(1)])
    await db.query('update public.room_members set is_admin=false where room_id=$1 and profile_id=$2',[room,id(2)])
    assert.equal(await scalar('select count(*)::int from public.room_members where room_id=$1 and is_admin',[room]),0)
    await db.query('delete from public.rooms where id=$1',[room])
  })
  const triggersBefore = await scalar("select count(*)::int from pg_trigger where tgrelid='public.room_members'::regclass and not tgisinternal")
  await db.exec(readFileSync(root + '/docs/database/room-atomic-proposal.sql','utf8'))
  await check('Proposal adds no trigger and preserves account/profile cascade policy',async()=>assert.equal(await scalar("select count(*)::int from pg_trigger where tgrelid='public.room_members'::regclass and not tgisinternal"),triggersBefore))
  await check('All three RPCs are invoker with pinned empty search paths and service-only grants', async () => {
    const rows=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'execute') as anon,has_function_privilege('authenticated',oid,'execute') as authenticated,has_function_privilege('service_role',oid,'execute') as service from pg_proc where pronamespace='public'::regnamespace and proname in ('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')")).rows
    assert.equal(rows.length,3)
    for(const row of rows){assert.equal(row.prosecdef,false);assert.ok(row.proconfig.includes('search_path=""'));assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true)}
  })
  await check('Anonymous and authenticated direct RPC calls are refused', async()=>{
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await refused('select public.room_create_atomic($1,$2,null,$3)',[id(1),'No','public'],'42501');await db.exec('reset role')}
  })
  await db.exec('set role service_role')
  await check('Atomic creation rolls back the room if creator membership fails',async()=>{
    await refused('select public.room_create_atomic($1,$2,null,$3)',[id(5),'atomic forced failure','private'],'23514')
    assert.equal(await scalar("select count(*)::int from public.rooms where name='atomic forced failure'"),0)
  })
  let room
  await check('Atomic creation includes creator admin, trims fields and preserves private visibility', async()=>{
    room=await scalar('select public.room_create_atomic($1,$2,$3,$4)',[id(1),'  Neighbors  ','  Notes  ','private'])
    const row=(await db.query('select name,description,visibility,scope_id,member_count from public.rooms where id=$1',[room])).rows[0]
    assert.deepEqual(row,{name:'Neighbors',description:'Notes',visibility:'private',scope_id:null,member_count:1})
    assert.equal(await scalar('select is_admin from public.room_members where room_id=$1 and profile_id=$2',[room,id(1)]),true)
  })
  await check('Missing actor and scoped room minting are refused',async()=>{
    await refused('select public.room_create_atomic($1,$2,null,$3)',[id(99),'No','public'],'42501')
    await refused('select public.room_create_atomic($1,$2,null,$3)',[id(1),'No','circle'],'22023')
  })
  await db.query('insert into public.room_members(room_id,profile_id,is_admin)values($1,$2,false),($1,$3,false)',[room,id(2),id(3)])
  await check('Unrelated and ordinary members cannot grant room admin',async()=>{
    for(const actor of [id(6),id(3)])await refused('select public.room_set_member_admin_atomic($1,$2,$3,true)',[actor,room,id(2)],'42501')
  })
  await check('Admin grant and self demotion retain one admin; stale former-admin authority is rejected',async()=>{
    assert.equal(await scalar('select public.room_set_member_admin_atomic($1,$2,$3,true)',[id(1),room,id(2)]),true)
    assert.equal(await scalar('select public.room_set_member_admin_atomic($1,$2,$3,false)',[id(1),room,id(1)]),true)
    await refused('select public.room_set_member_admin_atomic($1,$2,$3,false)',[id(1),room,id(2)],'42501')
  })
  await check('Manual last-admin demotion, leave and kick are refused',async()=>{
    await refused('select public.room_set_member_admin_atomic($1,$2,$3,false)',[id(2),room,id(2)],'23514')
    await refused('select public.room_remove_member_atomic($1,$2,$3)',[id(2),room,id(2)],'23514')
    assert.equal(await scalar('select count(*)::int from public.room_members where room_id=$1 and is_admin',[room]),1)
  })
  await check('A non-admin can leave self but cannot kick another member',async()=>{
    await refused('select public.room_remove_member_atomic($1,$2,$3)',[id(3),room,id(1)],'42501')
    assert.equal(await scalar('select public.room_remove_member_atomic($1,$2,$3)',[id(3),room,id(3)]),true)
  })
  await check('An admin can remove an ordinary member; unknown targets fail explicitly',async()=>{
    assert.equal(await scalar('select public.room_remove_member_atomic($1,$2,$3)',[id(2),room,id(1)]),true)
    await refused('select public.room_remove_member_atomic($1,$2,$3)',[id(2),room,id(99)],'P0002')
  })
  await check('Deleting a room still cascades its last admin normally',async()=>{
    await db.query('delete from public.rooms where id=$1',[room]);assert.equal(await scalar('select count(*)::int from public.room_members where room_id=$1',[room]),0)
  })
  await db.exec('reset role')
  await check('Profile deletion semantics are unchanged, including outside-manual-action admin loss',async()=>{
    const r=await scalar('select public.room_create_atomic($1,$2,null,$3)',[id(1),'profile cascade remains unchanged','private'])
    await db.query('insert into public.room_members(room_id,profile_id,is_admin)values($1,$2,true)',[r,id(2)])
    await db.query('select public.room_set_member_admin_atomic($1,$2,$3,false)',[id(1),r,id(1)])
    await db.query('delete from public.profiles where id=$1',[id(2)])
    assert.equal(await scalar('select count(*)::int from public.rooms where id=$1',[r]),1)
    assert.equal(await scalar('select count(*)::int from public.room_members where room_id=$1 and is_admin',[r]),0)
    await db.query('delete from public.profiles where id=$1',[id(1)])
    assert.equal(await scalar('select count(*)::int from public.rooms where id=$1',[r]),0)
  })
  const receipt={engine:'Existing task-owned PGlite0.5.11 embedded PostgreSQL',schema:'Actual20240130000000_rooms.sql with minimal profiles/auth harness plus current channel creator/visibility constraints; not full Supabase replay',checks,passed:checks.length,concurrency:'NOT verified with independent sessions; baseline stale-count schedule is interleaved sequential queries. Real two-session staging proof required before activation.',scope:'Manual create/admin-role/remove RPCs only. No trigger; profile/account and direct maintenance deletions unchanged. No production writes; proposal not registered/applied.'}
  if (process.env.ROOM_ATOMIC_RECEIPT_FILE) writeFileSync(process.env.ROOM_ATOMIC_RECEIPT_FILE,JSON.stringify(receipt,null,2)+'\n')
  console.log(JSON.stringify(receipt,null,2))
}finally{await db.close()}
