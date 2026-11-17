// PROG-E6F: the canvas inserter offers the Space's live sections (About, Events, Offerings and the rest), and only the
// ones the Space page builder's own lock rule lets this Space place. This probe RUNS the shipped canvas read and draft
// action with only framework, auth, the database and the two lock-rule readers (which sections have data, which
// switches are on) replaced; partitionSpaceBlocks itself is the real one.
//
// It fails unless:
//   1. the canvas read offers live sections with no data source, and a function-backed one only once it has data;
//   2. a section whose function switch is off is held back, even with data;
//   3. a live section the rule allows is added under the selected block through the one draft write;
//   4. a live section the rule holds back is refused and nothing is written, and a non-live id cannot ride `live`;
//   5. a read-only viewer is offered none;
// and that the canvas's inserter draws the live group, and the route is still dark.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const state = { preferences: {}, writes: 0, flag: true, staff: true, manage: true, existing: [], enabled: [] }
globalThis.__progE6F = state

// Everything that reaches outside the process. The rest of the import graph is the repo's own code.
const stubs = new Map([
  // The live-section lock check's two readers: which sections have data, and which function switches are on.
  ['@/lib/entity-blocks/block-data-sources', `export const FUNCTION_BACKED_BLOCK_TYPES=["offerings","booking","events","team","journeys","circles","reviews","faq","memberships","tickets","donations","enroll","practices","linkCards"]
export const existingFunctionBackedBlocks=async()=>new Set(globalThis.__progE6F.existing)`],
  ['@/lib/spaces/profile-modules', 'export const enabledFunctionKeys=()=>new Set(globalThis.__progE6F.enabled)'],
  ['server-only', ''],
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/env/string', 'export const envFlag=(name)=>name==="EDITOR_CANVAS"&&globalThis.__progE6F.flag'],
  ['@/lib/page-editor/guard', 'export const getJanitor=async()=>globalThis.__progE6F.staff?{profileId:"staff"}:null'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"staff",webRole:"janitor"})'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__progE6F.manage,staffViewing:!globalThis.__progE6F.manage})'],
  ['@/lib/platform-flags', 'export const renderPathEnabled=async(surface)=>surface==="space_profile"'],
  ['@/lib/spaces/store', `const S=globalThis.__progE6F
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

const { saveCanvasNodeDraft } = await import(pathToFileURL(path.join(root, 'app/(main)/pages/canvas/document-actions.ts')).href)
const { loadCanvasDocument } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-document-load.ts')).href)

const CALLOUT = 'ncallout0001'
const published = () => ({ rows: [{ id: 'r1', columns: 1, cells: [[{ nid: CALLOUT, type: 'callout', content: { title: 'Come in' } }, { nid: 'neditorial01', type: 'editorial', content: { title: 'First' } }]] }], bench: [] })
const reset = (over = {}) => Object.assign(state, { preferences: { profileLayout: published(), profileLayoutDraftRevision: 3 }, writes: 0, flag: true, staff: true, manage: true, existing: ['events', 'booking'], enabled: ['availability'] }, over)
const live = async () => ((await loadCanvasDocument(SPACE))?.inserter?.live ?? []).map((section) => section.id)
const send = async (change) => saveCanvasNodeDraft({ spaceId: SPACE, nid: CALLOUT, base: (await loadCanvasDocument(SPACE)).base, values: {}, change })

// 1 and 2. What is offered.
reset()
let ids = await live()
for (const id of ['about', 'events', 'booking']) assert.ok(ids.includes(id), `${id} must be offered: ${ids}`)
for (const id of ['offerings', 'faq', 'callout']) assert.ok(!ids.includes(id), `${id} must not be offered: ${ids}`)
reset({ enabled: [] })
assert.ok(!(await live()).includes('booking'), 'a section whose switch is off is held back, even with data')

// 3. A live section is added through the one write.
reset()
const added = await send({ kind: 'insert', source: 'live', id: 'events' })
assert.equal(added.ok, true, `an allowed live section must save: ${added.error ?? ''}`)
const placed = state.preferences.profileLayoutDraft.rows[0].cells[0].map((node) => node.type)
assert.deepEqual(placed, ['callout', 'events', 'editorial'], 'it goes in under the selected block')
assert.deepEqual(state.preferences.profileLayout, published(), 'nothing here may change the published page')

// 4. Held back, or not live: refused, nothing written.
for (const id of ['offerings', 'callout']) {
  reset()
  const res = await send({ kind: 'insert', source: 'live', id })
  assert.deepEqual([res.ok, state.writes], [false, 0], `${id} must be refused as a live insert`)
}

// 5. Read only: none offered.
reset({ manage: false })
assert.deepEqual(await live(), [], 'a read-only viewer is offered no live section')

const read = (file) => fs.readFileSync(file, 'utf8')
assert.ok(/data-inserter="live"[\s\S]*?onInsert\('live', section\.id\)/.test(read('components/builder/canvas/block-inserter.tsx')), 'the inserter must draw the live group')
assert.ok(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(read('app/(main)/pages/canvas/page.tsx')), 'the canvas route must stay dark behind EDITOR_CANVAS')
console.log('PROG-E6F: the canvas offers the live sections the Space page builder lets this Space place, and adds them through the one draft write')
