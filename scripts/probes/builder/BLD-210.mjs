// BLD-210: the six roles the builder names exist in the registry, each registered as a block with a styled sheet.
import fs from 'node:fs'
const need = ['firstvisit', 'booking', 'locations', 'business', 'story']
const roles = fs.readFileSync('lib/blocks/roles/roles.ts', 'utf8')
const tsx = fs.readFileSync('components/page-editor/blocks/roles.tsx', 'utf8')
const css = fs.readFileSync('components/sites/role-blocks-css.ts', 'utf8')
const chapters = fs.readFileSync('lib/blocks/roles/chapters.role.json', 'utf8')
const bad = need.filter((r) => !fs.existsSync(`lib/blocks/roles/${r}.role.json`) || !roles.includes(`${r}: ${r} as RoleDefinition`) || !tsx.includes(`ROLES.${r}.type`) || !css.includes(`${r}: ${r.toUpperCase()}`))
if (!chapters.includes('"timetable"')) bad.push('chapters timetable (Groups)')
if (bad.length) { console.error('missing: ' + bad.join(', ')); process.exit(1) }
