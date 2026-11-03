import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2097: Vera proposes LAYOUT changes in the website editor and never words. Runs the real vocabulary
// (lib/sites/editor/vera-layout.ts) on a page: a proposal that tries to write a heading is refused, the
// structural lines apply to the draft, the owner's text is unchanged, and the editor is wired to the action.
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
const v = load('lib/sites/editor/vera-layout.ts')
const config = { components: { Hero: { label: 'Hero', fields: {} }, About: { label: 'About', fields: {} }, Contact: { label: 'Contact', fields: {} } } }
const doc = { root: {}, content: [{ type: 'Hero', props: { id: 'hero', title: 'Mine' } }, { type: 'Contact', props: { id: 'contact' } }, { type: 'About', props: { id: 'about', body: 'My story' } }] }
const parsed = v.parseWebsiteVeraLayout({ changes: [{ kind: 'move', sectionId: 'about', toPosition: 2 }, { kind: 'move', sectionId: 'hero', toPosition: 1, heading: 'Invented' }, { kind: 'field', sectionId: 'hero', text: 'Invented' }] }, new Set(['hero', 'contact', 'about']))
assert.equal(parsed.changes.length, 1, 'only the structural line survives')
assert.equal(parsed.refused.length, 2, 'both word-writing lines are refused, not dropped')
assert.ok(!JSON.stringify(parsed).includes('Invented'), 'no model words reach the editor')
const applied = v.applyWebsiteVeraLayout(doc, config, parsed.changes)
assert.equal(applied.doc.content.map((b) => b.props.id).join(','), 'hero,about,contact')
assert.equal(applied.doc.content[1].props.body, 'My story')
const shell = fs.readFileSync(path.join(root, 'components/sites/editor/shell.tsx'), 'utf8')
const connected = fs.readFileSync(path.join(root, 'components/sites/editor/website-editor.tsx'), 'utf8')
assert.match(shell, /<VeraLayoutProposal /, 'the editor shows the proposal for ticking')
assert.match(shell, /updateDoc\(doc, \{ label: `Vera: /, 'applied lines land as one labelled undo step')
assert.match(connected, /onLayout=\{layout\}/, 'the live editor is connected to proposeWebsiteLayout')
console.log('LIVE-2097 ok: Vera proposes structure only, applied to the draft as one undo step')
