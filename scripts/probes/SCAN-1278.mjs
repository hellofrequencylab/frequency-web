// SCAN-1278: a missing event, help article or topic says noindex; /feed and /events/calendar are not
// search results; the site publishes a security contact.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []

if (!/export function missingPageMetadata[\s\S]{0,200}robots: \{ index: false, follow: true \}/.test(read('lib/seo/not-found-metadata.ts')))
  bad.push('there is no shared noindex metadata for a missing detail page')
for (const [file, title] of [
  ['app/(public)/events/[slug]/page.tsx', 'Event not found'],
  ['app/(help)/help/[category]/[slug]/page.tsx', 'Article not found'],
  ['app/discover/topics/[slug]/page.tsx', 'Topic not found'],
]) {
  if (!read(file).includes(`missingPageMetadata('${title}')`)) bad.push(`${file} answers a missing row with metadata that leaves "index, follow"`)
}
if (!/robots: \{ index: false, follow: true \}/.test(read('app/(main)/feed/page.tsx'))) bad.push('/feed answers a signed-out crawler as an indexable page')
if (!/robots: \{ index: false, follow: true \}/.test(read('app/(main)/events/calendar/page.tsx'))) bad.push('/events/calendar is indexable and not in the sitemap')
if (!/Contact: mailto:/.test(read('app/.well-known/security.txt/route.ts'))) bad.push('there is no /.well-known/security.txt')

if (bad.length) {
  console.error('SCAN-1278: ' + bad.join('; '))
  process.exit(1)
}
console.log('SCAN-1278: missing pages and member pages say noindex, and security.txt names a contact')
