import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import ts from 'typescript'
// Only transport boundaries are replaced. The shipped store, public reader and
// owner actions execute here; real SQL transfer/consent tests live alongside068.
const state={tables:{},subjects:[],failPage:false,ranges:[],caller:'owner',writeFailure:false,writes:[]}
function query(input,rpc=false){let rows=[...input],first=0,last=999;const sort=[]
 const q={select:()=>q,eq:(k,v)=>{rows=rows.filter(r=>r[k]===v);return q},neq:(k,v)=>{rows=rows.filter(r=>r[k]!==v);return q},in:(k,v)=>{rows=rows.filter(r=>v.includes(r[k]));return q},or:()=>q,order:(k,o={ascending:true})=>{sort.push([k,o.ascending]);return q},range:(a,b)=>{first=a;last=b;if(rpc)state.ranges.push(a);return q},limit:n=>{last=n-1;return q},maybeSingle:async()=>({data:rows[0]??null,error:null}),insert:async patch=>{state.writes.push(patch);return {error:state.writeFailure?Error('stale database binding'):null}},update:patch=>{state.writes.push(patch);return q},then:done=>Promise.resolve({data:rows.sort((a,b)=>{for(const [key,asc] of sort){const cmp=String(a[key]??'').localeCompare(String(b[key]??''));if(cmp)return asc?cmp:-cmp}return 0}).slice(first,last+1),error:state.writeFailure||state.failPage&&first>=500?Error('unavailable'):null}).then(done)};return q}
const admin=()=>({from:table=>query(state.tables[table]??[]),rpc:()=>query(state.subjects,true)})
const transports=new Map([['server-only',{}],['react',{cache:fn=>fn}],['next/cache',{revalidatePath:()=>{}}],['@/lib/supabase/admin',{createAdminClient:admin}],['@/lib/auth',{getCallerProfile:async()=>state.caller?{id:state.caller}:null,getMyProfileId:async()=>null,isPlatformStaff:async()=>false}],['@/lib/spaces/store',{loadRootSpaceId:async()=>null,getSpaceById:async id=>({id,ownerProfileId:state.tables.spaces?.find(s=>s.id===id)?.owner_profile_id})}],['@/lib/spaces/functions',{spaceFunctionAccess:()=>true}]])
const live=new Set(['lib/collective/cross-listing-store.ts','lib/collective/cross-listing.ts','lib/collective/cross-listing-actions.ts','lib/circles/store.ts','lib/circles/visibility.ts','lib/journey-plans.ts','lib/journeys/space-shares.ts','lib/action-result.ts'])
const modules=new Map()
function load(file){file=resolve(file);if(modules.has(file))return modules.get(file).exports
 const mod={exports:{}};modules.set(file,mod)
 const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const req=name=>{if(transports.has(name))return transports.get(name);const path=name.startsWith('@/')?name.slice(2)+'.ts':name.startsWith('.')?resolve(dirname(file),name+'.ts'):null;if(path && [...live].some(f=>resolve(f)===resolve(path)))return load(path);return {}}
 new Function('module','exports','require',compiled)(mod,mod.exports,req);return mod.exports}
const store=load('lib/collective/cross-listing-store.ts')
state.subjects=Array.from({length:1201},(_,i)=>({id:String(i).padStart(4,'0'),subject:{id:`subject-${i}`,space_id:'source',name:`Circle ${i}`,status:'active',unlisted:false,is_space_primary:false,created_at:`2026-10-${i===1200?'08':'07'}T00:00:00Z`,access:'space_paid_members'}}))
assert.equal((await store.acceptedCrossListingSubjects('circle','target')).length,1201)
assert.deepEqual(state.ranges,[0,500,1000]);state.failPage=true
assert.deepEqual(await store.acceptedCrossListingSubjects('circle','target'),[]);state.failPage=false
const circles=await load('lib/circles/store.ts').listPublicSpaceCircles('target',{limit:50})
assert.equal(circles[0].id,'subject-1200');assert.equal(circles[0].space_id,'source');assert.equal(circles[0].access,'space_paid_members');assert.equal(circles.length,50)
state.subjects=[];assert.deepEqual(await load('lib/circles/store.ts').listPublicSpaceCircles('target'),[])
state.subjects=Array.from({length:1201},(_,i)=>({id:String(i),subject:{id:`journey-${i}`,space_id:'source',created_at:'2026-10-08',visibility:'public',status:'approved'}}))
assert.equal((await load('lib/journey-plans.ts').listJourneyPlansForSpace('target',1300,{publishedOnly:true})).length,1201)
const space=id=>({id,slug:id,name:id,owner_profile_id:'owner',status:'active',visibility:'network',plan:'collective',parent_id:null})
state.tables.spaces=Array.from({length:1201},(_,i)=>space(`space-${String(i).padStart(4,'0')}`));state.subjects=[]
assert.equal((await store.crossListingManagement('own')).targets.length,1201)
state.tables={spaces:[space('source'),space('target')],journey_plans:[{id:'journey',space_id:'source',title:'Journey',visibility:'public',status:'approved'}]};state.writes=[]
const actions=load('lib/collective/cross-listing-actions.ts')
assert.equal('error' in await actions.requestCollectiveCrossListing('journey','journey','target'),false)
assert.equal(state.writes[0].status,'pending');state.caller=null;state.writes=[]
assert.equal('error' in await actions.requestCollectiveCrossListing('journey','journey','target'),true);assert.equal(state.writes.length,0)
state.caller='stranger';state.writes=[]
assert.equal('error' in await actions.requestCollectiveCrossListing('journey','journey','target'),true);assert.equal(state.writes.length,0)
state.caller='owner';state.tables.spaces[1].owner_profile_id='receiver'
state.tables.collective_cross_listings=[{id:'listing',kind:'journey',subject_id:'journey',source_space_id:'source',space_id:'target',requested_by:'owner',status:'pending'}]
assert.equal('error' in await actions.respondCollectiveCrossListing('listing','accepted'),true);assert.equal(state.writes.length,0)
state.caller='receiver';assert.equal('error' in await actions.respondCollectiveCrossListing('listing','accepted'),false)
assert.equal(state.writes[0].status,'accepted');state.writes=[]
state.caller='owner';state.writeFailure=true
assert.equal('error' in await actions.requestCollectiveCrossListing('journey','journey','target'),true)
console.log('ok: LIVE765 shipped listing stores/readers/actions exhaust1201, retain source/access, withdraw safely and surface atomic write refusals')
