// PROG-E6A: the touch gesture model is live on the canvas. The pure model (lib/builder/gesture.ts) carries a long-press
// state machine, a drop hit-test, reorder and a keyboard twin; the layer list wires them with a no-gesture Up/Down path,
// 44px targets and no hover; the staff, EDITOR_CANVAS-gated canvas mounts it; both have tests.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))

const model = read('lib/builder/gesture.ts')
for (const fn of ['longPressStep', 'dropIndex', 'reorder', 'keyboardMove']) if (!new RegExp(`export function ${fn}[<(]`).test(model)) bad.push(`gesture.ts must export ${fn}`)
if (/from 'react'|document\.|window\./.test(model)) bad.push('gesture.ts must stay pure')

const list = read('components/builder/canvas/layer-list.tsx')
for (const call of ['longPressStep(', 'dropIndex(', 'keyboardMove(', 'reorder(']) if (!list.includes(call)) bad.push(`the layer list never calls ${call}`)
if (!/onPointerDown/.test(list) || !/onKeyDown/.test(list) || !/Move \$\{layer\.label\} up/.test(list)) bad.push('the layer list needs pointer, keyboard and button paths')
if (!/min-h-11/.test(list)) bad.push('targets must be 44px')
if (/hover:/.test(list)) bad.push('the layer list must not depend on hover')

const canvas = read('components/builder/canvas/collab-canvas.tsx')
if (!/<LayerList\b/.test(canvas)) bad.push('the canvas must mount the layer list')
const route = read('app/(main)/pages/canvas/page.tsx')
if (!/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(route)) bad.push('the canvas route must stay dark behind EDITOR_CANVAS')

if (!/long press/i.test(read('lib/builder/gesture.test.ts')) || !/Move Banner up/.test(read('components/builder/canvas/layer-list.test.tsx'))) bad.push('gesture and layer list tests must exist')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
