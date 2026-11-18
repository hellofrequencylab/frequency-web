#!/usr/bin/env node
// LIVE-2354: Frequency's courses have a public, indexable home, and the Business of Community has a
// sales page. Checks the consequence in source:
//   1. /courses and /courses/business-of-community are advertised in the sitemap and llms.txt.
//   2. The sales page is an editable page whose template renders, with Course schema on the route.
//   3. Course cards never link to the robots-disallowed /journeys/* member route.
//   4. The Funnel's cohort tag is registered, and its SQL lands the member on the Week 1 workshop event
//      (owner 2026-11-17: the course is a live workshop run in cohorts, not self-paced).
//   5. SpacePractices `only` also matches a journey's category.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const sitemap = read('app/sitemap.ts')
for (const p of ['/courses`', '/courses/business-of-community`']) {
  if (!sitemap.includes('${SITE_URL}' + p)) fails.push(`sitemap does not advertise ${p.slice(0, -1)}`)
}
const llms = read('app/llms.txt/route.ts')
if (!llms.includes("path: '/courses'") || !llms.includes("path: '/courses/business-of-community'")) fails.push('llms.txt does not list both course pages')

const route = 'app/(marketing)/courses/business-of-community/page.tsx'
if (!existsSync(new URL(route, root))) fails.push(`${route} is missing`)
else if (!/courseSchema\(/.test(read(route)) || !/<BlockRender/.test(read(route))) fails.push('the sales page lacks Course schema or the block render path')
if (!/slug: 'business-of-community'.*path: '\/courses\/business-of-community'/.test(read('lib/page-editor/data.ts'))) fails.push('business-of-community is not an EDITABLE_PAGES slug')
if (!/'business-of-community': businessOfCommunity/.test(read('lib/page-editor/templates/index.ts'))) fails.push('the sales template is not registered')
if (!read('lib/page-editor/templates/business-of-community.ts').includes("'/join?seq=business-of-community'")) fails.push('Save your seat does not go to the Funnel')

if (!existsSync(new URL('app/(marketing)/courses/page.tsx', root))) fails.push('/courses is missing')
const tracks = read('lib/courses/tracks.ts')
// 2026-11-18 (owner: one home per course): a card links to the course's own /courses page, and the public
// Journey page names that page as its canonical, so the two never compete in search.
if (!tracks.includes('`/courses/${slug}`')) fails.push('course cards do not link to the course page')
if (!read('app/discover/journeys/[slug]/page.tsx').includes('courseHref(plan.slug)')) fails.push('the public Journey page of a course does not name its course page as canonical')
if (/['`]\/journeys\//.test(tracks + read('components/frequency/site/pages/courses/courses.tsx'))) fails.push('a course card links to /journeys/*')

if (!read('lib/traits/registry.ts').includes("key: 'beta_business_of_community'")) fails.push('the Funnel tag is not registered')
const sql = read('scripts/seed-boc-funnel.sql')
if (!sql.includes('"marketingTag": "beta_business_of_community"') || !sql.includes('"url": "/events/business-of-community-pilot-session-1"')) fails.push('the Funnel SQL lacks its tag or Week 1 event destination')

if (!/\(j\.category \?\? ''\)/.test(read('components/page-editor/blocks/profile.tsx'))) fails.push('SpacePractices only does not match category')
if (!read('lib/spaces/content-data.ts').includes('category: j.category ?? null')) fails.push('SpacePractices items do not carry category')

if (fails.length) {
  console.error(`LIVE-2354 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2354 ok: /courses and the Business of Community sales page are live, advertised and wired to the Funnel')
