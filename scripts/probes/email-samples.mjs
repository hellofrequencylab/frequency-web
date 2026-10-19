// EMAIL-026 probe: the stock email catalog covers every transactional sender and builder in lib/email.ts,
// so a new template cannot ship without a sample (and without the catalog test's footer and voice checks).
// Also reads the sender script and the package script that mails the set.
//
//   node scripts/probes/email-samples.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const email = readFileSync('lib/email.ts', 'utf8')
const catalog = readFileSync('lib/email-samples/catalog.ts', 'utf8')

// Every exported sender (send*Email) and payload builder (build*Email) in lib/email.ts. sendRawEmail is the
// provider transport, not a template.
const senders = [...email.matchAll(/^export (?:async )?function ((?:send|build)[A-Za-z]+Email)\(/gm)].map((m) => m[1]).filter((n) => n !== 'sendRawEmail')
assert.ok(senders.length >= 25, `expected the lib/email.ts sender list, found ${senders.length}`)
const missing = senders.filter((name) => !new RegExp(`\\b${name}\\(`).test(catalog))
assert.deepEqual(missing, [], `lib/email-samples/catalog.ts has no sample for: ${missing.join(', ')}`)

// The other shells the catalog must show: the block shell, the plain shell, the Space campaign render,
// the receipts and the conversation wrapper.
for (const seam of ['compileEmailDoc(', 'plainTextEmail(', 'renderCampaignHtml(', 'receiptHtml(', 'renderReplyEmail(', 'renderCoalescedEmail(']) {
  assert.ok(catalog.includes(seam), `the catalog does not render through ${seam}`)
}
// The showcase places the three data cards (EMAIL-025).
for (const id of ['eventCard', 'circleCard', 'productCard']) assert.ok(catalog.includes(`['${id}']`), `the showcase email does not place ${id}`)

const test = readFileSync('lib/email-samples/catalog.test.ts', 'utf8')
assert.ok(/vi\.mock\('@\/lib\/queue\/outbox'/.test(test), 'the catalog test does not mock the outbox (a sample run would queue real mail)')
assert.ok(/EMAIL_SAMPLES_OUT/.test(test), 'the catalog test cannot write the rendered set')

const script = readFileSync('scripts/email-samples.mjs', 'utf8')
assert.ok(/api\.resend\.com\/emails/.test(script) && /EMAIL_SAMPLES_OUT/.test(script), 'scripts/email-samples.mjs does not render then send')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(pkg.scripts['email:samples'], 'node scripts/email-samples.mjs', 'package.json has no email:samples script')

console.log(`EMAIL-026: the catalog samples all ${senders.length} lib/email.ts senders plus the block, plain, campaign, receipt and reply shells.`)
