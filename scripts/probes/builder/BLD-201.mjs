// BLD-201: every role file carries intent, group, icon, live, variant thumbs and slot labels (check:roles passes), every
// role icon resolves in the sprite, and block-meta.ts presents role blocks from those fields, not from type-name regexes.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const bad = []
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (!pkg.scripts?.['check:roles']) bad.push('no check:roles script')
else {
  try { execFileSync('node', ['scripts/check-roles.mjs'], { stdio: 'pipe' }) } catch (e) { bad.push(`check:roles fails: ${String(e.stderr ?? e.message).trim()}`) }
}
const meta = fs.readFileSync('lib/sites/editor/block-meta.ts', 'utf8')
if (!/roleOfType\(type\)/.test(meta) || !/def\.icon/.test(meta) || !/def\.live/.test(meta)) bad.push('block-meta.ts does not read the role fields')
// The legacy regexes may stay, but none of them may name a role type (Role*).
const roleTypes = fs.readdirSync('lib/blocks/roles').filter((f) => f.endsWith('.role.json')).map((f) => JSON.parse(fs.readFileSync(`lib/blocks/roles/${f}`, 'utf8')).type)
for (const t of roleTypes) if (meta.includes(t)) bad.push(`block-meta.ts names the role type ${t}`)
if (/\/[^/\n]*\bRole\\w|\/\^?\(?Role/.test(meta)) bad.push('block-meta.ts has a regex for Role* types')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log(`BLD-201: ${roleTypes.length} roles carry the builder contract; block-meta reads it.`)
