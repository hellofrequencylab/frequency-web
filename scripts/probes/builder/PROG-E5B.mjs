// PROG-E5B: the staff canvas edits a real document. /pages/canvas (dark behind EDITOR_CANVAS, staff only) reads a
// Space page's node document through the Space page builder's own access rule, shows the node picked in the layer
// list in the inspector with fields from that block's contract, and saves an edit to the DRAFT only through one
// server action whose write is compared against the revision the tab loaded, in the update itself. Nothing
// publishes. The model, the action, the guarded write, the client hook and the dark route all have tests.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// The model: pure, reads draft-else-published, and refuses a stale base before it plans a write.
const model = read('lib/builder/canvas-document.ts')
for (const fn of ['readCanvasDocument', 'planCanvasDraftWrite', 'applyCanvasNodeEdit', 'canvasFingerprint']) if (!new RegExp(`export function ${fn}\\(`).test(model)) bad.push(`canvas-document.ts must export ${fn}`)
if (/from 'react'|supabase|next\/|document\.|window\./.test(code(model))) bad.push('canvas-document.ts must stay pure')
if (!/base\.revision !== current\.base\.revision \|\| base\.fingerprint !== current\.base\.fingerprint\) return \{ status: 'conflict'/.test(model)) bad.push('the planner must refuse a base that is not the stored one')
if (!/CANVAS_DRAFT_KEY = 'profileLayoutDraft'/.test(model) || !/\[CANVAS_DRAFT_KEY\]: layout, \[CANVAS_REVISION_KEY\]: revision/.test(model)) bad.push('the plan must write the draft key and move the revision')
if (/\[CANVAS_PUBLISHED_KEY\]\s*:/.test(code(model))) bad.push('the model must never write the published key')

// The guarded write: one update, scoped to the Space, filtered on the stored counter.
const store = read('lib/spaces/store.ts')
const guarded = store.split('export async function writeSpacePreferencesAtRevision(')[1]?.split('\nexport ')[0] ?? ''
if (!guarded) bad.push('lib/spaces/store.ts must export writeSpacePreferencesAtRevision')
if (!/\.update\(\{ preferences \}\)\.eq\('id', spaceId\)/.test(guarded) || !/`preferences->>\$\{guard\.revisionKey\}`/.test(guarded) || !/scoped\.is\(stored, null\) : scoped\.eq\(stored, String\(guard\.expected\)\)/.test(guarded)) bad.push('the guarded write must compare the stored revision inside the update itself')
if (!/'written' : 'stale'/.test(guarded)) bad.push('the guarded write must report a stale revision')

// The server read: the Space page builder's rule, and no node write under a Space on the older layout.
const load = read('lib/builder/canvas-document-load.ts')
if (!/resolveSpaceManageAccess\(space, caller\?\.id \?\? null, caller\?\.webRole\)/.test(load)) bad.push('the canvas read must use resolveSpaceManageAccess')
if (!/if \(!canManage && !staffViewing\) return none/.test(load) || !/if \(!canManage\) return \{ space, canSave: false/.test(load)) bad.push('a staff preview must be read only and everyone else must get nothing')
if (!/renderPathEnabled\('space_profile'\)/.test(load)) bad.push('saving must wait for the Space page node render path')

// The one action: switch, staff, parse, access, plan, guarded write. Draft only.
const action = read('app/(main)/pages/canvas/document-actions.ts')
const body = code(action)
if (!/^'use server'/.test(action)) bad.push('document-actions.ts must be a server action file')
const order = ["envFlag('EDITOR_CANVAS')", 'getJanitor()', 'parseInput(saveInput, raw)', 'resolveCanvasAccess(', 'planCanvasDraftWrite(', 'writeSpacePreferencesAtRevision(']
let at = -1
for (const step of order) {
  const next = body.indexOf(step, at + 1)
  if (next < 0 || next < at) { bad.push(`the save action must reach ${step} in order`); break }
  at = next
}
if (!/expected: input\.base\.revision/.test(body)) bad.push('the write must be guarded on the revision the tab sent')
if (!/canvasInspectorFor\(target\.type\)\.fields\.map/.test(body)) bad.push('the writable keys must come from the block contract, not the client')
if (/publish/i.test(body.replace(/published/gi, ''))) bad.push('the save action must not publish')
if ((body.match(/export async function /g) ?? []).length !== 1) bad.push('the canvas has exactly one draft write action')

// Fields from the block's own contract.
const inspector = read('lib/builder/canvas-inspector.ts')
if (!/ADOPTED_BLOCKS\.find\(/.test(inspector) || !/inspectorFieldViews\(block, SURFACE\)/.test(inspector)) bad.push('inspector fields must derive from the adopted block contract')

// Wired: the route reads the document (still dark), the canvas edits the selected node and saves through the action.
const route = read('app/(main)/pages/canvas/page.tsx')
if (!/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(route) || !/getJanitor\(\)\)\) notFound\(\)/.test(route)) bad.push('the canvas route must stay dark and staff only')
if (route.indexOf('loadCanvasDocument(spaceId)') < route.indexOf("envFlag('EDITOR_CANVAS')) notFound()")) bad.push('the document must be read after the switch and staff checks')
if (!/<CollabCanvas [^>]*document=/.test(route) || !/<CollabCanvas [^>]*inspector=/.test(route)) bad.push('the route must hand the canvas the document and keep the demo fallback')
const hook = read('components/builder/canvas/use-canvas-document.ts')
if (!/saveCanvasNodeDraft\(\{ spaceId: document\.spaceId, nid, base: base\.current/.test(hook) || !/base\.current = result\.base/.test(hook)) bad.push('the canvas must save with the base it holds and take the base a save returns')
if (!/if \(result\?\.conflict\) stopped\.current = true/.test(hook)) bad.push('a conflict must stop the tab from saving again')
const canvas = read('components/builder/canvas/collab-canvas.tsx')
if (!/useCanvasDocument\(document\)/.test(canvas) || !/onSelect=\{document \? real\.select : undefined\}/.test(canvas) || !/document \? real\.edit\(next\)/.test(canvas)) bad.push('the canvas must select from the layer list and edit the real node')

// An override can now hold an empty string or a default.
const ops = read('lib/entity-blocks/node-ops.ts')
if (!/function explicitResets\(/.test(ops) || !/explicitResets\(type, read\[device\]\)/.test(ops)) bad.push('a device override must be able to hold an empty or default value')

// Tests present and saying the consequence.
const tests = [
  ['lib/builder/canvas-document.test.ts', /refuses a stale base/],
  ['lib/builder/canvas-document.test.ts', /can be an empty string/],
  ['app/(main)/pages/canvas/document-actions.test.ts', /writes the DRAFT only, guarded on the revision/],
  ['app/(main)/pages/canvas/document-actions.test.ts', /a stale tab cannot overwrite a newer draft/],
  ['app/(main)/pages/canvas/document-actions.test.ts', /a staff preview that is not an editor of the Space cannot save/],
  ['app/(main)/pages/canvas/page.test.tsx', /is a 404 with the switch off/],
  ['lib/spaces/store-guarded-write.test.ts', /in a single update/],
  ['components/builder/canvas/collab-canvas-document.test.tsx', /Callout on desktop/],
  ['components/builder/canvas/use-canvas-document.test.tsx', /stops saving after a conflict/],
]
for (const [file, says] of tests) if (!says.test(read(file))) bad.push(`${file} must cover: ${says.source}`)

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
