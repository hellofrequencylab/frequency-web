// PROG-E6D: rows on the canvas. A row can be added, moved up or down, split into one or two columns, and an empty row
// taken off, with Undo. This probe RUNS the shipped draft action and canvas read with only framework, auth and
// database replaced (the database stand-in compares the revision in the write, as writeSpacePreferencesAtRevision does).
//
// It fails unless, through that action:
//   1. a new empty row lands at its index, the selected block stays selected, and a reload shows it;
//   2. a row moves one step and is refused past the edge;
//   3. a row re-splits (even, wide left, wide right, one column) and the tree reads the split back;
//   4. a split that would drop a column holding a block is refused, and no block is ever moved, folded or benched;
//   5. only an empty row comes off, never the last, and a split wider than a Space page holds is not accepted;
//   6. with EDITOR_CANVAS off, for non-staff or a read-only viewer, none of it writes.
// Then it checks the canvas mounts the row tools and that the route is still dark.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const state = { preferences: {}, writes: 0, flag: true, staff: true, manage: true }
globalThis.__progE6D = state

// Everything that reaches outside the process. The rest of the import graph is the repo's own code.
const stubs = new Map([
  ['server-only', ''],
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/env/string', 'export const envFlag=(name)=>name==="EDITOR_CANVAS"&&globalThis.__progE6D.flag'],
  ['@/lib/page-editor/guard', 'export const getJanitor=async()=>globalThis.__progE6D.staff?{profileId:"staff"}:null'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"staff",webRole:"janitor"})'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__progE6D.manage,staffViewing:!globalThis.__progE6D.manage})'],
  ['@/lib/platform-flags', 'export const renderPathEnabled=async(surface)=>surface==="space_profile"'],
  ['@/lib/spaces/store', `const S=globalThis.__progE6D
export const getSpaceById=async(id)=>id===${JSON.stringify(SPACE)}?{id,slug:"calm",name:"Calm Studio",preferences:structuredClone(S.preferences)}:null
export const writeSpacePreferencesAtRevision=async(id,preferences,guard)=>{
  const stored=S.preferences[guard.revisionKey]
  if((guard.expected===0?stored!==undefined&&stored!==null:stored!==guard.expected))return "stale"
  S.preferences=structuredClone(preferences);S.writes++;return "written"
}`],
])
const exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile()
const sourceFile = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(exists)
registerHooks({
  resolve(spec, context, next) {
    if (stubs.has(spec)) return { url: `data:text/javascript,${encodeURIComponent(stubs.get(spec))}`, shortCircuit: true }
    const from = context.parentURL?.startsWith('file:') ? path.dirname(fileURLToPath(context.parentURL)) : root
    const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(from, spec) : null
    const file = base && !base.includes(`${path.sep}node_modules${path.sep}`) ? sourceFile(base) : null
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(spec, context)
  },
  load(url, context, next) {
    // The canvas viewport reads block role files as JSON; give them the attribute an import needs.
    if (url.startsWith('file:') && url.endsWith('.json') && !url.includes('/node_modules/')) return { format: 'json', source: fs.readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }
    if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || url.includes('/node_modules/')) return next(url, context)
    const file = fileURLToPath(url)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    return { format: 'module', source, shortCircuit: true }
  },
})

const need = ['app/(main)/pages/canvas/document-actions-e6d.test.ts', 'components/builder/canvas/use-canvas-document-e6d.test.tsx', 'components/builder/canvas/layer-list-rows.test.tsx']
const missing = need.filter((file) => !exists(file))
if (missing.length) { console.error(`PROG-E6D: missing ${missing.join(', ')}`); process.exit(1) }

const { saveCanvasNodeDraft } = await import(pathToFileURL(path.join(root, 'app/(main)/pages/canvas/document-actions.ts')).href)
const { loadCanvasDocument } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-document-load.ts')).href)

const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in' } }]] },
    { id: 'r2', columns: 2, cells: [[{ nid: EDITORIAL, type: 'editorial', content: { title: 'First' } }], []] },
  ],
  bench: [],
})
const reset = () => Object.assign(state, { preferences: { accent: 'sky', profileLayout: published(), profileLayoutDraftRevision: 3 }, writes: 0, flag: true, staff: true, manage: true })
const draft = () => state.preferences.profileLayoutDraft
const placed = () => draft().rows.flatMap((row) => row.cells.flat().map((node) => node.nid))
const rowIds = () => draft().rows.map((row) => row.id)
const open = async () => { const view = await loadCanvasDocument(SPACE); assert.ok(view, 'the canvas must open the Space page'); return view }
const send = async (change, nid = CALLOUT, base) => saveCanvasNodeDraft({ spaceId: SPACE, nid, base: base ?? (await open()).base, values: {}, change })
const refused = async (change, why) => {
  const writes = state.writes
  const res = await send(change)
  assert.deepEqual([res.ok, res.conflict ?? false, state.writes], [false, false, writes], why)
}

// 1. Add.
reset()
const added = await send({ kind: 'row-add', at: 1 })
assert.equal(added.ok, true, `a new row must save: ${added.error ?? ''}`)
assert.equal(added.node.nid, CALLOUT, 'the selected block stays selected')
assert.equal(draft().rows.length, 3)
assert.deepEqual(draft().rows[1].cells.flat(), [], 'a new row is empty')
assert.equal((await open()).tree.length, 3, 'a reload shows the new row')
assert.deepEqual(state.preferences.profileLayout, published(), 'nothing here may change the published page')

// 2. Move.
reset()
assert.equal((await send({ kind: 'row-move', rowId: 'r2', by: -1 })).ok, true)
assert.deepEqual(rowIds(), ['r2', 'r1'])
await refused({ kind: 'row-move', rowId: 'r2', by: -1 }, 'a row at the top cannot move up')

// 3. Split.
reset()
for (const [rowId, split, columns, ratio] of [['r1', 'even', 2, undefined], ['r1', 'lead', 2, 'lead'], ['r1', 'sidebar', 2, 'trail'], ['r1', 'full', 1, undefined]]) {
  const res = await send({ kind: 'row-split', rowId, split })
  assert.equal(res.ok, true, `${split} must save: ${res.error ?? ''}`)
  const row = draft().rows.find((candidate) => candidate.id === rowId)
  assert.deepEqual([row.columns, row.ratio], [columns, ratio], `${split} is stored as ${columns} columns`)
  assert.equal(res.view.tree.find((candidate) => candidate.id === rowId).split, split, 'the tree reads the split back')
}

// 4. A split never drops a block.
reset()
assert.equal((await send({ kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } }, EDITORIAL)).ok, true)
await refused({ kind: 'row-split', rowId: 'r2', split: 'full' }, 'a split that drops a column holding a block is refused')
assert.deepEqual(draft().rows[1].cells.map((stack) => stack.map((node) => node.nid)), [[], [EDITORIAL]])
assert.deepEqual(draft().bench, [], 'no block is benched by a row change')

// 5. Remove only an empty row; never the last; no split wider than a Space page holds.
reset()
await refused({ kind: 'row-remove', rowId: 'r2' }, 'a row holding a block cannot come off')
const extra = await send({ kind: 'row-add', at: 2 })
assert.equal((await send({ kind: 'row-remove', rowId: extra.view.tree[2].id })).ok, true, 'an empty row comes off')
assert.deepEqual([rowIds(), placed()], [['r1', 'r2'], [CALLOUT, EDITORIAL]])
await refused({ kind: 'row-split', rowId: 'r1', split: 'three' }, 'a Space page holds two columns at most')
reset()
state.preferences.profileLayout = { rows: [published().rows[0]], bench: [] }
await refused({ kind: 'row-remove', rowId: 'r1' }, 'the last row stays')

// 6. Off, not staff, or read only: nothing is written.
for (const off of [{ flag: false }, { staff: false }, { manage: false }]) {
  reset()
  const base = (await open()).base
  Object.assign(state, off)
  for (const change of [{ kind: 'row-add', at: 0 }, { kind: 'row-move', rowId: 'r2', by: -1 }, { kind: 'row-split', rowId: 'r1', split: 'even' }, { kind: 'row-remove', rowId: 'r1' }]) {
    assert.equal((await send(change, CALLOUT, base)).ok, false, `${JSON.stringify(off)} must not save a ${change.kind}`)
  }
  assert.equal(state.writes, 0)
}

// Wired, and still dark.
const read = (file) => fs.readFileSync(file, 'utf8')
assert.ok(/<LayerList[^>]*onRow=\{document\?\.canSave \? real\.row : undefined\}/.test(read('components/builder/canvas/collab-canvas.tsx')), 'the canvas must mount the row tools when the page can change')
assert.ok(/<RowTools /.test(read('components/builder/canvas/layer-list.tsx')), 'Layers must draw the row tools')
assert.ok(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(read('app/(main)/pages/canvas/page.tsx')), 'the canvas route must stay dark behind EDITOR_CANVAS')
console.log('PROG-E6D: rows are added, moved, split and taken off through the one draft write, and no block is ever lost')
