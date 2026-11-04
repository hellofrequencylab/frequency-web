// BLD-103: the spine and outline read one list (lib/builder/spine.ts) and reorder through one pure move, so a drag
// and the keyboard land on the same document. The corpus test proves zero loss and an exact round trip over every
// kit page an owner can start from.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const spine = read('lib/builder/spine.ts')
for (const fn of ['spineItems', 'moveSection', 'stepSection']) if (!new RegExp(`export function ${fn}\\(`).test(spine)) bad.push(`spine.ts lacks ${fn}`)
const test = read('lib/builder/spine.test.ts')
if (!/a drag and the keyboard produce the same document/.test(test)) bad.push('the drag-equals-keyboard corpus test is missing')
if (!/moveSection\(dragged, id, from\)/.test(test)) bad.push('the corpus test must prove moving back restores the document')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/spineItems\(/.test(shell)) bad.push('the outline must read spineItems()')
if (!/onDragStart=/.test(shell) || !/e\.altKey && \(e\.key === 'ArrowUp'/.test(shell)) bad.push('the outline must reorder by drag and by Alt and an arrow')
if (!/data-hidden=\{item\.hidden/.test(shell)) bad.push('the outline must dim sections hidden on this device')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
