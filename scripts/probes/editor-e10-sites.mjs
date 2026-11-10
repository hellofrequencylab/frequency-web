// PROG-E10 gate (EDITOR-ARCHITECTURE §8): a tenant serves a custom domain off the same registry, and the
// token-request path exists (D-1). Re-pointed 2026-11-10 on Daniel's phrase from a `custom_domain` column
// that never shipped to the real field: spaces.domain, routed by proxy.ts. The two seams already hold; the
// token-request path (no raw CSS, D-1) is the part still missing, so the probe fails until it lands.
import fs from 'node:fs'
import path from 'node:path'

const col = fs
  .readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .some((f) => /spaces[^;]*\bdomain\s+text\b/is.test(fs.readFileSync(path.join('supabase/migrations', f), 'utf8')))
const host = /routeSiteHost|lookupLiveSiteDomain/.test(fs.readFileSync('proxy.ts', 'utf8'))

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}
const tokenRequest = ['lib/sites', 'lib/theme'].flatMap(walk).some((f) => /tokenRequest|requestThemeTokens/.test(fs.readFileSync(f, 'utf8')))

if (!col || !host || !tokenRequest) {
  console.error(
    'PROG-E10: ' + [!col && 'no spaces.domain column', !host && 'proxy.ts does not route by Space domain', !tokenRequest && 'no token-request path (D-1)'].filter(Boolean).join('; '),
  )
  process.exit(1)
}
console.log('PROG-E10: a tenant serves its domain off the registry and the token-request path exists')
