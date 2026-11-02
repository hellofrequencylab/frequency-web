// Fails on main: no /s/<slug> short share link resolver, no share_links table, no open counting.
import { existsSync, readFileSync } from 'node:fs'
const need = ['app/s/[slug]/route.ts', 'lib/share/short-link.ts', 'lib/share/short-link-store.ts', 'supabase/migrations/20270346027600_share_links.sql']
for (const f of need) if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1) }
const sql = readFileSync(need[3], 'utf8')
const route = readFileSync(need[0], 'utf8')
if (!sql.includes('open_share_link') || !sql.includes('share_link_opens')) { console.error('migration lacks the open counter'); process.exit(1) }
if (!route.includes('shortenablePath') || !route.includes('publicShareUrl')) { console.error('route does not re-check the public page or attach the ref'); process.exit(1) }
// PR 2: the share buttons make short codes. PR 3: consoles read the opens.
const btn = readFileSync('components/events/event-share-button.tsx', 'utf8')
if (!btn.includes('useShortShareUrl')) { console.error('event share button still copies the long URL'); process.exit(1) }
if (!existsSync('lib/share/short-link-stats.ts')) { console.error('no link-open counts reader'); process.exit(1) }
console.log('ok')
