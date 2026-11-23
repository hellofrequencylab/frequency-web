// PROG-E6H: a block tile in the Space page builder rail is DRAGGED, by a mouse and by a long press on touch.
// This probe RUNS the shipped drop operation on a Space page document (the repo's own code end to end,
// nothing replaced but `server-only`), pushes the result through the Space write guard (what the builder's
// one draft save stores), and runs the shared long press state machine the rail's drag arms from.
//
// It fails unless:
//   1. a drop on a tile lands the block just before it, inside its own column, above or below its start;
//   2. a drop on another column of the same section lands at that place, with the block's words, and fills
//      an empty column;
//   3. a drop on the place the block already has, in another section, or on a missing column moves nothing;
//   4. a column at the 12 block cap refuses the drop instead of dropping a block (as the Move button does);
//   5. a live data section at its cap (Events) is dragged and is still the only one after the write guard;
//   6. a finger that moves before the long press lands is a scroll (never a drag), and one that holds arms;
// and that the rail wires both pointers to that one operation, on both canvas stores, with the shared hook
// and the shared landing place data the website Layers use.
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
assert.equal(typeof ops.moveNodeTo, 'function', 'the node store has no drop operation: a tile cannot be dragged')
const { moveNodeTo, dropMoveTarget, sanitizeNodeLayout } = ops

const A = 'ntext000001', B = 'ncallout001', C = 'ntext000002', EVENTS = 'nevents0001', ALONE = 'nalone00001'
const page = () => ({
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: ALONE, type: 'editorial' }]] },
    { id: 'r1', columns: 2, cells: [[{ nid: A, type: 'text', content: { text: 'Left words' } }, { nid: B, type: 'callout' }, { nid: C, type: 'text' }], [{ nid: EVENTS, type: 'events' }]] },
    { id: 'r2', columns: 2, cells: [[], []] },
  ],
  bench: [],
})
const ids = (layout, row) => layout.rows[row].cells.map((stack) => stack.map((node) => node.nid))
const at = (col, index, rowId = 'r1') => ({ rowId, col, index })

// 1. Inside its own column: before the tile it was dropped on.
assert.deepEqual(ids(moveNodeTo(page(), C, at(0, 0)), 1)[0], [C, A, B], 'a block dragged up lands before the tile it was dropped on')
assert.deepEqual(ids(moveNodeTo(page(), A, at(0, 2)), 1)[0], [B, A, C], 'a block dragged down lands before the tile it was dropped on')
assert.deepEqual(ids(moveNodeTo(page(), A, at(0, 3)), 1)[0], [B, C, A], 'a drop on the column itself lands at its end')

// 2. Another column of the same section, with its words; an empty column is filled.
const across = moveNodeTo(page(), A, at(1, 0))
assert.deepEqual(ids(across, 1), [[B, C], [A, EVENTS]], 'a block lands at the place dropped on in the other column')
assert.deepEqual(across.rows[1].cells[1][0].content, { text: 'Left words' }, 'its words travel with it')
const emptied = moveNodeTo(page(), EVENTS, at(0, 3))
assert.deepEqual(ids(moveNodeTo(emptied, B, at(1, 0)), 1), [[A, C, EVENTS], [B]], 'an empty column takes a dropped block')

// 3. Nothing to do, or not a place for this block: the same document comes back.
const start = page()
assert.equal(moveNodeTo(start, A, at(0, 0)), start, 'a drop on its own place moves nothing')
assert.equal(moveNodeTo(start, A, at(0, 1)), start, 'a drop just below itself moves nothing')
assert.equal(moveNodeTo(start, A, at(0, 0, 'r2')), start, 'another section is not a landing place')
assert.equal(moveNodeTo(start, ALONE, at(1, 0)), start)
assert.equal(moveNodeTo(start, A, at(2, 0)), start, 'a column that does not exist refuses')

// 4. The 12 block cap refuses; a reorder inside the full column still works (it adds nothing).
const full = page()
full.rows[1].cells[1] = Array.from({ length: 12 }, (_, i) => ({ nid: `nfull${String(i).padStart(6, '0')}`, type: 'text' }))
assert.equal(moveNodeTo(full, A, at(1, 0)), full, 'a full column must refuse the drop, not drop a block')
assert.equal(dropMoveTarget([{ id: 'r1', cells: [[A], full.rows[1].cells[1].map((n) => n.nid)] }], A, at(1, 12)), null)
assert.equal(ids(moveNodeTo(full, 'nfull000011', at(1, 0)), 1)[1].length, 12)

// 5. A live data section at its cap is dragged, and the Space write guard stores it once, where it landed.
const stored = sanitizeNodeLayout(moveNodeTo(page(), EVENTS, at(0, 1)), 'space')
assert.deepEqual(stored.rows[1].cells.map((stack) => stack.map((node) => node.type)), [['text', 'events', 'callout', 'text'], []], 'the write guard keeps the dragged live section')

// 6. The gesture the rail arms from: a scroll is never a drag; a still hold is.
const { longPressStep, LONG_PRESS_MS } = await import(pathToFileURL(path.join(root, 'lib/builder/gesture.ts')).href)
const down = longPressStep({ phase: 'idle' }, { type: 'down', x: 10, y: 10, at: 0 })
assert.equal(longPressStep(down, { type: 'move', x: 10, y: 60, at: 50 }).phase, 'cancelled', 'a finger that moves before the press lands is scrolling')
assert.equal(longPressStep(longPressStep(down, { type: 'move', x: 10, y: 60, at: 50 }), { type: 'tick', at: LONG_PRESS_MS }).phase, 'cancelled', 'and stays a scroll')
assert.equal(longPressStep(down, { type: 'tick', at: LONG_PRESS_MS }).phase, 'armed', 'a still hold arms the drag')

// The rail: one hook, one landing place vocabulary, one drop, both stores.
const read = (file) => fs.readFileSync(file, 'utf8')
assert.ok(!exists('components/sites/editor/use-layer-touch-drag.ts'), 'the long press hook must live in one shared place, not a website copy')
const hook = read('lib/builder/use-layer-touch-drag.ts')
assert.ok(/longPressStep/.test(hook) && /readLayerDrop/.test(hook), 'the shared hook must arm from the shared press machine and read the shared landing data')
assert.ok(/event\.key !== 'Escape'/.test(hook), 'Escape must let go of a held block')
assert.ok(/from '@\/lib\/builder\/use-layer-touch-drag'/.test(read('components/sites/editor/shell.tsx')), 'the website Layers must use the same hook')
const editor = read('components/entity-blocks/space-canvas/space-canvas-editor.tsx')
assert.ok(/from '@\/lib\/builder\/use-layer-touch-drag'/.test(editor) && /useLayerTouchDrag\(\{[\s\S]*?onDrop: dropBlock/.test(editor), 'the rail must take the long press through the shared hook')
assert.ok(/draggable onDragStart=/.test(editor) && /dropBlock\(id, target, key\)/.test(editor), 'a mouse drag must end in the same drop')
assert.ok(/layerDropAttrs\(endKey, endAt\)/.test(editor) && /layerDropAttrs\(block\.key,/.test(editor), 'every column and every tile must be a landing place')
assert.ok(/data-landing="before"/.test(editor) && /data-landing="end"/.test(editor) && /data-landing="full"/.test(editor), 'a drag must show where the block will land, or that the column is full')
assert.ok(/model\.dropAt\(id, place\)[\s\S]*?setMoveSaid\(/.test(editor), 'a drop must be said for a screen reader')
const model = read('components/entity-blocks/space-canvas/canvas-model.ts')
assert.ok(/dropAt: \(key, drop\) => edit\(\(l\) => moveNodeTo\(l, key, drop\)\)/.test(model), 'the node canvas model must drop through the store edit (the one draft save)')
assert.ok(/dropMoveTarget\(layout\.rows, key, drop\)[\s\S]*?mutate\(placeBlock\(/.test(model), 'the type-keyed canvas model must drop through its own store')
console.log('PROG-E6H: a rail tile is dragged by mouse and by long press in the Space page builder, through the one draft save')
