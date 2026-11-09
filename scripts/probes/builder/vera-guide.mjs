import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2110: Vera answers questions in the website editor from the editor GUIDE and the draft's FACTS only. Runs the
// real module: the guide names the tabs the editor draws, the facts carry counts, labels and publish checks but never
// a section's words, malformed facts are refused, and the editor and server pass both to the model call.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const resolve = (key) => {
    if (!key.startsWith('.') && !key.startsWith('@/')) return require(key)
    const rel = key.startsWith('@/') ? key.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), key))
    if (rel.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(path.join(root, rel + ext))) return load(rel + ext)
    throw new Error(`Unexpected dependency ${key} from ${file}`)
  }
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Math, Date, Object, JSON, Number, Set, Map, Array, String, structuredClone, crypto: globalThis.crypto })(resolve, mod, mod.exports)
  return mod.exports
}
const g = load('lib/sites/editor/vera-guide.ts')
const shell = fs.readFileSync(path.join(root, 'components/sites/editor/shell.tsx'), 'utf8')
const guide = g.WEBSITE_EDITOR_GUIDE.join(' ')
for (const tab of ['Pages', 'Layers', 'Add', 'Theme', 'Site']) {
  assert.ok(guide.includes(tab), `the guide names the ${tab} tab`)
  assert.ok(shell.includes(`label: '${tab}'`), `the editor still draws a ${tab} tab`)
}
for (const tab of ['Content', 'Design', 'Advanced', 'Notes']) assert.ok(shell.includes(`label: '${tab}'`) && guide.includes(tab), `the guide and the inspector agree on ${tab}`)
const config = { components: { Hero: { label: 'Hero', fields: {} } } }
const draft = { theme: 'NewWorld', pages: [{ slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [{ type: 'Hero', props: { id: 'hero', title: 'Secret words' } }] } }] }
const facts = g.websiteVeraFacts({ draft, published: null, pageInView: 'Home', themeLabel: 'New World', config })
assert.equal(facts.pages[0].sections, 1)
assert.ok(facts.checks.some((c) => !c.ok), 'a missing search description shows as a failing check')
assert.ok(!JSON.stringify(facts).includes('Secret words'), 'no section words reach the model')
assert.equal(g.readWebsiteVeraFacts({ pages: 'x' }), null, 'malformed facts are refused')
const action = fs.readFileSync(path.join(root, 'lib/sites/editor/actions.ts'), 'utf8')
const model = fs.readFileSync(path.join(root, 'lib/ai/website-layout.ts'), 'utf8')
assert.match(shell, /onLayout\(text, websiteVeraOutline\(page\.doc, config\), menu, facts\)/, 'the editor sends the facts with the ask')
assert.match(action, /readWebsiteVeraFacts\(facts0\)/, 'the server reads the facts by shape')
assert.match(model, /guide: WEBSITE_EDITOR_GUIDE, facts:/, 'the model gets the guide and the facts as data')
console.log("LIVE-2110 ok: Vera answers from the editor guide and the draft's facts, never its words, and writes nothing")
