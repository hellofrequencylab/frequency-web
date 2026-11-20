// SCAN-1276: the AI corpus and the public pages point crawlers at addresses that open, not at a
// sign-in wall or a redirect.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const read = (f) => readFileSync(f, 'utf8')
const bad = []

const helpFiles = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.md')) helpFiles.push(p)
  }
}
walk('content/help')
for (const f of helpFiles) if (/\]\(\/networks[)#?]/.test(read(f))) bad.push(`${f} links /networks, which redirects to /for/networks`)

const route = read('app/llms-full.txt/route.ts')
if (!/publicCorpusLinks\((?:a\.)?body/.test(route)) bad.push('llms-full.txt does not pass help bodies through publicCorpusLinks')
let links = ''
try {
  links = read('lib/seo/corpus-links.ts')
} catch {
  bad.push('lib/seo/corpus-links.ts is missing')
}
for (const p of ['/founder', '/journal', '/rewards', '/upgrade', '/on-air'])
  if (links && !links.includes(`'${p}'`)) bad.push(`the corpus still links ${p}, a member-only page`)
if (links && !/publicIndexTwin\(/.test(links)) bad.push('the corpus does not point /circles at its public listing')

const event = read('app/(public)/events/[slug]/page.tsx')
if (/discover\/circles\/\$\{event\.circle_id\}/.test(event)) bad.push('the event page links its Circle by id, a redirect')

const spaces = read('components/frequency/site/pages/discover/spaces.tsx')
if (!/href=\{`\/partners\/\$\{p\.slug\}`\}[\s\S]{0,200}rel="nofollow"/.test(spaces)) bad.push('/discover/spaces sends crawlers to member partner pages')

if (!read('app/robots.ts').includes('"/support$"')) bad.push('robots.txt lets crawlers follow /support, a member page that bounces home')

if (bad.length) {
  console.error('SCAN-1276: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1276: the corpus and public pages link only addresses a signed-out reader can open')
