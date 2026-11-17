// PROG-E6C: the canvas fits a phone, and a block can be duplicated, hidden, removed and put back, with Undo. This
// probe RUNS the shipped draft action and canvas read with only framework, auth and database replaced (the database
// stand-in compares the revision in the write, as writeSpacePreferencesAtRevision does).
//
// It fails unless, through that action:
//   1. a duplicate lands right under its block with every bag it holds, and the tab is told to select it;
//   2. hide and show flip one block in place and the layer tree says which is hidden;
//   3. a removal keeps the block on the bench with its words, and a put-back returns it to its slot;
//   4. the undo of an add takes the new block away for good, and the last block on a page cannot be removed;
//   5. with EDITOR_CANVAS off, for non-staff or a read-only viewer, none of it writes.
// Then it checks the canvas mounts the block actions and Undo, opens on the Phone frame on a phone, and draws a frame
// wider than the screen smaller to fit; and that the route is still dark.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const state = { preferences: {}, writes: 0, flag: true, staff: true, manage: true }
globalThis.__progE6C = state

// Everything that reaches outside the process. The rest of the import graph is the repo's own code.
const stubs = new Map([
  ['server-only', ''],
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/env/string', 'export const envFlag=(name)=>name==="EDITOR_CANVAS"&&globalThis.__progE6C.flag'],
  ['@/lib/page-editor/guard', 'export const getJanitor=async()=>globalThis.__progE6C.staff?{profileId:"staff"}:null'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"staff",webRole:"janitor"})'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__progE6C.manage,staffViewing:!globalThis.__progE6C.manage})'],
  ['@/lib/platform-flags', 'export const renderPathEnabled=async(surface)=>surface==="space_profile"'],
  ['@/lib/spaces/store', `const S=globalThis.__progE6C
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

const need = ['components/builder/canvas/block-actions.tsx', 'app/(main)/pages/canvas/document-actions-e6c.test.ts', 'components/builder/canvas/use-canvas-document-e6c.test.tsx']
const missing = need.filter((file) => !exists(file))
if (missing.length) { console.error(`PROG-E6C: missing ${missing.join(', ')}`); process.exit(1) }

const { saveCanvasNodeDraft } = await import(pathToFileURL(path.join(root, 'app/(main)/pages/canvas/document-actions.ts')).href)
const { loadCanvasDocument } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-document-load.ts')).href)
const { canvasFitScale } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-viewport.ts')).href)

const CALLOUT = 'ncallout0001'
const EDITORIAL = 'neditorial01'
const published = () => ({
  rows: [{ id: 'r1', columns: 1, cells: [[
    { nid: CALLOUT, type: 'callout', content: { title: 'Come in' }, style: { align: 'center', mt: 'lg' }, responsive: { phone: { title: 'Hi' } } },
    { nid: EDITORIAL, type: 'editorial', content: { title: 'First' } },
  ]] }],
  bench: [],
})
const reset = () => Object.assign(state, { preferences: { accent: 'sky', profileLayout: published(), profileLayoutDraftRevision: 3 }, writes: 0, flag: true, staff: true, manage: true })
const draft = () => state.preferences.profileLayoutDraft
const placed = () => draft().rows.flatMap((row) => row.cells.flat())
const open = async () => { const view = await loadCanvasDocument(SPACE); assert.ok(view, 'the canvas must open the Space page'); return view }
const send = async (change, nid = CALLOUT, base) => saveCanvasNodeDraft({ spaceId: SPACE, nid, base: base ?? (await open()).base, values: {}, change })

// 1. Duplicate.
reset()
const copy = await send({ kind: 'duplicate' })
assert.equal(copy.ok, true, `a duplicate must save: ${copy.error ?? ''}`)
const [first, made, third] = placed()
assert.deepEqual([first.nid, made.nid, third.nid], [CALLOUT, copy.node.nid, EDITORIAL], 'the copy goes right under its block, and the tab selects it')
assert.notEqual(made.nid, CALLOUT)
assert.deepEqual([made.type, made.content, made.style, made.responsive], [first.type, first.content, first.style, first.responsive], 'a copy carries every bag')
assert.deepEqual(state.preferences.profileLayout, published(), 'nothing here may change the published page')

// 2. Hide and show.
reset()
const hidden = await send({ kind: 'hide', hidden: true }, EDITORIAL)
assert.equal(hidden.ok, true)
assert.equal(placed()[1].hidden, true)
assert.equal(hidden.view.tree[0].columns[0][1].hidden, true, 'the layer tree must say which block is hidden')
assert.equal((await open()).tree[0].columns[0][1].hidden, true, 'a reload must still show it hidden')
assert.equal((await send({ kind: 'hide', hidden: false }, EDITORIAL)).ok, true)
assert.equal(placed()[1].hidden, undefined)

// 3. Remove keeps the block's words; put back returns it to its slot.
reset()
const removed = await send({ kind: 'remove', keep: true })
assert.equal(removed.ok, true)
assert.equal(removed.node.nid, EDITORIAL, 'after a removal the neighbour is selected')
assert.deepEqual(placed().map((node) => node.nid), [EDITORIAL])
assert.deepEqual(draft().bench.map((node) => [node.nid, node.content]), [[CALLOUT, { title: 'Come in' }]], 'a removed block keeps its words on the bench')
const back = await send({ kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } })
assert.equal(back.ok, true, `a put-back must save: ${back.error ?? ''}`)
assert.deepEqual(placed().map((node) => node.nid), [CALLOUT, EDITORIAL])
assert.deepEqual(draft().bench, [])

// 4. Undo of an add is final; the last block stays.
reset()
const added = await send({ kind: 'duplicate' })
assert.equal((await send({ kind: 'remove', keep: false }, added.node.nid)).ok, true)
assert.deepEqual([placed().map((node) => node.nid), draft().bench], [[CALLOUT, EDITORIAL], []], 'undoing an add leaves no trace')
assert.equal((await send({ kind: 'remove', keep: true }, EDITORIAL)).ok, true)
const writes = state.writes
const last = await send({ kind: 'remove', keep: true })
assert.deepEqual([last.ok, last.conflict, state.writes], [false, false, writes], 'the last block on a page cannot be removed')
const stale = await send({ kind: 'hide', hidden: true }, CALLOUT, { revision: 3, fingerprint: 'old' })
assert.deepEqual([stale.ok, stale.conflict], [false, true], 'a stale tab cannot change the draft')

// 5. Off, not staff, or read only: nothing is written.
for (const off of [{ flag: false }, { staff: false }, { manage: false }]) {
  reset()
  const base = (await open()).base
  Object.assign(state, off)
  for (const change of [{ kind: 'duplicate' }, { kind: 'hide', hidden: true }, { kind: 'remove', keep: true }, { kind: 'restore', to: { rowId: 'r1', col: 0, index: 0 } }]) {
    assert.equal((await send(change, CALLOUT, base)).ok, false, `${JSON.stringify(off)} must not save a ${change.kind}`)
  }
  assert.equal(state.writes, 0)
}

// The phone: a desktop frame on a 390px screen is drawn smaller, never wider than the room.
assert.ok(canvasFitScale(1280, 358) < 0.3 && canvasFitScale(390, 358) > 0.9 && canvasFitScale(390, 800) === 1, 'a frame wider than the screen must be drawn smaller to fit')

// Wired, and still dark.
const read = (file) => fs.readFileSync(file, 'utf8')
const canvas = read('components/builder/canvas/collab-canvas.tsx')
for (const [wire, why] of [
  [/<BlockActions[\s\S]*?onDuplicate=\{real\.duplicate\}[\s\S]*?onToggleHidden=\{real\.toggleHidden\}[\s\S]*?onRemove=\{real\.remove\}[\s\S]*?onUndo=\{real\.undo\}/, 'the block actions and Undo'],
  [/const device: BuilderDevice = picked \?\? \(narrow \? 'phone' : 'desktop'\)/, 'the Phone frame on a phone'],
]) assert.ok(wire.test(canvas), `the canvas must mount ${why}`)
assert.ok(/canvasFitScale\(width, room\)/.test(read('components/builder/canvas/canvas-viewport-shell.tsx')), 'the frame must be fitted to the room it has')
assert.ok(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(read('app/(main)/pages/canvas/page.tsx')), 'the canvas route must stay dark behind EDITOR_CANVAS')
console.log('PROG-E6C: duplicate, hide, remove, put back and undo save through the one draft write; the canvas fits a phone')
