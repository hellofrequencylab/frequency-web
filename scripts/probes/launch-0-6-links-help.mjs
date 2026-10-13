// LIVE-915 probe (docs/LAUNCH-MARKETING-PLAN.md §14 Phase 0.6). Test-runner free, reads the tree.
// Consequences it measures:
//   1. Both "Open Mindless" doors land on /mindless, the public timer a signed-out reader can run,
//      and that route still exists.
//   2. The get-paid and billing help articles write their FAQ as `### Question?`, so extractFaq
//      (lib/help/content-core.ts) emits a FAQPage on the two money pages, and no bold-question
//      paragraph is left behind in either FAQ section.
//   3. The Space CRM article is Community Resonance (docs/NAMING.md) at its new slug, the old
//      slug 308s there, and no file links /help/spaces/space-crm any more.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const fails = []
const fail = (m) => fails.push(m)
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : (fail(`${f} is gone`), ''))

// 1. Mindless doors
if (!existsSync('app/(marketing)/mindless/page.tsx')) fail('/mindless has no page, so the doors would 404')
const doors = [
  ['lib/page-editor/templates/calm-down-fast.ts', /label: 'Open Mindless', href: '([^']+)'/],
  ['lib/page-editor/templates/the-quest.ts', /ctaLabel: 'Open Mindless',\s*ctaHref: '([^']+)'/],
]
for (const [f, re] of doors) {
  const m = read(f).match(re)
  if (!m) fail(`${f} has no "Open Mindless" link`)
  else if (m[1] !== '/mindless') fail(`${f} sends "Open Mindless" to ${m[1]}, not /mindless`)
}

// 2. FAQ headings on the money pages
for (const f of ['content/help/spaces/get-paid.md', 'content/help/spaces/billing.md']) {
  const body = read(f)
  const start = body.search(/^##\s+(questions|common questions|faq|frequently asked)/im)
  if (start === -1) {
    fail(`${f} has no FAQ section`)
    continue
  }
  const rest = body.slice(start).split('\n').slice(1)
  const end = rest.findIndex((l) => /^##\s/.test(l))
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n')
  const qs = section.match(/^###\s+.+\?\s*$/gm) ?? []
  if (qs.length < 3) fail(`${f} carries ${qs.length} \`### Question?\` headings in its FAQ, fewer than 3`)
  if (/^\*\*[^*]+\?\*\*/m.test(section)) fail(`${f} still writes a FAQ question as bold text`)
}

// 3. Community Resonance slug
const art = 'content/help/spaces/community-resonance.md'
if (!/^title: Community Resonance$/m.test(read(art))) fail(`${art} is not titled Community Resonance`)
if (existsSync('content/help/spaces/space-crm.md')) fail('content/help/spaces/space-crm.md still exists')
if (!/source: '\/help\/spaces\/space-crm',\s*destination: '\/help\/spaces\/community-resonance',\s*permanent: true/.test(read('next.config.ts')))
  fail('next.config.ts does not 308 /help/spaces/space-crm to /help/spaces/community-resonance')

const SKIP = new Set(['node_modules', '.next', '.git', '.claude', 'docs', 'coverage'])
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    if (SKIP.has(n)) return []
    const p = path.join(d, n)
    const st = statSync(p)
    if (st.isDirectory()) return walk(p)
    return /\.(md|mdx|ts|tsx|mjs|mts|js|json)$/.test(n) ? [p] : []
  })
let scanned = 0
for (const f of ['app', 'components', 'content', 'lib', 'scripts'].flatMap((d) => (existsSync(d) ? walk(d) : []))) {
  if (f === 'scripts/probes/launch-0-6-links-help.mjs') continue
  scanned++
  // A link is the path followed by a non-slug character; the redirect source in next.config.ts
  // is outside these trees, and a `content/help/...` path names the old file, not a URL.
  if (/(?<!content)\/help\/spaces\/space-crm(?![\w-])/.test(readFileSync(f, 'utf8'))) fail(`${f} links the old /help/spaces/space-crm slug`)
}
if (scanned < 500) fail(`only ${scanned} files scanned; the probe is reading the wrong tree`)

if (fails.length) {
  for (const m of fails) console.error(`LIVE-915: ${m}`)
  process.exit(1)
}
console.log(`ok: both Open Mindless doors land on /mindless; get-paid and billing write FAQs as ### Question?; Community Resonance is the article, the old slug 308s, and none of ${scanned} files links it`)
