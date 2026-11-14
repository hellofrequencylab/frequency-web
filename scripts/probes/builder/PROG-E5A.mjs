// PROG-E5A: the responsive inspector is live on the canvas. The staff, EDITOR_CANVAS-gated /pages/canvas route
// derives a block's fields from its contract on the server (inspectorFieldViews) and the canvas mounts the
// inspector, which reads the device the frame shows, says where each value comes from, resets one field on one
// device, opens in a bottom sheet below lg, and reflows with a container query. The unit test that renders the
// provenance and reset UI must exist and say so.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))

const fields = read('lib/builder/inspector-fields.ts')
if (!/export function inspectorFieldViews\(/.test(fields) || !/inspectorFields\(block, surface\)/.test(fields)) bad.push('inspectorFieldViews must derive the controls from the contract through inspectorFields')

const inspector = read('components/builder/inspector/responsive-inspector.tsx')
for (const call of ['resolveInspectorValue(', 'resetInspectorOverride(', 'setInspectorValue(']) if (!inspector.includes(call)) bad.push(`the inspector never calls ${call}`)
if (!/Inherited from desktop/.test(inspector)) bad.push('the inspector must say when a value is inherited from desktop')
if (!/<BottomSheet\b/.test(inspector) || !/lg:hidden/.test(inspector)) bad.push('the inspector must open in a bottom sheet below lg')
if (!/@container/.test(inspector)) bad.push('the inspector form must reflow with a container query')
if (/hover:/.test(inspector)) bad.push('the inspector must not depend on hover')

const canvas = read('components/builder/canvas/collab-canvas.tsx')
if (!/from '@\/components\/builder\/inspector\/responsive-inspector'/.test(canvas) || !/<ResponsiveInspector\b[\s\S]*device=\{device\}/.test(canvas)) bad.push('the canvas must mount the inspector on the frame device')

const route = read('app/(main)/pages/canvas/page.tsx')
if (!/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(route) || !/getJanitor\(\)\)\) notFound\(\)/.test(route)) bad.push('the canvas route must 404 when the flag is off or the viewer is not staff')
if (!/inspectorFieldViews\(/.test(route) || !/<CollabCanvas [^>]*inspector=/.test(route)) bad.push('the canvas route must hand the canvas contract-derived inspector fields')

const test = read('components/builder/inspector/responsive-inspector.test.tsx')
if (!/Inherited from desktop/.test(test) || !/Reset Headline to desktop/.test(test)) bad.push('the inspector unit test must render provenance and the per-field reset')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
