import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2147: Vera explains a Space's settings to someone who helps run it, from inside that Space. Runs the real
// guide module over a two-row stand-in catalog: each area comes with what it does and where it lives, the areas
// turned off are named, money and deleting stay with the owner, she says she cannot change a setting from chat,
// and a plain member gets nothing. Then reads the wiring: the page sends its Space slug, the route forwards it,
// the turn resolves the caller's own role, and the guide lands in the volatile half of her prompt.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const catalog = {
  SPACE_MODULES: [
    { id: 'space.basics', label: 'Your page', desc: 'Your name and story.', gate: { kind: 'always' }, deepLink: (s) => `/spaces/${s}/manage?section=settings`, order: 1 },
    { id: 'space.danger', label: 'Danger zone', desc: 'Delete this space.', gate: { kind: 'always' }, order: 3 },
    { id: 'space.services', label: 'Shop', desc: 'Your catalog.', gate: { kind: 'feature', fn: 'shop' }, order: 2 },
  ],
  isModuleEnabled: (m, e) => m.gate.kind === 'always' || e?.[m.gate.fn] !== false,
}
catalog.spaceModuleManifest = (e) => catalog.SPACE_MODULES.filter((m) => catalog.isModuleEnabled(m, e)).sort((a, b) => a.order - b.order)
const code = ts.transpileModule(read('lib/ai/vera/space-guide.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new vm.Script(`(function(require,module,exports){${code}\n})`).runInNewContext({ Object, Array, Set, JSON })((key) => {
  if (key === '@/lib/admin/modules/space-modules') return catalog
  throw new Error(`Unexpected dependency ${key}`)
}, mod, mod.exports)
const { veraSpaceGuide } = mod.exports

const guide = veraSpaceGuide({ name: 'Sunrise', slug: 'sunrise', entitlements: { shop: false } }, { isOwner: true, role: 'admin', canEditProfile: true })
assert.match(guide, /- Your page: Your name and story\. Where: \/spaces\/sunrise\/manage\?section=settings/)
assert.match(guide, /- Danger zone: Delete this space\. Where: \/spaces\/sunrise\/manage \(owner changes it by hand\)/)
assert.ok(!guide.includes('- Shop:'), 'an area turned off is not listed as live')
assert.match(guide, /Turned off in this Space \(turn one on from \/spaces\/sunrise\/manage\/modules\): Shop\./)
assert.match(guide, /You cannot change a setting from this chat/)
assert.equal(veraSpaceGuide({ name: 'Sunrise', slug: 'sunrise', entitlements: {} }, { isOwner: false, role: 'member', canEditProfile: false }), '', 'a plain member gets nothing')

assert.match(read('components/vera/vera-stream.ts'), /space: spaceSlugFromPath\(/, 'the page sends its Space slug')
assert.match(read('lib/ai/vera/turn-input.ts'), /space: z\.string\(\)\.regex\(/, 'the body takes only a slug-shaped space')
assert.match(read('app/api/vera/turn/route.ts'), /space: body\.space/, 'the route forwards it')
const turn = read('lib/ai/vera/turn.ts')
assert.match(turn, /veraSpaceGuide\(space, await getSpaceCapabilities\(space, profileId\)\)/, 'the turn resolves the caller own role')
assert.match(read('lib/ai/vera/agent-claude.ts'), /\$\{viewerNote\}\$\{space\}`/, 'the guide rides the volatile half of the prompt')
console.log('LIVE-2147 ok: Vera explains the Space settings to its team, from the module catalog, and changes nothing')
