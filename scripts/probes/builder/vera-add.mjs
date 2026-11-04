import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2135: Vera adds a section only from what the Add tab offers on this page, at the asked position, with the
// block's own placeholder prompts and a fresh id, on the draft. Runs the real modules: a type outside the list, a
// word-carrying line and a malformed list are refused, and the editor sends the list on the menu it already sends.
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
const layout = load('lib/sites/editor/vera-layout.ts')
const config = { components: {
  Hero: { label: 'Hero', fields: {}, render: () => null },
  Gallery: { label: 'Gallery', fields: {}, defaultProps: { title: 'Your gallery title goes here' }, render: () => null },
} }
const doc = { root: {}, content: [{ type: 'Hero', props: { id: 'hero', title: 'My own headline' } }] }
const addable = [{ type: 'Gallery', label: 'Gallery' }]
const parsed = layout.parseWebsiteVeraLayout({ changes: [
  { kind: 'add', blockType: 'Gallery', toPosition: 2 },
  { kind: 'add', blockType: 'Shop', toPosition: 1 },
  { kind: 'add', blockType: 'Gallery', toPosition: 1, title: 'Words' },
] }, new Set(['hero']), { dials: [], accents: [], accent: null, looks: [], sections: addable })
assert.equal(parsed.changes.length, 1, 'only the offered type is kept')
assert.equal(parsed.refused.length, 2, 'the rest are refused with a reason')
assert.equal(layout.parseWebsiteVeraLayout({ changes: [{ kind: 'add', blockType: 'Gallery', toPosition: 1 }] }, new Set(['hero']), { dials: [], accents: [], accent: null, looks: [] }).changes.length, 0, 'no section list, no adds')
const applied = layout.applyWebsiteVeraLayout(doc, config, parsed.changes)
assert.equal(JSON.stringify(applied.doc.content.map((b) => b.type)), JSON.stringify(['Hero', 'Gallery']), 'added at the asked position')
assert.equal(applied.doc.content[1].props.title, 'Your gallery title goes here', 'the block brings its own placeholder, not Vera words')
assert.equal(applied.doc.content[0].props.title, 'My own headline', 'the owner words are untouched')
assert.equal(layout.readWebsiteVeraStyleMenu({ dials: [], sections: [{ type: 'x; drop' }] }), null, 'a malformed section list is refused')
const shell = fs.readFileSync(path.join(root, 'components/sites/editor/shell.tsx'), 'utf8')
const action = fs.readFileSync(path.join(root, 'lib/sites/editor/actions.ts'), 'utf8')
assert.match(shell, /filter\(\(c\) => !c\.disabled\)/, 'the editor leaves out a block at its per-page cap')
assert.match(shell, /sections: \[\.\.\.new Map\(groups\.flatMap/, 'the editor sends the Add tab list on the menu')
assert.match(action, /parseWebsiteVeraLayout\(input, new Set\(outline\.map\(\(s\) => s\.id\)\), menu\)/, 'the server parses adds against that menu')
console.log('LIVE-2135 ok: Vera adds only sections the Add tab offers, with their own placeholders, on the draft')
