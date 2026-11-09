// BLD-903: Temple and Free Human quiet text reads AA on its plaster and cream. The BLD-901 matrix found umber 500
// (#8C7059, 4.05:1 on plaster) and taupe 500 (#85664E, 4.48:1 on cream) carrying small text (times, units, field labels).
// Closed when neither palette step is the theme's text-subtle ink any more.
import fs from 'node:fs'
const bad = []
const read = (f) => fs.readFileSync(f, 'utf8')
const temple = read('lib/theme/temple-kit.ts')
const human = read('lib/theme/free-human.ts')
if (/subtle: P\.umber500/.test(temple) || /--color-text-subtle:var\(--tk-umber-500\)/.test(temple)) bad.push('temple-kit.ts still uses umber 500 as its text-subtle ink')
if (/subtle: P\.taupe500/.test(human) || /--color-text-subtle:var\(--fh-taupe-500\)/.test(human)) bad.push('free-human.ts still uses taupe 500 as its text-subtle ink')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
