import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'
const packageRequire = createRequire(import.meta.url)
// Evaluate the real pure projection (and its pure dependencies), without a test runner or service.
const state = { tables: {}, failPage: false }
function createAdminClient() { return { from(table) {
 let rows=[...(state.tables[table]??[])],first=0,last=999;const ordering=[]
 const query={select:()=>query,eq:(key,v)=>{rows=rows.filter(r=>r[key]===v);return query},neq:(key,v)=>{rows=rows.filter(r=>r[key]!==v);return query},in:(key,v)=>{rows=rows.filter(r=>v.includes(r[key]));return query},is:(key,v)=>{rows=rows.filter(r=>r[key]===v);return query},gte:(key,v)=>{rows=rows.filter(r=>String(r[key])>=v);return query},lt:(key,v)=>{rows=rows.filter(r=>String(r[key])<v);return query},order:key=>{ordering.push(key);return query},limit:n=>{last=n-1;return query},range:(a,b)=>{first=a;last=b;return query},then:resolve=>Promise.resolve({data:rows.sort((a,b)=>{for(const key of ordering){const result=String(a[key]??'').localeCompare(String(b[key]??''));if(result)return result}return 0}).slice(first,last+1),error:state.failPage&&table==='events'&&first>=500?Error('page unavailable'):null}).then(resolve)}
 return query
} } }
const transports = new Map([
 ['server-only',{}],['react',{cache:fn=>fn}],['@/lib/supabase/admin',{createAdminClient}],
 ['@/lib/spaces/store',{loadRootSpaceId:()=>{throw Error('No ambient tenant')}}],
 ['@/lib/calendar/public-month',{spaceEventRowsToItems:async rows=>rows.map(row=>({slug:row.slug,title:row.title,dayKey:row.starts_at.slice(0,10),isCancelled:!!row.is_cancelled,layer:'events'}))}],
])
const modules = new Map()
function load(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file).exports
  const compiledModule = { exports: {} }; modules.set(file, compiledModule)
  const source = readFileSync(file, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const localRequire = name => {
    if(transports.has(name))return transports.get(name)
    if(!name.startsWith('@/')&&!name.startsWith('.'))return packageRequire(name)
    const target = name.startsWith('@/') ? `${name.slice(2)}.ts` : resolve(dirname(file), `${name}.ts`)
    return load(target)
  }
  new Function('module', 'exports', 'require', compiled)(compiledModule, compiledModule.exports, localRequire)
  return compiledModule.exports
}
const { publicMemberSpaces, liveNetworkUpcoming } = load('lib/collective/network.ts')
const parent = { id: 'parent', status: 'active', plan: 'collective', ownerProfileId: 'owner', networkConnected: true }
const member = { id: 'child', parent_id: 'parent', owner_profile_id: 'owner', status: 'active', visibility: 'network', network_connected: true, type: 'business', slug: 'child', name: 'Child' }
const rejected = [{visibility:'private'}, {status:'suspended'}, {network_connected:false}, {owner_profile_id:'other'}, {parent_id:'other'}]
assert.deepEqual(publicMemberSpaces([member, ...rejected.map((change,i)=>({...member,id:`hidden${i}`,...change}))], parent).map(row=>row.id), ['child'])
assert.equal(publicMemberSpaces([member], {...parent,plan:'business'}).length, 0)
assert.equal(liveNetworkUpcoming([{slug:'cancelled',dayKey:'2026-10-10',isCancelled:true,layer:'events'}], '2026-10-01').length, 0)
const code = path => readFileSync(path,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')
const store=code('lib/collective/network-store.ts'), action=code('app/(main)/spaces/[slug]/network/actions.ts'), page=code('app/(main)/spaces/[slug]/network/page.tsx')
assert.match(store, /publicMemberSpaces\(/)
assert.match(store, /listSpaceCalendarEvents\(source\.id/)
assert.match(store, /paintCancelled:\s*true/)
assert.match(store, /spaceEventRowsToItems\(/)
assert.match(action, /getVisibleSpaceBySlug\(slug,\s*await getMyProfileId\(\)\)/)
assert.match(action, /loadCollectiveNetworkWindow\(/)
assert.match(page, /getVisibleSpaceBySlug\(/)
assert.match(page, /listPublicCollectiveMembers\(/)
assert.match(page, /loadCollectiveNetworkWindow\(/)
assert.match(page, /caller\?\.id === parent\.ownerProfileId/)
assert.match(page, /loadMonth=\{loadCollectiveNetworkMonth\.bind/)
assert.match(code('lib/spaces/profile-nav.ts'), /collectiveNetworkOpen\(space\).*\/network/)
assert.match(code('lib/spaces/profile-pages.ts'), /'network'/)
console.log('ok: Collective network projects public members, composes the public calendar and rechecks access per month')

// Exercise the shipped directory/calendar queries with only database and formatting transports replaced.
const {listPublicCollectiveMembers,loadCollectiveNetworkWindow}=load('lib/collective/network-store.ts')
const directoryRow={...member,brand_name:null,brand_logo_url:null}
state.tables={spaces:Array.from({length:1201},(_,i)=>({...directoryRow,id:`member-${String(i).padStart(4,'0')}`,slug:`member-${i}`,name:'Same name'})),events:[],event_space_shares:[]}
assert.equal((await listPublicCollectiveMembers(parent)).length,1201)
const event=(id,space_id)=>({id,slug:id,title:id,space_id,host_space_id:null,status:'published',visibility:'public',removed_at:null,is_demo:false,starts_at:'2026-10-10T19:00:00Z',is_cancelled:false})
state.tables={spaces:[directoryRow],events:Array.from({length:1201},(_,i)=>event(`owned-${String(i).padStart(4,'0')}`,'child')),event_space_shares:[]}
state.tables.events.push({...event('last-day','child'),starts_at:'2026-10-31T23:59:59.999Z'},...Array.from({length:600},(_,i)=>({...event(`future-${i}`,'child'),starts_at:'2026-11-01T00:00:00Z'})))
const ownedMonth=await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')
assert.equal(ownedMonth.length,1202)
assert.equal(ownedMonth.at(-1).slug,'last-day')
state.failPage=true
await assert.rejects(()=>loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01'),/page unavailable/)
state.failPage=false
const homes=Array.from({length:1201},(_,i)=>`home-${String(i).padStart(4,'0')}`)
state.tables={spaces:[directoryRow,...homes.map(id=>({...directoryRow,id,parent_id:'elsewhere'}))],events:homes.map((home,i)=>event(`shared-${String(i).padStart(4,'0')}`,home)),event_space_shares:homes.map((_,i)=>({event_id:`shared-${String(i).padStart(4,'0')}`,space_id:'parent',status:'accepted'}))}
assert.equal((await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).length,1201)
console.log('ok: actual bounded month, directory, accepted-share and home eligibility reads exceed1200 rows without truncation; late-page failure is visible')
