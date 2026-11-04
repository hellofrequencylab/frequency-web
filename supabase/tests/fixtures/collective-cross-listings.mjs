// Isolated-engine fixture: minimal canonical table shapes, actual migration body.
// Not a production seed and not a claim of multi-connection concurrency.
import assert from 'node:assert/strict'
export async function exerciseCollectiveCrossListingSql(db,migrationSql,canonicalOwnerFk=false){
let checks=0
const check=(value)=>{assert.ok(value);checks++}
const refuses=async sql=>{let failed=false;try{await db.exec(sql)}catch{failed=true}check(failed)}
await db.exec(`create role anon;create role authenticated;create role service_role;
create table profiles(id uuid primary key);
create table spaces(id uuid primary key,owner_profile_id uuid ${canonicalOwnerFk?'references profiles(id) on delete set null':''},plan text,status text check(status in ('active','suspended','archived')),visibility text,parent_id uuid,type text default 'business');
create table journey_plans(id uuid primary key,space_id uuid,title text,slug text,status text,visibility text,created_at timestamptz);
create table circles(id uuid primary key,space_id uuid,name text,slug text,status text,unlisted boolean,is_space_primary boolean,created_at timestamptz);`)
await db.exec(migrationSql)
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const source=id(1),target=id(2),other=id(3),owner=id(4),receiver=id(5),nextOwner=id(6),journey=id(7),circle=id(8)
await db.exec(`insert into profiles values('${owner}'),('${receiver}'),('${nextOwner}');
insert into spaces(id,owner_profile_id,plan,status,visibility,parent_id) values('${source}','${owner}','collective','active','network',null),('${target}','${receiver}','collective','active','network',null),('${other}','${nextOwner}','collective','active','network',null);
insert into journey_plans values('${journey}','${source}','Original journey','journey','approved','public',now());
insert into circles values('${circle}','${source}','Original Circle','circle','active',false,false,now());`)
const request=async(kind='journey')=>{await db.exec(`insert into collective_cross_listings(${kind}_id,source_space_id,space_id,requested_by) values('${kind==='journey'?journey:circle}','${source}','${target}','${owner}')`)}
const accept=async()=>{await db.exec(`update collective_cross_listings set status='accepted',responded_by='${receiver}' where status='pending'`)}
const read=async(kind='journey',pending=false)=>(await db.query(`select * from read_collective_cross_listings('${kind}','${target}',${pending})`)).rows
await request();check((await read()).length===0);check((await read('journey',true)).length===1)
await refuses(`update collective_cross_listings set status='accepted',responded_by='${owner}' where status='pending'`)
await accept();check((await read())[0].subject.space_id===source)
await db.exec(`update spaces set owner_profile_id='${nextOwner}' where id='${source}';update spaces set owner_profile_id='${owner}' where id='${source}';`)
check((await read()).length===0);check((await db.query(`select status from collective_cross_listings`)).rows[0].status==='revoked')
await request();await accept();await db.exec(`update journey_plans set space_id='${other}' where id='${journey}';update journey_plans set space_id='${source}' where id='${journey}'`);check((await read()).length===0)
await request();await accept();await db.exec(`update spaces set visibility='private' where id='${source}'`);check((await read()).length===0);check((await read('journey',true)).length===0)
await db.exec(`update spaces set visibility='network' where id='${source}';update journey_plans set status='rejected' where id='${journey}'`);check((await read()).length===0)
await db.exec(`update journey_plans set status='approved' where id='${journey}';update spaces set plan='free' where id='${target}'`);check((await read()).length===0)
await db.exec(`update collective_cross_listings set status='revoked' where status='accepted';update spaces set status='active',plan='collective' where id='${target}'`)
await request('circle');await accept();check((await read('circle')).length===1)
await db.exec(`update circles set unlisted=true where id='${circle}'`);check((await read('circle')).length===0)
await db.exec(`update circles set unlisted=false,space_id='${other}' where id='${circle}';update circles set space_id='${source}' where id='${circle}'`);check((await read('circle')).length===0)
await request('circle');await db.exec(`update spaces set owner_profile_id='${nextOwner}' where id='${target}'`);await refuses(`update collective_cross_listings set status='accepted',responded_by='${receiver}' where circle_id='${circle}'`)
for(const role of ['anon','authenticated'])check(!(await db.query(`select has_function_privilege('${role}','public.read_collective_cross_listings(text,uuid,boolean)','EXECUTE') allowed`)).rows[0].allowed)
await db.exec(`update spaces set owner_profile_id='${receiver}' where id='${target}';update circles set space_id='${other}' where id='${circle}'`)
await refuses(`insert into collective_cross_listings(circle_id,source_space_id,space_id,requested_by) values('${circle}','${source}','${target}','${owner}')`)
await db.exec(`update circles set space_id='${source}' where id='${circle}';update spaces set visibility='private' where id='${source}'`)
await refuses(`insert into collective_cross_listings(circle_id,source_space_id,space_id,requested_by) values('${circle}','${source}','${target}','${owner}')`)
await db.exec(`update spaces set visibility='network' where id='${source}'`)
await refuses(`insert into collective_cross_listings(circle_id,source_space_id,space_id,requested_by,status,responded_by) values('${circle}','${source}','${target}','${owner}','accepted','${receiver}')`)
await request('circle')
await refuses(`update collective_cross_listings set source_space_id='${other}' where status='pending'`)
// Profile FK nulling must work in both pending and accepted states, without
// relying on whether the canonical Space-owner FK was processed first.
await request('journey')
await db.exec(`update collective_cross_listings set status='accepted',responded_by='${receiver}' where journey_id='${journey}' and status='pending'`)
await db.exec(`delete from profiles where id='${owner}'`)
check((await db.query(`select count(*)::int n from collective_cross_listings where status in ('pending','accepted')`)).rows[0].n===0)
check((await db.query(`select count(*)::int n from collective_cross_listings where requested_by is not null`)).rows[0].n===0)
await db.exec(`insert into profiles values('${owner}');update spaces set owner_profile_id='${owner}' where id='${source}'`)
await request('circle');await accept()
await db.exec(`delete from profiles where id='${receiver}'`)
check((await read('circle')).length===0)
check((await db.query(`select status,responded_by from collective_cross_listings where requested_by='${owner}' order by created_at desc limit 1`)).rows[0].status==='revoked')
check((await db.query(`select count(*)::int n from collective_cross_listings where responded_by is not null`)).rows[0].n===0)
// Pending requests have no receiver identity yet; they remain harmless and
// cannot accept with a deleted receiver FK (even under stale Space-owner data).
await db.exec(`insert into profiles values('${receiver}');update spaces set owner_profile_id='${receiver}' where id='${target}'`)
await request('circle')
const pendingId=(await db.query(`select id from collective_cross_listings where status='pending'`)).rows[0].id
await db.exec(`delete from profiles where id='${receiver}'`)
await refuses(`update collective_cross_listings set status='accepted',responded_by='${receiver}' where id='${pendingId}'`)
await db.exec(`insert into profiles values('${receiver}');update spaces set owner_profile_id='${receiver}' where id='${target}';update collective_cross_listings set status='revoked' where status in ('pending','accepted');update spaces set owner_profile_id='${owner}' where id='${other}';update spaces set plan='free',parent_id='${other}' where id='${source}'`)
await request('journey');await accept();check((await read()).length===1)
await db.exec(`update spaces set status='archived' where id='${other}'`);check((await read()).length===0)
await db.exec(`update spaces set status='active' where id='${other}'`);check((await read()).length===1)
await db.exec(`update spaces set owner_profile_id='${nextOwner}' where id='${other}';update spaces set owner_profile_id='${owner}' where id='${other}'`);check((await read()).length===0)
await db.exec(`update spaces set status='archived' where id='${other}'`)
await refuses(`insert into collective_cross_listings(journey_id,source_space_id,space_id,requested_by) values('${journey}','${source}','${target}','${owner}')`)
await db.exec(`update spaces set status='active',type='root' where id='${other}'`)
await refuses(`insert into collective_cross_listings(journey_id,source_space_id,space_id,requested_by) values('${journey}','${source}','${target}','${owner}')`)
return checks
}
