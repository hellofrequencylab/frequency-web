// BLD-301: the surface switcher. Site, Profile, Spotlight and Email sit in the top bar as one kit control whose four
// actions are in the ⌘K registry; the canvas frames the page at the surface's declared density and width; sections the
// surface cannot show are listed above the canvas with the reason; and the corpus test proves the hidden-on-surface list
// equals the blocks without that surface while the selection persists across switches.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const lib = read('lib/builder/surfaces.ts')
for (const fn of ['surfaceFrame', 'surfaceShowing', 'surfaceSections', 'hiddenOnSurface']) if (!lib.includes(`export function ${fn}(`)) bad.push(`surfaces.ts must export ${fn}`)
if (!/ROLES\[role\]\.surfaces\[surface\]/.test(lib)) bad.push('a role\'s surfaces must come from its role.json table, not a copy')
if (!/stackClassFor\(spec\.density\)/.test(lib)) bad.push('the density must resolve through the E3 scale (lib/entity-blocks/density.ts)')
const switcher = read('components/builder/surfaces/surface-switcher.tsx')
if (!/SegmentedControl/.test(switcher) || !/'data-action': `surface-\$\{s\.id\}`/.test(switcher)) bad.push('the switcher must be the kit segmented control, each segment carrying its action id')
const notes = read('components/builder/surfaces/surface-notes.tsx')
if (!/h\.reason/.test(notes) || !/Not shown on/.test(notes)) bad.push('the hidden sections must be listed with their reason')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/<SurfaceSwitcher surface=\{state\.surface\}/.test(shell)) bad.push('the top bar must carry the switcher')
if (!/data-density=\{frame\.density\}/.test(shell) || !/\$\{frame\.width\}px/.test(shell)) bad.push('the canvas frame must take the surface\'s density and width')
if (!/doc=\{canvasDoc\}/.test(shell) || !/<SurfaceNotes surface=\{state\.surface\} sections=\{surfaced\}/.test(shell)) bad.push('the canvas must draw what the surface shows and list the rest')
const commands = read('lib/builder/commands.ts')
for (const s of ['site', 'profile', 'spotlight', 'email']) if (!commands.includes(`'surface-${s}'`)) bad.push(`⌘K must list surface-${s}`)
const test = read('lib/builder/surfaces.test.ts')
if (!/expect\(hiddenOnSurface\(doc, config, surface\)\)\.toEqual\(expected\)/.test(test)) bad.push('the test must prove the hidden list equals the blocks without the surface over the corpus')
if (!/expect\(s\.selectedId\)\.toBe\('n'\)/.test(test)) bad.push('the test must prove the selection persists across switches')
const css = read('components/builder/surfaces/surfaces.module.css')
if (/#[0-9a-fA-F]{3,8}\b/.test(css)) bad.push('no hex in the builder chrome')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
