// PROG-E6B: direct manipulation on the canvas's real document. This probe RUNS the shipped code: the one draft
// write action (app/(main)/pages/canvas/document-actions.ts), the canvas's server read and the model under them,
// with only the framework, auth and database modules replaced. The database stand-in keeps one Space's preferences
// in memory and compares the revision in the write, the way writeSpacePreferencesAtRevision does.
//
// It fails unless, through that action:
//   1. a move in the layer tree is saved to the DRAFT, survives a reload, and a stale tab cannot do it;
//   2. a spacing handle stores a named step and nothing that is a length or a colour can get in;
//   3. an insert adds a preset (starting words and all) under the selected block, presets are offered before
//      blank blocks, and a block the canvas does not own is refused;
//   4. the page is read as a nested tree (rows, columns, blocks);
//   5. with EDITOR_CANVAS off none of it writes.
// Then it checks the canvas mounts the three controls and the route is still dark.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const state = { preferences: {}, writes: 0, flag: true, staff: true, manage: true }
globalThis.__progE6B = state

// Everything that reaches outside the process. The rest of the import graph is the repo's own code.
const stubs = new Map([
  ['server-only', ''],
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/env/string', 'export const envFlag=(name)=>name==="EDITOR_CANVAS"&&globalThis.__progE6B.flag'],
  ['@/lib/page-editor/guard', 'export const getJanitor=async()=>globalThis.__progE6B.staff?{profileId:"staff"}:null'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"staff",webRole:"janitor"})'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__progE6B.manage,staffViewing:!globalThis.__progE6B.manage})'],
  ['@/lib/platform-flags', 'export const renderPathEnabled=async(surface)=>surface==="space_profile"'],
  ['@/lib/spaces/store', `const S=globalThis.__progE6B
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
    if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || url.includes('/node_modules/')) return next(url, context)
    const file = fileURLToPath(url)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    return { format: 'module', source, shortCircuit: true }
  },
})

const need = ['lib/builder/canvas-tree.ts', 'lib/builder/canvas-presets.ts', 'components/builder/canvas/spacing-handles.tsx', 'components/builder/canvas/block-inserter.tsx']
const missing = need.filter((file) => !exists(file))
if (missing.length) { console.error(`PROG-E6B: missing ${missing.join(', ')}`); process.exit(1) }

const { saveCanvasNodeDraft } = await import(pathToFileURL(path.join(root, 'app/(main)/pages/canvas/document-actions.ts')).href)
const { loadCanvasDocument } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-document-load.ts')).href)

const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in' }, style: { align: 'center' } }, { nid: EDITORIAL, type: 'editorial', content: { title: 'First' } }]] },
    { id: 'r2', columns: 2, cells: [[], []] },
  ],
  bench: [],
})
const reset = () => Object.assign(state, { preferences: { accent: 'sky', profileLayout: published(), profileLayoutDraftRevision: 3 }, writes: 0, flag: true, staff: true, manage: true })
const draft = () => state.preferences.profileLayoutDraft
const order = (layout) => layout.rows.map((row) => row.cells.map((stack) => stack.map((node) => node.nid)))
const block = (nid) => draft().rows.flatMap((row) => row.cells.flat()).find((node) => node.nid === nid)
const open = async () => { const view = await loadCanvasDocument(SPACE); assert.ok(view, 'the canvas must open the Space page'); return view }
const send = async (change, nid = CALLOUT, base) => saveCanvasNodeDraft({ spaceId: SPACE, nid, base: base ?? (await open()).base, values: {}, change })

// 4. The page is read as a nested tree.
reset()
const first = await open()
assert.deepEqual(first.tree?.map((row) => row.columns.map((stack) => stack.map((layer) => layer.id))), [[[CALLOUT, EDITORIAL]], [[], []]], 'the layer tree must nest rows, columns and blocks')
assert.deepEqual(first.tree[0].columns[0].map((layer) => layer.label), ['Callout', 'Editorial section'])

// 1. A move is saved to the draft, survives a reload, and a stale tab cannot do it.
const moved = await send({ kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } })
assert.equal(moved.ok, true, `a move must save: ${moved.error ?? ''}`)
assert.equal(state.writes, 1)
assert.deepEqual(order(draft()), [[[EDITORIAL]], [[], [CALLOUT]]], 'the saved draft must hold the new order')
assert.deepEqual(state.preferences.profileLayout, published(), 'a move must never change the published page')
assert.equal(state.preferences.accent, 'sky')
assert.equal(state.preferences.profileLayoutDraftRevision, 4)
assert.deepEqual(block(CALLOUT).content, { title: 'Come in' }, 'a moved block keeps its words')
const reloaded = await open()
assert.equal(reloaded.source, 'draft')
assert.deepEqual(reloaded.layers.map((layer) => layer.id), [EDITORIAL, CALLOUT], 'a reload must show the saved order')
assert.deepEqual(moved.view.tree, reloaded.tree, 'the tab must be handed the same tree a reload reads')
const stale = await send({ kind: 'move', to: { rowId: 'r1', col: 0, index: 0 } }, CALLOUT, first.base)
assert.deepEqual([stale.ok, stale.conflict, state.writes], [false, true, 1], 'a stale tab must not reorder a newer draft')
const nowhere = await send({ kind: 'move', to: { rowId: 'r9', col: 0, index: 0 } })
assert.deepEqual([nowhere.ok, nowhere.conflict, state.writes], [false, false, 1], 'a slot that is not on the page must be refused')

// 2. A spacing handle stores a named step, and only a named step.
reset()
for (const [edge, step] of [['mt', 'lg'], ['pad', 'sm'], ['mb', 'none']]) assert.equal((await send({ kind: 'spacing', edge, step })).ok, true, `${edge} ${step} must save`)
assert.deepEqual(block(CALLOUT).style, { align: 'center', mt: 'lg', pad: 'sm', mb: 'none' })
assert.equal((await send({ kind: 'spacing', edge: 'mt', step: 'default' })).ok, true)
assert.deepEqual(block(CALLOUT).style, { align: 'center', pad: 'sm', mb: 'none' }, 'the default step leaves no key behind')
const before = JSON.stringify(state.preferences)
for (const step of ['24px', '2rem', '#ff0000', 'calc(1px)', 16, null, 'huge']) {
  const refused = await send({ kind: 'spacing', edge: 'mt', step })
  assert.equal(refused.ok, false, `a spacing step of ${JSON.stringify(step)} must be refused`)
}
assert.equal(JSON.stringify(state.preferences), before, 'a refused spacing step must write nothing')
assert.ok(!/\d(px|rem|em|%)|#[0-9a-f]{3,8}\b/i.test(JSON.stringify(block(CALLOUT).style)), 'no length or colour may be stored as spacing')

// 3. Presets first; a preset lands under the selected block with its words; a foreign id is refused.
reset()
const inserter = (await open()).inserter
assert.deepEqual(Object.keys(inserter), ['presets', 'blanks'], 'the inserter must offer presets before blank blocks')
assert.ok(inserter.presets.length >= 4 && inserter.blanks.length >= 4)
assert.ok(!inserter.blanks.some((blank) => ['about', 'offerings', 'events'].includes(blank.id)), 'live data sections are not the canvas inserter\'s to offer')
const preset = inserter.presets[0]
const added = await send({ kind: 'insert', source: 'preset', id: preset.id })
assert.equal(added.ok, true, `a preset must insert: ${added.error ?? ''}`)
const stack = draft().rows[0].cells[0]
assert.deepEqual([stack[0].nid, stack[1].nid, stack[2].nid], [CALLOUT, added.node.nid, EDITORIAL], 'the new block goes right under the selected one')
assert.ok(Object.values(stack[1].content ?? {}).some((value) => typeof value === 'string' && value.length > 3), 'a preset must arrive with starting words')
assert.ok(added.view.nodes.find((node) => node.nid === added.node.nid)?.fields.length > 0, 'the tab must get the new block with its controls')
const blank = await send({ kind: 'insert', source: 'blank', id: inserter.blanks[0].id }, EDITORIAL)
assert.equal(blank.ok, true)
assert.equal(block(blank.node.nid).content, undefined, 'a blank block starts empty')
const writes = state.writes
for (const [source, id] of [['blank', 'offerings'], ['preset', 'callout'], ['blank', preset.id], ['preset', 'nope']]) assert.equal((await send({ kind: 'insert', source, id })).ok, false, `${source} ${id} must be refused`)
assert.equal(state.writes, writes)

// 5. Off, not staff, or read only: nothing is written.
for (const off of [{ flag: false }, { staff: false }, { manage: false }]) {
  reset()
  const base = (await open()).base
  Object.assign(state, off)
  for (const change of [{ kind: 'move', to: { rowId: 'r2', col: 0, index: 0 } }, { kind: 'spacing', edge: 'mt', step: 'lg' }, { kind: 'insert', source: 'preset', id: preset.id }]) {
    assert.equal((await send(change, CALLOUT, base)).ok, false, `${JSON.stringify(off)} must not save a ${change.kind}`)
  }
  assert.equal(state.writes, 0)
}

// Wired, and still dark.
const read = (file) => fs.readFileSync(file, 'utf8')
const canvas = read('components/builder/canvas/collab-canvas.tsx')
for (const [wire, why] of [[/<LayerList [^>]*tree=\{document \? real\.tree : undefined\}[^>]*onMove=\{document \? real\.move : undefined\}/, 'the layer tree with saved moves'], [/<SpacingHandles [^>]*onChange=\{real\.space\}/, 'the spacing handles'], [/onInsert=\{real\.insert\}/, 'the inserter']]) {
  assert.ok(wire.test(canvas), `the canvas must mount ${why}`)
}
assert.ok(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(read('app/(main)/pages/canvas/page.tsx')), 'the canvas route must stay dark behind EDITOR_CANVAS')
for (const test of ['lib/builder/canvas-tree.test.ts', 'lib/builder/canvas-presets.test.ts', 'app/(main)/pages/canvas/document-actions-change.test.ts', 'components/builder/canvas/canvas-structure.test.tsx']) assert.ok(exists(test), `missing ${test}`)
