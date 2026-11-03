// BLD-211: hero glow and minimal, stats bar and gatherings agenda are listed by their role files and styled.
import fs from 'node:fs'
const has = (f, ...needles) => { const s = fs.readFileSync(f, 'utf8'); return needles.filter((n) => !s.includes(n)) }
const bad = [
  ...has('lib/blocks/roles/hero.role.json', '"glow"', '"minimal"'),
  ...has('lib/blocks/roles/stats.role.json', '"bar"'),
  ...has('lib/blocks/roles/gatherings.role.json', '"agenda"'),
  ...has('components/sites/role-blocks-css.ts', 'data-variant="agenda"', 'data-variant="glow"', 'data-variant="bar"'),
  ...has('components/page-editor/blocks/roles.tsx', "variant === 'agenda'"),
]
if (bad.length) { console.error('missing: ' + bad.join(', ')); process.exit(1) }
