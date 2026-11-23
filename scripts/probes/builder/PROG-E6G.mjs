// PROG-E6G: a block crosses columns in the Space page builder. This probe RUNS the shipped model operation on a
// Space page document (the repo's own code end to end, nothing replaced but `server-only`) and then pushes the
// result through the Space write guard, which is what the builder's one draft save stores.
//
// It fails unless:
//   1. a block moves to the END of the neighbouring column of its own section, with its words;
//   2. it fills an empty column, and stops at the first and the last column;
//   3. a section with one column moves nothing;
//   4. a live data section at its cap (Events) crosses and is still the only one after the write guard;
//   5. a full column refuses the block instead of dropping it;
// and that the rail wires the keys and a 44px labelled button to that operation on both canvas stores.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile()
const sourceFile = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(exists)
registerHooks({
  resolve(spec, context, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }
    const from = context.parentURL?.startsWith('file:') ? path.dirname(fileURLToPath(context.parentURL)) : root
    const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(from, spec) : null
    const file = base && !base.includes(`${path.sep}node_modules${path.sep}`) ? sourceFile(base) : null
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(spec, context)
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'json', source: fs.readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }
    if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || url.includes('/node_modules/')) return next(url, context)
    const file = fileURLToPath(url)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    return { format: 'module', source, shortCircuit: true }
  },
})

const ops = await import(pathToFileURL(path.join(root, 'lib/entity-blocks/node-ops.ts')).href)
assert.equal(typeof ops.moveNodeAcross, 'function', 'the node store has no move across columns')
const { moveNodeAcross, sanitizeNodeLayout } = ops

const TEXT = 'ntext000001', CALLOUT = 'ncallout001', EVENTS = 'nevents0001', ALONE = 'nalone00001', WIDE = 'nwide000001'
const page = () => ({
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: ALONE, type: 'editorial' }]] },
    { id: 'r1', columns: 2, cells: [[{ nid: TEXT, type: 'text', content: { text: 'Left words' } }, { nid: CALLOUT, type: 'callout' }], [{ nid: EVENTS, type: 'events' }]] },
    { id: 'r2', columns: 3, cells: [[{ nid: WIDE, type: 'text' }], [], []] },
  ],
  bench: [],
})
const ids = (layout, row) => layout.rows[row].cells.map((stack) => stack.map((node) => node.nid))

// 1. To the end of the neighbouring column, with its words.
let moved = moveNodeAcross(page(), TEXT, 1)
assert.deepEqual(ids(moved, 1), [[CALLOUT], [EVENTS, TEXT]], 'a block goes to the end of the column on its right')
assert.deepEqual(moved.rows[1].cells[1][1].content, { text: 'Left words' }, 'its words travel with it')
assert.deepEqual(ids(moveNodeAcross(moved, TEXT, -1), 1), [[CALLOUT, TEXT], [EVENTS]], 'and back to the end of the column on its left')

// 2. An empty column is filled; the first and the last column are the edges.
const once = moveNodeAcross(page(), WIDE, 1)
assert.deepEqual(ids(once, 2), [[], [WIDE], []], 'an empty column takes the block')
const twice = moveNodeAcross(once, WIDE, 1)
assert.deepEqual(ids(twice, 2), [[], [], [WIDE]])
assert.equal(moveNodeAcross(twice, WIDE, 1), twice, 'the last column is the edge')
const start = page()
assert.equal(moveNodeAcross(start, TEXT, -1), start, 'the first column is the edge')

// 3. One column: nothing to cross.
assert.equal(moveNodeAcross(start, ALONE, 1), start)
assert.equal(moveNodeAcross(start, ALONE, -1), start)

// 4. A live data section at its cap crosses, and the Space write guard stores it once, where it landed.
const stored = sanitizeNodeLayout(moveNodeAcross(page(), EVENTS, -1), 'space')
assert.deepEqual(stored.rows[1].cells.map((stack) => stack.map((node) => node.type)), [['text', 'callout', 'events'], []], 'the write guard keeps the moved live section')

// 5. A full column refuses.
const full = page()
full.rows[1].cells[1] = Array.from({ length: 12 }, (_, i) => ({ nid: `nfull${String(i).padStart(6, '0')}`, type: 'text' }))
assert.equal(moveNodeAcross(full, TEXT, 1), full, 'a full column must refuse, not drop a block')

// The rail: both stores answer the move, the key and the button call it, and the button is a 44px target.
const read = (file) => fs.readFileSync(file, 'utf8')
const model = read('components/entity-blocks/space-canvas/canvas-model.ts')
assert.ok(/across: \(key, direction\) => edit\(\(l\) => moveNodeAcross\(l, key, direction\)\)/.test(model), 'the node canvas model must move through the store edit (the one draft save)')
assert.ok(/columnMoveTarget\(layout\.rows, key, direction\)[\s\S]*?mutate\(placeBlock\(/.test(model), 'the type-keyed canvas model must move through its own store')
const editor = read('components/entity-blocks/space-canvas/space-canvas-editor.tsx')
assert.ok(/plan\.kind === 'column'\) onAcross\(key, plan\.direction\)/.test(editor), 'Alt and Left or Right must move the block')
assert.ok(/data-across="right" onClick=\{\(\) => onAcross\(1\)\}/.test(editor) && /data-across="left" onClick=\{\(\) => onAcross\(-1\)\}/.test(editor), 'the rail must carry a button for each side')
assert.ok(/ACROSS_BUTTON =\s*'[^']*min-h-11 min-w-11/.test(editor), 'the button must be a 44px target')
console.log('PROG-E6G: a block crosses columns in the Space page builder, by key and by button, through the one draft save')
