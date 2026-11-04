import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2185: Vera proposes the lowest role that can use an area of a Space, and the owner or an admin confirms it.
// Runs the real guide module over a stand-in catalog: the owner or an admin is offered the role tool with the
// Module Manager's own role ladder and each area's role now, an editor gets neither, the card says who gets in,
// a role off the ladder has no card. Then reads the wiring: the turn hands in each area's effective role, the
// model chokepoint refuses money, the team list and an unknown role, and a tap goes through the Module Manager's
// own guarded setSpaceFeatureMinRole.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const catalog = {
  SPACE_MODULES: [
    { id: 'space.basics', label: 'Your page', desc: 'Your name and story.', gate: { kind: 'always' }, order: 1 },
    { id: 'space.reviews', label: 'Reviews', desc: 'The review wall.', gate: { kind: 'feature', fn: 'reviews' }, order: 2 },
    { id: 'space.crm', label: 'CRM', desc: 'Your contacts.', gate: { kind: 'feature', fn: 'crm' }, order: 3 },
    { id: 'space.automation', label: 'Automation', desc: 'Rules.', gate: { kind: 'feature', fn: 'crm' }, order: 4 },
    { id: 'space.offerings', label: 'Money', desc: 'What you charge for.', gate: { kind: 'always' }, order: 5 },
    { id: 'space.booking', label: 'Booking', desc: 'Times.', gate: { kind: 'feature', fn: 'availability' }, parent: 'space.offerings', order: 6 },
    { id: 'space.memberships', label: 'Memberships', desc: 'Tiers.', gate: { kind: 'feature', fn: 'memberships' }, order: 7 },
    { id: 'space.people', label: 'Your people', desc: 'Your team.', gate: { kind: 'feature', fn: 'members' }, order: 8 },
  ],
  isModuleEnabled: (m, e) => m.gate.kind === 'always' || e?.[m.gate.fn] !== false,
}
catalog.spaceModuleManifest = (e) => catalog.SPACE_MODULES.filter((m) => catalog.isModuleEnabled(m, e)).sort((a, b) => a.order - b.order)
const code = ts.transpileModule(read('lib/ai/vera/space-guide.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new vm.Script(`(function(require,module,exports){${code}\n})`).runInNewContext({ Object, Array, Set, JSON, RegExp })((key) => {
  if (key === '@/lib/admin/modules/space-modules') return catalog
  throw new Error(`Unexpected dependency ${key}`)
}, mod, mod.exports)
const { veraSpaceGuide, veraRoleCard } = mod.exports

const space = { name: 'Sunrise', slug: 'sunrise', entitlements: {}, minRoles: { reviews: 'viewer', crm: 'admin', members: 'editor', memberships: 'admin' } }
const admin = veraSpaceGuide(space, { isOwner: false, role: 'admin', canEditProfile: true, canManageMembers: true })
assert.match(admin, /set_space_role tool \(roles, lowest first: viewer = Member, editor = Editor, moderator = Moderator, admin = Admin\)/, 'an owner or admin is offered the role tool with the ladder')
assert.match(admin, /Who can use each now \(feature: lowest role\): reviews: viewer, crm: admin\./, 'each area with its role now, money and the team list left out')
const editor = veraSpaceGuide(space, { isOwner: false, role: 'editor', canEditProfile: true, canManageMembers: false })
assert.ok(!editor.includes('set_space_role') && !editor.includes('Who can use each'), 'an editor stays on explain only')
assert.equal(veraRoleCard('crm', 'moderator'), 'Let moderators and up use CRM in this Space?')
assert.equal(veraRoleCard('reviews', 'viewer'), 'Let every member use Reviews in this Space?')
assert.equal(veraRoleCard('crm', 'admin'), 'Let only admins use CRM in this Space?')
assert.equal(veraRoleCard('crm', 'owner'), null, 'a role off the ladder has no card')

assert.match(read('lib/ai/vera/turn.ts'), /minRoles\[fn\.key\] = spaceFunctionMinRole\(found, fn\.key\)/, 'the turn hands in each area effective role')
assert.match(read('lib/ai/vera/agent-claude.ts'), /roleCard: veraRoleCard/, 'the role card rides the same guide-gated check')
assert.match(read('lib/ai/vera/model-tools.ts'), /c\.name === 'set_space_role' && !\(space\?\.switchable\(/, 'the chokepoint refuses a role change it may not offer')
const confirm = read('app/onboarding/vera-actions.ts')
assert.match(confirm, /if \(!veraSwitchable\(feature\) \|\| !veraRoleCard\(feature, role\)\) return \{ ok: false/, 'the confirm path refuses money, the team list and a bad role too')
assert.match(confirm, /await setSpaceFeatureMinRole\(slug, feature, role\)/, 'a tap goes through the Module Manager action, which re-checks the caller')
console.log('LIVE-2185 ok: Vera proposes who can use an area of a Space to its owner or an admin, and a tap does the write')
