// LIVE-2514: the Aiden Tyack theme, fully built out from its handoff. Its starter site is laid out from the shared role blocks (the
// sections the handoff's theme.manifest.json lists), the theme supplies each section's default version, the skin dresses the role blocks
// in the stitch, and every stand-in photo ships. Still private: on no public list (LIVE-2513 holds that). Reads the sources (no build).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const kit = read('lib/sites/kits/aiden-tyack-variants.ts')
for (const t of ['RoleHero', 'RoleStats', 'RoleOfferings', 'RoleSteps', 'RoleShop', 'RoleStatement', 'RoleProof', 'RoleGallery', 'RoleLetter', 'RoleCta', 'RoleFaq', 'RolePeople', 'RoleLibrary', 'RoleContact'])
  if (!kit.includes(`'${t}'`)) bad.push(`the starter kit has no ${t} section`)
if (/'Services[A-Z]/.test(kit)) bad.push('the starter kit still borrows a Services block')
if (!/AidenTyack: aidenTyack/.test(read('components/sites/presentation/index.ts'))) bad.push('the theme supplies no default section versions')
if (!/\[data-role\]/.test(read('components/sites/aiden-tyack-css.ts'))) bad.push('the skin does not dress the role blocks')
const photos = existsSync('public/sites/aiden-tyack/photos') ? readdirSync('public/sites/aiden-tyack/photos') : []
if (photos.length < 10) bad.push(`only ${photos.length} of the handoff's 10 photos ship`)
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('aiden-tyack: starter site on the role blocks, theme defaults per section, stitched skin, all 10 photos')
