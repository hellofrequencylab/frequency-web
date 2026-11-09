#!/usr/bin/env node
// LIVE-2052: print the SQL that dresses one Space's website in the New World General kit, carrying the owner's words over
// (lib/sites/new-world-site.ts). The builder is TypeScript behind the repo's path aliases, so this runs it the way
// gen-theme-manifests.mjs does: through vitest, with the input and output paths in the environment.
//
//   node scripts/new-world-site-sql.mjs <input.json> <out.sql>
//
// input.json: { spaceId, revision, kit, accent, register, current (the published WebsiteSnapshot or null), preferences
// (the Space's preferences, siteStyle at least), space: { slug, name, tagline, about, coverUrl, logoUrl, profile, siteHero,
// headerCta } }. Export it from the Frequency Community project; the revision is preferences.websiteEditor.revision at
// export time, and the SQL refuses to run if the owner has saved since.
import { spawnSync } from 'node:child_process'
const [input, out] = process.argv.slice(2)
if (!input || !out) { console.error('usage: node scripts/new-world-site-sql.mjs <input.json> <out.sql>'); process.exit(2) }
const r = spawnSync('pnpm', ['vitest', 'run', 'lib/sites/new-world-site.test.ts'], { stdio: 'inherit', env: { ...process.env, NEW_WORLD_SITE_INPUT: input, NEW_WORLD_SITE_OUT: out } })
process.exit(r.status ?? 1)
