#!/usr/bin/env node
// LIVE-884 evidence capture. Run from any machine that can reach production (not the build):
//   node scripts/capture-public-market-detail.mjs https://frequencylocal.com <public-product-id> <private-or-unpublished-id>
// Writes scripts/evidence/public-market-detail.json for scripts/check-public-market-detail.mjs
// --require-runtime. It never sends a session cookie: the point is the anonymous shared cache.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [origin, productId, privateId] = process.argv.slice(2)
if (!origin || !productId || !privateId) {
  console.error('usage: capture-public-market-detail.mjs <origin> <public-product-id> <private-or-unpublished-id>')
  process.exit(2)
}
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const digestSources = ['app/(public)/market/[id]/page.tsx', 'app/(main)/marketplace/commerce-actions.ts', 'app/(main)/marketplace/review-actions.ts', 'proxy.ts', 'lib/commerce/marketplace-entry.ts', 'app/(public)/layout.tsx']
const sourceDigest = createHash('sha256').update(digestSources.map((f) => `${f}\n${read(f)}`).join('\n--\n')).digest('hex').slice(0, 16)

const UA = 'frequency-live-884-capture'
async function view(path, cookie) {
  const res = await fetch(`${origin}${path}`, { headers: { 'user-agent': UA, ...(cookie ? { cookie } : {}) }, redirect: 'manual' })
  await res.arrayBuffer()
  return {
    status: res.status,
    xVercelCache: res.headers.get('x-vercel-cache'),
    cacheControl: res.headers.get('cache-control'),
    age: res.headers.get('age'),
    setCookie: res.headers.get('set-cookie'),
  }
}
const first = await view(`/market/${productId}`)
// Retain the discovery stamp (fq_mkt) exactly as a browser would, nothing else.
const stamp = (first.setCookie ?? '').split(/,(?=\s*\w+=)/).map((c) => c.split(';')[0].trim()).find((c) => c.startsWith('fq_mkt='))
const repeat = await view(`/market/${productId}`, stamp)
const malformedId = await view('/market/not-a-product-id')
const privateView = await view(`/market/${privateId}`)
const evidence = { capturedAt: new Date().toISOString(), origin, productId, sourceDigest, anonymousFirst: first, anonymousRepeat: repeat, malformedId, privateId: privateView }
mkdirSync('scripts/evidence', { recursive: true })
writeFileSync('scripts/evidence/public-market-detail.json', `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify(evidence, null, 2))
