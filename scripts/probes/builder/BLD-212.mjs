// BLD-212: every themed site (all but DAWN) names a default layout for every role.
import fs from 'node:fs'
const roles = fs.readFileSync('lib/blocks/roles/roles.ts', 'utf8')
const ids = [...roles.matchAll(/^\s+([a-z]+): [a-z]+ as RoleDefinition/gm)].map((m) => m[1])
const bad = []
for (const f of ['menswork', 'midnight', 'wildheart', 'network', 'network-kit', 'temple', 'temple-kit', 'designer', 'free-human']) {
  const src = fs.readFileSync(`components/sites/presentation/${f}.ts`, 'utf8')
  for (const id of ids) if (!new RegExp(`^\\s+${id}: '`, 'm').test(src)) bad.push(`${f}:${id}`)
}
if (ids.length < 20) bad.push(`only ${ids.length} roles read`)
if (bad.length) { console.error('missing: ' + bad.join(', ')); process.exit(1) }
