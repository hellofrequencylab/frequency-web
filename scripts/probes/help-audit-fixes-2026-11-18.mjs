#!/usr/bin/env node
// The help center audit of 2026-11-18. One probe per finding it turned into a fix:
// `node scripts/probes/help-audit-fixes-2026-11-18.mjs <ID>`. Each reads source with comments stripped and
// checks the consequence the row names. Exit 1 (FAIL) while the defect stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const LINK = 'components/report-link.tsx'
const PROFILE = 'app/(main)/people/[handle]/page.tsx'
const COMMENTS = 'components/feed/post-replies.tsx'
const EVENT = 'app/(main)/events/[slug]/event-member-page.tsx'

// Every <ReportLink ... /> tag in a file, with the 400 characters before it (the guard that renders it).
const reportLinks = (src) => [...src.matchAll(/<ReportLink\b[^>]*\/>/g)].map((m) => ({
  tag: m[0],
  before: src.slice(Math.max(0, m.index - 400), m.index),
}))

const PROBES = {
  // A member can report a person, a comment and an event on the web, through the same dialog and the same
  // server action a post report uses, and never on their own profile, their own comment or their own event.
  'LIVE-2389': () => {
    const f = []
    const link = read(LINK)
    if (!link) f.push(`${LINK} is missing: nothing offers Report outside the post, Dispatch and guestbook menus`)
    else {
      if (!/import\(\s*'@\/components\/report-dialog'\s*\)/.test(link)) f.push(`${LINK} does not open the content report dialog (components/report-dialog.tsx) through a lazy import`)
      if (/^import [^\n]*from '@\/components\/report-dialog'/m.test(link)) f.push(`${LINK} imports the report dialog statically, so it ships with every comment thread`)
      if (!/>\s*(\{icon\}\s*)?Report\s*</.test(link)) f.push(`${LINK} does not carry the label "Report"`)
    }
    const dialog = read('components/report-dialog.tsx')
    if (!/reportContent\(targetType, targetId, reason/.test(dialog)) f.push('the content report dialog no longer files through reportContent')
    if (/within 24 hours/.test(dialog)) f.push('the report dialog still promises a review within 24 hours (owner ruling 2026-11-18: as soon as we can)')
    const action = read('app/(main)/feed/report-actions.ts')
    for (const kind of ['member', 'comment', 'event']) {
      if (!new RegExp(`VALID_TARGETS[^\\n]*'${kind}'`).test(action)) f.push(`reportContent no longer accepts a ${kind} target`)
    }

    const member = reportLinks(read(PROFILE)).filter((l) => /targetType="member"/.test(l.tag))
    if (!member.length) f.push('a member profile has no Report entry')
    else if (!member.every((l) => /!isOwner/.test(l.before))) f.push('the profile Report entry is not hidden on your own profile')

    const comment = reportLinks(read(COMMENTS)).filter((l) => /targetType="comment"/.test(l.tag))
    if (!comment.length) f.push('a comment has no Report entry')
    else if (!comment.every((l) => /myProfileId && author && author\.id !== myProfileId/.test(l.before))) f.push('the comment Report entry is not limited to a signed-in member on someone else\'s comment')

    const eventSrc = read(EVENT)
    const event = reportLinks(eventSrc).filter((l) => /targetType="event"/.test(l.tag))
    if (!event.length) f.push('an event page has no Report entry')
    else {
      if (!event.every((l) => /canReportEvent &&/.test(l.before))) f.push('the event Report entry is not behind the viewer check')
      const gate = eventSrc.match(/const canReportEvent = ([^\n]*)/)?.[1] ?? ''
      if (!/myProfileId/.test(gate) || !/!isHost/.test(gate)) f.push('the event Report entry shows to a signed-out viewer or to the event\'s own host')
    }
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`usage: node scripts/probes/help-audit-fixes-2026-11-18.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
const failures = probe()
if (failures.length) {
  console.log(`FAIL ${id}`)
  for (const line of failures) console.log(`  - ${line}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
