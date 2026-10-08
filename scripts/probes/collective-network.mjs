import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
// Evaluate the real pure projection (and its pure dependencies), without a test runner or service.
const modules = new Map()
function load(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file).exports
  const compiledModule = { exports: {} }; modules.set(file, compiledModule)
  const source = readFileSync(file, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const localRequire = name => {
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
