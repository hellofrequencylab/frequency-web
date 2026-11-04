// BLD-104: selection and parts. The section toolbar's actions are one undo step each (lib/builder/section-actions.ts),
// the part under the pointer is outlined on the canvas, and a click on a picture opens its own field in Tune with the
// focal point lit beside it. Canvas and Tune edit the one draft, so an edit in either shows in the other.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const actions = read('lib/builder/section-actions.ts')
if (!/export function sectionCommand\(/.test(actions)) bad.push('section-actions.ts lacks sectionCommand')
if (!/one undo/.test(read('lib/builder/section-actions.test.ts'))) bad.push('the one-undo-step test is missing')
const parts = read('lib/builder/parts.ts')
for (const fn of ['pictureFieldFor', 'focalFieldFor']) if (!new RegExp(`export function ${fn}\\(`).test(parts)) bad.push(`parts.ts lacks ${fn}`)
if (!/behind the image proxy/.test(parts)) bad.push('parts.ts must match a picture behind the image proxy')
if (!/focal point that crops the picture/.test(read('lib/builder/parts.test.ts'))) bad.push('the focal-point test is missing')
const canvas = read('components/sites/editor/canvas.tsx')
if (!/const PARTS_CSS = `\[data-parts\] \.we-section \[data-part\]:hover/.test(canvas)) bad.push('the canvas must outline the part under the pointer')
if (!/onImage\(id, /.test(canvas)) bad.push('a click on a picture must reach onImage')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/parts onImage=\{openPicture\}/.test(shell)) bad.push('the builder must turn parts on and open the picture field')
if (!/focus=\{tuneFocus/.test(shell)) bad.push('Tune must receive the clicked picture as focus')
// One draft: the canvas draws page.doc and Tune reads the selected block from the same page.doc.
if (!/doc=\{page\.doc\}/.test(shell) || !/const sections = page\.doc\.content/.test(shell) || !/props=\{selected\.props/.test(shell)) bad.push('canvas and Tune must read the same draft')
const tune = read('components/builder/tune/tune-rail.tsx')
if (!/data-lit=\{lit/.test(tune)) bad.push('Tune must light the clicked picture field')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
