import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2157: Vera proposes turning an area of a Space on or off, and the person confirms it. Runs the real guide
// module over a stand-in catalog: the owner or an admin is offered the switch tool with each switch and its state,
// an editor stays on explain only, money, the plan and the team list are never switchable, and the card names
// every area the switch carries. Then reads the wiring: the tool rides a turn only when the guide offers it, the
// model chokepoint refuses a switch it may not offer, and a tap goes through the Module Manager's own guarded
// action.
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
const { veraSpaceGuide, veraSwitchable, veraSwitchCard } = mod.exports

const space = { name: 'Sunrise', slug: 'sunrise', entitlements: { reviews: false } }
const admin = veraSpaceGuide(space, { isOwner: false, role: 'admin', canEditProfile: true, canManageMembers: true })
assert.match(admin, /set_space_feature tool \(space "sunrise"\)/, 'an owner or admin is offered the switch')
assert.match(admin, /nothing changes until they tap it/)
assert.match(admin, /Switches you may propose \(feature: now\): reviews: off, crm: on\./, 'each switch with its state, money and the team list left out')
const editor = veraSpaceGuide(space, { isOwner: false, role: 'editor', canEditProfile: true, canManageMembers: false })
assert.ok(!editor.includes('set_space_feature'), 'an editor stays on explain only')
assert.match(editor, /You cannot change a setting from this chat/)
for (const fn of ['availability', 'memberships', 'members', 'nope']) assert.equal(veraSwitchable(fn), false, `${fn} is never switchable from chat`)
assert.equal(veraSwitchable('reviews'), true)
assert.equal(veraSwitchCard('crm', false), 'Turn CRM off in this Space? This also turns off Automation.')

const agent = read('lib/ai/vera/agent-claude.ts')
assert.match(agent, /input\.spaceGuide\?\.includes\('set_space_feature'\)/, 'the tool rides a turn only when the guide offers it')
assert.match(agent, /handleModelToolCalls\(toolCalls, proposals, undefined, spaceSwitches\)/)
assert.match(read('lib/ai/vera/model-tools.ts'), /c\.name === 'set_space_feature' && !space\?\.switchable\(/, 'the chokepoint refuses a switch it may not offer')
const confirm = read('app/onboarding/vera-actions.ts')
assert.match(confirm, /if \(!veraSwitchable\(feature\)\) return \{ ok: false/, 'the confirm path refuses money and the team list too')
assert.match(confirm, /await setSpaceFeatureEnabled\(slug, feature, on\)/, 'a tap goes through the Module Manager action, which re-checks the caller')
assert.match(read('lib/ai/vera/turn.ts'), /veraSpaceGuide\(space, await getSpaceCapabilities\(space, profileId\)\)/, 'the role comes from the caller own session')
console.log('LIVE-2157 ok: Vera proposes a Space switch to its owner or an admin, money stays manual, and a tap does the write')
