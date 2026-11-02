// Fails on main: a press on a personal Spotlight link is never counted and the owner never sees a count.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
const need = ['lib/spotlight/link-clicks.ts', 'components/spotlight/counted-external-link.tsx']
for (const f of need) if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1) }
const mig = readdirSync('supabase/migrations').find((f) => f.endsWith('_member_spotlight_link_clicks.sql'))
if (!mig) { console.error('no member_spotlight_link_clicks migration'); process.exit(1) }
const rec = readFileSync('lib/spaces/spotlight-clicks.ts', 'utf8')
if (!rec.includes('recordMemberLinkClick')) { console.error('the click beacon does not route a personal link press'); process.exit(1) }
if (!readFileSync('components/spotlight/link-in-bio.tsx', 'utf8').includes('CountedExternalLink')) { console.error('public links do not count presses'); process.exit(1) }
if (!readFileSync('components/spotlight/spotlight-page-editor.tsx', 'utf8').includes('clicks[l.id]')) { console.error('the editor shows no counts'); process.exit(1) }
console.log('ok')
