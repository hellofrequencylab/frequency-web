// Fails on main: the personal Spotlight has no Edit your Spotlight page, no Show Frequency features switch,
// and the public page never renders a configured link-in-bio.
import { existsSync, readFileSync } from 'node:fs'
const need = ['components/spotlight/spotlight-page-editor.tsx', 'components/spotlight/link-in-bio.tsx', 'lib/spotlight/link-in-bio.ts']
for (const f of need) if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1) }
const editor = readFileSync('components/spotlight/spotlight-page-editor.tsx', 'utf8')
const page = readFileSync('app/spotlight/[handle]/page.tsx', 'utf8')
const bio = readFileSync('components/spotlight/link-in-bio.tsx', 'utf8')
if (!editor.includes('Show Frequency features')) { console.error('no Show Frequency features switch'); process.exit(1) }
if (!page.includes('LinkInBioPage')) { console.error('public page does not render the link-in-bio'); process.exit(1) }
if (!bio.includes('Get your spotlight on Frequency')) { console.error('no Frequency link at the bottom'); process.exit(1) }
console.log('ok')
