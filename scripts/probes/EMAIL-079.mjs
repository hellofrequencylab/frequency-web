#!/usr/bin/env node
// EMAIL-079: every email footer's "Manage emails" link opens a page that works. Found by the help center
// audit of 2026-11-18: a conversation reply linked every reader to a bare /manage-emails, and that page
// answered a link with no token "This link is invalid or expired." Reads source with comments stripped and
// checks the consequence. Exit 1 (FAIL) with the reasons while the defect stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const f = []

// 1. The reply template takes the recipient's link, in the html footer and the plain-text footer.
const TEMPLATE = 'lib/comms/email-template.ts'
const template = read(TEMPLATE)
if (/link\(`\$\{APP\}\/manage-emails`, 'Manage emails'\)/.test(template)) f.push(`${TEMPLATE}: the html footer links every reader to the bare /manage-emails`)
if (/Manage emails: \$\{APP\}\/manage-emails/.test(template)) f.push(`${TEMPLATE}: the plain-text footer links every reader to the bare /manage-emails`)
for (const fn of ['wrapEmailHtml', 'renderReplyEmail', 'renderCoalescedEmail', 'textFooter', 'footerHtml']) {
  const sig = template.match(new RegExp(`function ${fn}\\(([\\s\\S]*?)\\)\\s*:`))?.[1] ?? ''
  if (!/manageUrl/.test(sig)) f.push(`${TEMPLATE}: ${fn} takes no manage link`)
}

// 2. The link is signed for the member, in a category the page accepts, and cannot fail a send.
const LINK = 'lib/comms/manage-emails-link.ts'
const link = read(LINK)
if (!/export function conversationManageUrl\(/.test(link)) f.push(`${LINK}: no conversationManageUrl builds the signed link`)
if (!/buildManageEmailsUrl\(/.test(link)) f.push(`${LINK}: the link is not signed with buildManageEmailsUrl`)
if (!/try\s*\{[\s\S]*buildManageEmailsUrl\([\s\S]*\}\s*catch/.test(link)) f.push(`${LINK}: a signing failure would throw into the send`)

// 3. Every sender that knows the member passes the signed link.
const SENDERS = [
  ['lib/comms/outbound-batch.ts', 'renderCoalescedEmail'],
  ['lib/comms/conversation-compose.ts', 'renderReplyEmail'],
  ['lib/comms/inbound.ts', 'renderReplyEmail'],
  ['app/(main)/admin/crm/conversations/actions.ts', 'renderReplyEmail'],
  ['app/(main)/lead/inbox/actions.ts', 'renderReplyEmail'],
  ['app/(main)/spaces/[slug]/crm/conversations-actions.ts', 'renderReplyEmail'],
]
for (const [file, fn] of SENDERS) {
  const src = read(file)
  const calls = src.match(new RegExp(`${fn}\\([^\\n]*`, 'g')) ?? []
  if (!calls.length) f.push(`${file}: no ${fn} call found (the probe needs updating if the sender moved)`)
  else if (!calls.every((c) => /conversationManageUrl\(/.test(c))) f.push(`${file}: ${fn} is called with no signed Manage emails link`)
}

// 4. A link with no token is not called an error; a link whose params do not verify still fails closed.
const PAGE = 'app/manage-emails/page.tsx'
const page = read(PAGE)
const neutral = page.match(/if \(!p && !c && !t\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
if (!neutral) f.push(`${PAGE}: a link with no token gets the same state as a broken one`)
else {
  if (/invalid|expired/i.test(neutral)) f.push(`${PAGE}: the tokenless state still reads as an error`)
  if (!/<SettingsLink \/>/.test(neutral)) f.push(`${PAGE}: the tokenless state offers no settings button`)
  if (/[\u2014!]"/.test(neutral) || /\u2014/.test(neutral)) f.push(`${PAGE}: the tokenless copy breaks the voice rules`)
  if (/getPreferences|createAdminClient/.test(neutral)) f.push(`${PAGE}: the tokenless state reads the database`)
}
const after = page.slice(page.indexOf(neutral) + neutral.length)
if (!/verifyUnsubscribeToken\(/.test(after) || !/This link is invalid or expired\./.test(after)) f.push(`${PAGE}: a link whose params do not verify no longer fails closed`)

if (f.length) {
  console.log('FAIL EMAIL-079')
  for (const line of f) console.log(`  - ${line}`)
  process.exit(1)
}
console.log('PASS EMAIL-079')
