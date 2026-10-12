#!/usr/bin/env node
// LIVE-884 probe: the public Market detail page (/market/<id>) is served from the shared ISR
// cache for anonymous visitors, while availability stays current and every mutation that
// changes a listing withdraws its cached HTML.
//
// Two halves, both required with --require-runtime:
//   1. SOURCE. The page exports `revalidate`, nothing reached from its render reads the session
//      (the only cookies() readers in its tree are the bookable-service slot readers, which run
//      for a service listing only), and the product / variant / storefront / review mutations
//      call revalidatePath for the detail route.
//   2. RUNTIME. scripts/evidence/public-market-detail.json, written by
//      scripts/capture-public-market-detail.mjs from outside the build: an anonymous first view
//      (MISS: the proxy sets the fq_mkt discovery stamp, so that response is private by design),
//      the repeat view with the stamp retained (HIT or PRERENDER with a public cache-control),
//      a malformed id and a private/unpublished id both answering 404, and a source digest that
//      matches the tree the evidence was captured from. Stale evidence fails.
//
// Exit 79 is the honest "no runtime evidence yet": the source half passed, the runtime half
// has not been captured for this tree.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const requireRuntime = process.argv.includes('--require-runtime')
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const fail = (m) => { console.error(`LIVE-884: ${m}`); process.exit(1) }

const PAGE = 'app/(public)/market/[id]/page.tsx'
const page = read(PAGE)
if (!page) fail(`${PAGE} is missing`)
if (!/^export const revalidate = \d+/m.test(page)) fail('the Market detail page does not export revalidate')
if (/export const dynamic\s*=\s*['"]force-dynamic['"]|\bcookies\(\)|\bheaders\(\)|unstable_noStore|\bnoStore\(/.test(page)) fail('the Market detail page reads the request at render')

// Session readers the page's own render must not call. The member slot readers (listOpenSlots,
// getSpaceBookingTimezone) resolve the viewer from the cookie, which made every service listing a
// per-request render; the page reads the public pair instead, after it confirmed the Space visible.
const RENDER_SESSION_READERS = ['getMyProfileId(', 'getCallerProfile(', 'requireUser(', 'getCurrentUser(', 'getViewerProfile(', 'listOpenSlots(', 'getSpaceBookingTimezone(']
for (const r of RENDER_SESSION_READERS) if (page.includes(r)) fail(`the Market detail page calls ${r} at render`)
if (!page.includes('listPublicOpenSlots(') || !page.includes('getPublicSpaceBookingTimezone(')) {
  fail('the Market detail page no longer reads service availability through the public readers')
}

// Every mutation that changes what the detail page shows withdraws it.
const MUTATION_FILES = ['app/(main)/marketplace/commerce-actions.ts', 'app/(main)/marketplace/review-actions.ts']
for (const f of MUTATION_FILES) {
  const src = read(f)
  if (!src) fail(`${f} is missing`)
  if (!/revalidatePath\(`\/market\/\$\{[a-zA-Z.]+\}`\)/.test(src)) fail(`${f} never withdraws /market/<id>`)
}

// Sources the evidence binds to. Any change here re-opens the runtime half.
const digestSources = [PAGE, ...MUTATION_FILES, 'proxy.ts', 'lib/commerce/marketplace-entry.ts', 'app/(public)/layout.tsx']
const digest = createHash('sha256').update(digestSources.map((f) => `${f}\n${read(f)}`).join('\n--\n')).digest('hex').slice(0, 16)
console.log(`ok: source half passes (digest ${digest})`)

if (!requireRuntime) process.exit(0)

const EVIDENCE = 'scripts/evidence/public-market-detail.json'
if (!existsSync(EVIDENCE)) {
  console.error(`LIVE-884: no runtime evidence at ${EVIDENCE}. Run node scripts/capture-public-market-detail.mjs <origin> <product-id> <private-or-unpublished-id> from a machine that can reach production, then commit the file.`)
  process.exit(79)
}
let ev
try { ev = JSON.parse(read(EVIDENCE)) } catch { fail(`${EVIDENCE} is not JSON`) }
if (ev.sourceDigest !== digest) {
  console.error(`LIVE-884: runtime evidence was captured from digest ${ev.sourceDigest}; the tree is now ${digest}. Re-capture.`)
  process.exit(79)
}
const isPublic = (cc) => /(^|,)\s*(public|s-maxage=\d+)/i.test(String(cc ?? ''))
const first = ev.anonymousFirst ?? {}
const repeat = ev.anonymousRepeat ?? {}
if (first.status !== 200) fail(`anonymous first view answered ${first.status}, not 200`)
if (!/^(MISS|HIT|PRERENDER|STALE)$/.test(String(first.xVercelCache ?? ''))) fail(`anonymous first view carried x-vercel-cache ${first.xVercelCache}`)
if (repeat.status !== 200) fail(`anonymous repeat view answered ${repeat.status}, not 200`)
if (!/^(HIT|PRERENDER|STALE)$/.test(String(repeat.xVercelCache ?? ''))) fail(`anonymous repeat view was ${repeat.xVercelCache}, not served from the shared cache`)
if (!isPublic(repeat.cacheControl)) fail(`anonymous repeat view cache-control is ${repeat.cacheControl}, not public`)
if (repeat.setCookie) fail('anonymous repeat view set a cookie, so the edge could not have cached it')
if ((ev.malformedId ?? {}).status !== 404) fail(`a malformed id answered ${ev.malformedId?.status}, not 404`)
if ((ev.privateId ?? {}).status !== 404) fail(`a private/unpublished id answered ${ev.privateId?.status}, not 404`)
if (typeof ev.capturedAt !== 'string' || Number.isNaN(Date.parse(ev.capturedAt))) fail('evidence has no capturedAt')
console.log(`ok: runtime half passes (captured ${ev.capturedAt} from ${ev.origin}: first ${first.xVercelCache}, repeat ${repeat.xVercelCache}, 404s hold)`)
