// PROG-E6E: the canvas frame draws the whole page, not only the selected block. This probe loads a Space page through
// the shipped canvas read (framework, auth and database replaced) and renders the shipped frame drawing to markup.
//
// It fails unless:
//   1. every placed block on the page is drawn, in its row and column, with its words and no markup;
//   2. a two-column row is drawn at its split, and every row is one column on the Phone frame;
//   3. a block's phone words are drawn on the Phone frame;
//   4. a hidden block is still drawn, marked, and can be picked; the selected block is drawn through its tools;
// and that the canvas mounts the drawing for a real page, and the route is still dark.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const state = { preferences: {}, writes: 0, flag: true, staff: true, manage: true }
globalThis.__progE6E = state

// Everything that reaches outside the process. The rest of the import graph is the repo's own code.
const stubs = new Map([
  ['server-only', ''],
  // The live-section lock readers (PROG-E6F). This probe is not about live sections, so they answer at once
  // with the same outcome as before PROG-E6F (no live section offered) instead of walking every Space store.
  ['@/lib/entity-blocks/block-data-sources', 'export const FUNCTION_BACKED_BLOCK_TYPES=[];export const existingFunctionBackedBlocks=async()=>{throw new Error("live sections are not under test here")}'],
  ['@/lib/spaces/profile-modules', 'export const enabledFunctionKeys=()=>new Set()'],
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/env/string', 'export const envFlag=(name)=>name==="EDITOR_CANVAS"&&globalThis.__progE6E.flag'],
  ['@/lib/page-editor/guard', 'export const getJanitor=async()=>globalThis.__progE6E.staff?{profileId:"staff"}:null'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"staff",webRole:"janitor"})'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__progE6E.manage,staffViewing:!globalThis.__progE6E.manage})'],
  ['@/lib/platform-flags', 'export const renderPathEnabled=async(surface)=>surface==="space_profile"'],
  ['@/lib/spaces/store', `const S=globalThis.__progE6E
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

const { loadCanvasDocument } = await import(pathToFileURL(path.join(root, 'lib/builder/canvas-document-load.ts')).href)
const { CanvasPagePreview } = await import(pathToFileURL(path.join(root, 'components/builder/canvas/canvas-page-preview.tsx')).href)
const { createElement } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')

const draft = {
  rows: [
    { id: 'r1', columns: 1, cells: [[{ nid: 'ncallout0001', type: 'callout', content: { title: 'Come <b>in</b>', body: 'Sound baths on Sunday' }, responsive: { phone: { title: 'Hi there' } } }]] },
    { id: 'r2', columns: 2, ratio: 'lead', cells: [[{ nid: 'neditorial01', type: 'editorial', content: { title: 'How this started' } }], [{ nid: 'neditorial02', type: 'editorial', content: { title: 'Kept back' }, hidden: true }]] },
  ],
  bench: [],
}
Object.assign(state, { preferences: { profileLayoutDraft: draft, profileLayoutDraftRevision: 3 }, flag: true, staff: true, manage: true })
const view = await loadCanvasDocument(SPACE)
assert.ok(view?.tree, 'the canvas must open the Space page with its tree')
const blocks = new Map(view.nodes.map((n) => [n.nid, { title: n.title, fields: n.fields, node: n.node }]))
const draw = (device) => renderToStaticMarkup(createElement(CanvasPagePreview, { tree: view.tree, blocks, device, selectedId: 'ncallout0001', onSelect: () => {}, renderSelected: (words) => createElement('div', { 'data-tools': '' }, words) }))

const desk = draw('desktop')
for (const nid of ['ncallout0001', 'neditorial01', 'neditorial02']) assert.ok(desk.includes(`data-preview-block="${nid}"`), `${nid} must be drawn`)
assert.ok(desk.includes('Come in') && !desk.includes('&lt;b&gt;') && !desk.includes('<b>'), 'words are drawn without markup')
assert.ok(desk.includes('How this started'), 'the second row is drawn')
assert.ok(/data-preview-row="r2"[^>]*grid-template-columns:minmax\(0, 2fr\) minmax\(0, 1fr\)/.test(desk), 'a wide-left row is drawn at its split')
const phone = draw('phone')
assert.ok(!/minmax\(0, 2fr\)/.test(phone), 'every row is one column on the Phone frame')
assert.ok(phone.includes('Hi there'), 'the Phone frame draws the phone words')
assert.ok(/aria-label="Edit [^"]*, hidden"/.test(desk) && desk.includes('Hidden on the page'), 'a hidden block is marked and can be picked')
assert.ok(/data-preview-block="ncallout0001" data-selected=""[^>]*><div data-tools="">/.test(desk), 'the selected block is drawn through its tools')

const read = (file) => fs.readFileSync(file, 'utf8')
assert.ok(/<CanvasPagePreview[\s\S]*?tree=\{real\.tree\}[\s\S]*?blocks=\{real\.blocks\}[\s\S]*?onSelect=\{real\.select\}/.test(read('components/builder/canvas/collab-canvas.tsx')), 'the canvas must draw the whole page for a real document')
assert.ok(/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(read('app/(main)/pages/canvas/page.tsx')), 'the canvas route must stay dark behind EDITOR_CANVAS')
console.log('PROG-E6E: the canvas frame draws every block of the page at its row split, one column on a phone')
