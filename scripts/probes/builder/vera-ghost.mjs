import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// LIVE-2141: Vera previews her proposal on the page before anything is applied. Runs the real module: only ticked
// section lines are drawn, the page itself is untouched, and both editor layouts draw the ghost read-only on the canvas
// with a banner, while Apply stays the only way onto the draft.
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
  About: { label: 'About', fields: {}, render: () => null },
  Contact: { label: 'Contact', fields: {}, render: () => null },
} }
const doc = { root: {}, content: [
  { type: 'Hero', props: { id: 'hero', title: 'My own headline' } },
  { type: 'Contact', props: { id: 'contact' } },
  { type: 'About', props: { id: 'about', body: 'My own story.' } },
] }
const before = JSON.stringify(doc)
const ghost = layout.websiteVeraGhost(doc, config, [
  { kind: 'move', sectionId: 'about', toPosition: 2 },
  { kind: 'move', sectionId: 'contact', toPosition: 1 },
  { kind: 'accent', accent: 'tide' },
], [true, false, true])
assert.equal(JSON.stringify(ghost.doc.content.map((b) => b.props.id)), JSON.stringify(['hero', 'about', 'contact']), 'only the ticked section line is drawn')
assert.equal(ghost.changed, 1)
assert.equal(ghost.styleLines, 1, 'style lines are counted for the banner, not drawn')
assert.equal(JSON.stringify(doc), before, 'the page itself is untouched')
assert.equal(ghost.doc.content[1].props.body, 'My own story.', 'the owner words ride through unchanged')

const shell = fs.readFileSync(path.join(root, 'components/sites/editor/shell.tsx'), 'utf8')
assert.equal((shell.match(/doc=\{ghost\?\.doc \?\? page\.doc\}/g) ?? []).length, 2, 'both editor layouts draw the ghost on the canvas')
assert.equal((shell.match(/preview=\{preview \|\| !!ghost\}/g) ?? []).length, 2, 'the ghost canvas is read-only')
assert.equal((shell.match(/\{ghostBanner\}/g) ?? []).length, 2, 'both layouts show the preview banner')
assert.match(shell, /preview\?: boolean \} \| null>\(null\)/, 'the preview lives on the proposal, so dismiss and apply turn it off')
console.log('LIVE-2141 ok: Vera previews ticked section lines on the page, read-only, and the draft is untouched')
