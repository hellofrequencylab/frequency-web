// BLD-901: the full matrix. Every role x variant x theme x surface x device (1600, 1200, 900, 390) is declared as data
// (lib/builder/matrix.ts), drawn in each theme's real token sheet and measured for horizontal overflow, zero height and
// contrast (pnpm audit:builder-matrix), with coverage over the declared cells. The one finding the pass could fix without
// a pinned-value rewrite is fixed: New World Day's muted ink reads AA on white.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const matrix = read('lib/builder/matrix.ts')
for (const fn of ['matrixCells', 'matrixCoverage', 'matrixWidths', 'matrixWidth']) if (!matrix.includes(`export function ${fn}(`)) bad.push(`matrix.ts must export ${fn}`)
if (!/MATRIX_DEVICES = \[1600, 1200, 900, 390\]/.test(matrix)) bad.push('the devices must be 1600, 1200, 900 and 390')
if (!/'NewWorld', 'NewWorldDay'/.test(matrix)) bad.push('New World must be drawn in both of its modes')
const shots = read('scripts/render/builder-matrix-shots.mjs')
for (const need of ['overflow', 'zero-height', 'contrast', 'coverage']) if (!shots.includes(need)) bad.push(`the measuring pass must report ${need}`)
if (!/ratio < 1 \|\| by\('overflow'\) \|\| by\('zero-height'\)/.test(shots)) bad.push('overflow, zero height and coverage under 1.00 must fail the pass')
if (!/"audit:builder-matrix": "node scripts\/render\/builder-matrix\.mjs"/.test(read('package.json'))) bad.push('package.json must carry audit:builder-matrix')
if (!/--nw-graphite-400:#6E6862;/.test(read('lib/theme/new-world.ts')) || /--nw-graphite-400:#7C766F/.test(read('lib/theme/new-world.ts'))) bad.push('New World Day muted ink must read AA on white (#6E6862)')
const test = read('lib/builder/matrix.test.ts')
if (!/draws a section at the narrower of the device and the surface/.test(test) || !/counts coverage over declared cells/.test(test)) bad.push('the test must hold the widths and the coverage rule')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
