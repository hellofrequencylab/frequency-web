// SCAN-1184 probe: `events` carries a trigger-maintained updated_at, the sitemap event reader selects
// it, and the sitemap emits it as lastModified (guarded against the future, SCAN-661). Reads the tree.
import { readdirSync, readFileSync } from 'node:fs'
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
const seo = readFileSync('lib/events/series-seo.ts', 'utf8')
const sitemap = readFileSync('app/sitemap.ts', 'utf8')
const checks = [
  ['events.updated_at column', /alter table public\.events\s+add column if not exists updated_at timestamptz/i.test(migrations)],
  ['updated_at trigger on events', /create trigger trg_events_updated_at\s+before update on public\.events/i.test(migrations)],
  ['sitemap reader selects updated_at', /\.select\(`[^`]*\bupdated_at\b[^`]*`\)/.test(seo) && /updatedAt: r\.updated_at/.test(seo)],
  ['sitemap emits lastModified from updatedAt', /lastModified: new Date\(e\.updatedAt/.test(sitemap)],
  ['never the start date as lastmod (SCAN-661)', !/lastModified: new Date\(e\.startsAt\)/.test(sitemap)],
]
const bad = checks.filter(([, ok]) => !ok)
if (bad.length) { console.error(`FAIL: ${bad.map(([n]) => n).join('; ')}`); process.exit(1) }
console.log('ok: event sitemap entries carry a true, past lastmod from events.updated_at')
