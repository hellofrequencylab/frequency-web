#!/usr/bin/env node
// email:samples (EMAIL-026): mail every stock template to one inbox, so the whole set can be read in a
// real mail client. Renders the catalog (lib/email-samples/catalog.ts) through its test with
// EMAIL_SAMPLES_OUT set, then posts each rendered email to Resend's REST API with EMAIL_FROM.
//
//   pnpm email:samples --to you@example.com            send the whole set
//   pnpm email:samples --to you@example.com --only welcome,this-week
//   pnpm email:samples --dry                           render only; print the index, send nothing
//
// Needs RESEND_API_KEY in the environment, the key of the Resend account that verifies the sending
// domains (send.frequencylocal.com and the conversational address), and EMAIL_FROM / EMAIL_CONVERSATION_FROM
// as the app sends with. Each sample goes out with the From header its template uses in production. Nothing is queued and nothing touches the database. Sends are spaced to stay under
// Resend's rate limit. Cost beats speed: one process, no new dependency.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const arg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] ?? '' : ''
}
const dry = args.includes('--dry')
const to = arg('--to').trim()
const only = new Set(arg('--only').split(',').map((s) => s.trim()).filter(Boolean))

if (!dry && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('usage: pnpm email:samples --to you@example.com [--only id,id] | --dry')
  process.exit(2)
}

const out = mkdtempSync(join(tmpdir(), 'email-samples-'))
const render = spawnSync('pnpm', ['vitest', 'run', 'lib/email-samples/catalog.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, EMAIL_SAMPLES_OUT: out },
})
if (render.status !== 0) {
  console.error('the catalog did not render; fix the test above before sending')
  process.exit(1)
}

const all = JSON.parse(readFileSync(join(out, 'catalog.json'), 'utf8'))
const set = only.size ? all.filter((r) => only.has(r.id)) : all
console.log(`\n${set.length} of ${all.length} stock templates rendered to ${out}`)
for (const r of set) console.log(`  ${r.group.padEnd(22)} ${r.id.padEnd(32)} ${r.subject}  [from ${r.from}]`)
if (dry) process.exit(0)

const key = process.env.RESEND_API_KEY
if (!key) {
  console.error('RESEND_API_KEY must be set to send')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let sent = 0
let failed = 0
for (const [i, r] of set.entries()) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // The production From for this template (the catalog's sampleFrom): the platform sender, or a
      // Space's name over the shared verified address, or the conversational address.
      from: r.from,
      to: [to],
      subject: `[Sample ${i + 1}/${set.length}: ${r.group}] ${r.subject}`,
      html: r.html,
      ...(r.text ? { text: r.text } : {}),
      tags: [{ name: 'origin', value: 'email_samples' }],
    }),
  })
  if (res.ok) {
    sent += 1
    console.log(`  sent    ${r.id}`)
  } else {
    failed += 1
    const body = await res.text()
    console.error(`  failed  ${r.id}: ${res.status} ${body}`)
    // A 403 is the account, not the email (an unverified From domain, a bad key): every send would fail
    // the same way, so stop here instead of printing it forty more times.
    if (res.status === 403 || res.status === 401) {
      console.error('\nstopping: fix the From domain or the key, then run again')
      break
    }
  }
  // Resend allows two requests a second; stay well under it.
  await sleep(700)
}
console.log(`\n${sent} sent, ${failed} failed, to ${to}`)
process.exit(failed ? 1 : 0)
