#!/usr/bin/env node
// Mail-deliverability DNS, measured rather than assumed (OWN-020).
//
// This row kept costing round trips: someone reads a dashboard, writes a sentence into the backlog,
// and the sentence outlives the fact. Three of the five items on OWN-020 turned out to be ALREADY
// DONE when finally measured, and the two that were real were not the two the row named. So the fix
// is an instrument, not another sentence: one command, a verdict per row, and no interpretation.
//
// It reads PUBLIC DNS only. No API keys, no dashboard access, nothing to leak — which is the whole
// point, because the dashboard state is exactly what an agent container cannot see and the DNS
// consequence is exactly what it can.
//
// Usage:  node scripts/check-mail-dns.mjs [--json]
// Exit 0 when every row passes, 1 when any fails, 2 when DNS itself could not be reached (which is
// NOT a failure of the records — an unreachable resolver must never read as a missing record).

import { promises as dns } from 'node:dns'
import { isHostOrSubdomainOf, rsaBits } from './mail-dns-lib.mjs'

const APEX = 'frequencylocal.com'
/** The Resend domain — proven by DKIM living at `resend._domainkey.<it>` and NOT at the apex. */
const SEND = `send.${APEX}`
/**
 * The MAIL FROM / Return-Path domain, and the ONLY name whose SPF a receiver consults.
 *
 * 🔴 THIS LINE IS THE WHOLE POINT OF THE 2026-08-25 CORRECTION. The first version of this script
 * checked SPF on SEND — the From: header domain — found none, and reported a missing record that
 * was never needed there. SPF is evaluated against the envelope sender, which for a Resend domain
 * `X` is `send.X`; so for `send.frequencylocal.com` it is `send.send.frequencylocal.com`. That name
 * already carried SPF, already correctly, and the "fix" cost the owner a trip to GoDaddy and very
 * nearly cost them two load-bearing records to a cleanup I recommended on the same wrong premise.
 *
 * The tell is in the zone and the script now asserts it: a MAIL FROM subdomain MXes to
 * `feedback-smtp.<region>.amazonses.com`, SES's bounce and complaint host, which appears nowhere
 * else. Measure the name the protocol reads, not the name the human recognises.
 */
const MAILFROM = `send.${SEND}`
const DKIM = `resend._domainkey.${SEND}`

/** Flatten node's TXT shape (array of chunk-arrays) into whole strings. */
const txt = (rows) => rows.map((chunks) => chunks.join(''))

async function lookup(fn, name) {
  try {
    return { ok: true, value: await dns[fn](name) }
  } catch (e) {
    // ENODATA / ENOTFOUND are ANSWERS: the name resolves and carries no such record.
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') return { ok: true, value: [] }
    return { ok: false, error: e.code ?? String(e) }
  }
}



/**
 * Does this name publish an SPF record that authorises Amazon SES, following `include:` hops?
 *
 * GoDaddy flattens SPF through its own `_spfm` merge host, so the record on the MAIL FROM domain
 * reads `include:dc-<id>._spfm.<name>` and only the NEXT hop names amazonses. A checker that
 * string-matched the first record would call a correct zone broken.
 */
async function spfAuthorises(name, target, depth = 0) {
  if (depth > 3) return { ok: true, found: false, chain: [] }
  const r = await lookup('resolveTxt', name)
  if (!r.ok) return { ok: false, error: r.error }
  const spf = txt(r.value).find((t) => t.startsWith('v=spf1'))
  if (!spf) return { ok: true, found: false, chain: [] }
  // SPF is a list of whitespace-separated terms. Split it and read each `include:` term whole,
  // rather than searching the record for a pattern — see isHostOrSubdomainOf above for why.
  const includes = spf
    .split(/\s+/)
    .filter((t) => t.toLowerCase().startsWith('include:'))
    .map((t) => t.slice('include:'.length))
  if (includes.some((inc) => isHostOrSubdomainOf(inc, target))) {
    return { ok: true, found: true, chain: [spf] }
  }
  for (const inc of includes) {
    const next = await spfAuthorises(inc, target, depth + 1)
    if (!next.ok) return next
    if (next.found) return { ok: true, found: true, chain: [spf, ...next.chain] }
  }
  return { ok: true, found: false, chain: [spf] }
}

const rows = []
const add = (name, pass, detail, fix) => rows.push({ name, pass, detail, fix })

const [apexTxt, sendMx, mailFromMx, mailFromSpf, dkimTxt, dmarcTxt] = await Promise.all([
  lookup('resolveTxt', APEX),
  lookup('resolveMx', SEND),
  lookup('resolveMx', MAILFROM),
  spfAuthorises(MAILFROM, 'amazonses.com'),
  lookup('resolveTxt', DKIM),
  lookup('resolveTxt', `_dmarc.${APEX}`),
])

const unreachable = [apexTxt, sendMx, mailFromMx, mailFromSpf, dkimTxt, dmarcTxt].filter((r) => !r.ok)
if (unreachable.length) {
  console.error(`✖ DNS unreachable (${unreachable.map((u) => u.error).join(', ')}). Records NOT measured.`)
  process.exit(2)
}

// 1. Domain verified + isolated on a sending subdomain. Resend issues neither record until
//    verification completes, so their presence IS the verification signal.
const mx = sendMx.value.map((m) => m.exchange)
add(
  'subdomain isolation',
  mx.some((h) => isHostOrSubdomainOf(h, 'amazonaws.com')),
  mx.length ? `${SEND} MX -> ${mx.join(', ')}` : `${SEND} has no MX`,
  'Verify the sending domain in Resend; it publishes the MX itself.',
)

// 2. The MAIL FROM domain exists — SES's feedback host is the fingerprint, and it is what makes
//    row 3 measurable at all. Without it there is no envelope-sender domain to check SPF on.
const mfMx = mailFromMx.value.map((m) => m.exchange)
add(
  'MAIL FROM subdomain configured',
  mfMx.some((h) => isHostOrSubdomainOf(h, 'amazonses.com') && h.toLowerCase().startsWith('feedback-smtp.')),
  mfMx.length ? `${MAILFROM} MX -> ${mfMx.join(', ')}` : `${MAILFROM} has no MX`,
  'Resend publishes this when a custom MAIL FROM is set on the domain.',
)

// 3. SPF on the ENVELOPE SENDER, following include: hops. This is the row that was measured on the
//    wrong name until 2026-08-25 — see MAILFROM above.
add(
  'SPF authorises SES on the envelope sender',
  mailFromSpf.found,
  mailFromSpf.chain.length
    ? `${MAILFROM} -> ${mailFromSpf.chain.map((c) => `"${c}"`).join('  ->  ')}`
    : `${MAILFROM} publishes NO SPF TXT`,
  'Resend publishes v=spf1 include:amazonses.com ~all on the MAIL FROM subdomain.',
)

// 3. DKIM key strength. Google and Yahoo's bulk-sender rules call for 2048-bit.
const dkim = txt(dkimTxt.value).find((t) => t.includes('p='))
const p = dkim?.match(/p=([A-Za-z0-9+/=]+)/)?.[1]
const bits = p ? rsaBits(p) : null
add(
  'DKIM key is 2048-bit',
  bits !== null && bits >= 2048,
  dkim ? `${DKIM} -> ${bits ?? 'unparseable'}-bit RSA` : `${DKIM} publishes no key`,
  'KNOWN AND NOT ACTIONABLE (OWN-020): Resend documents no key-strength choice and no rotation '
    + 'control, and 1024-bit PASSES — Google and Yahoo require DKIM present and passing, and only '
    + 'RECOMMEND 2048. Raise with Resend support if volume ever makes it matter. Do not go hunting '
    + 'for a dashboard button; there is not one.',
)

// 4. DMARC at the apex, enforcing. No subdomain record means sp defaults to p, which is the
//    correct shape — the sending subdomain inherits the policy rather than escaping it.
const dmarc = txt(dmarcTxt.value).find((t) => t.startsWith('v=DMARC1'))
const policy = dmarc?.match(/\bp=(\w+)/)?.[1]
add(
  'DMARC enforcing at the apex',
  !!dmarc && policy !== 'none',
  dmarc ? `_dmarc.${APEX} -> p=${policy}${/\brua=/.test(dmarc) ? ', rua set' : ', NO rua'}` : 'no DMARC record',
  'Publish v=DMARC1; p=quarantine; rua=mailto:… at _dmarc.',
)

// 5. The apex sends Workspace mail and nothing else. Stated so a future reader does not "fix" it by
//    adding amazonses here, which would undo the isolation row 1 checks for.
const apexSpf = txt(apexTxt.value).find((t) => t.startsWith('v=spf1'))
add(
  'apex SPF is Workspace-only',
  !!apexSpf && !apexSpf.split(/\s+/).some((t) => t.toLowerCase().startsWith('include:') && isHostOrSubdomainOf(t.slice('include:'.length), 'amazonses.com')),
  apexSpf ? `${APEX} TXT "${apexSpf}"` : `${APEX} publishes no SPF`,
  'The apex sends Google Workspace mail. Product mail belongs on the subdomain, not here.',
)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 2))
} else {
  const w = Math.max(...rows.map((r) => r.name.length))
  for (const r of rows) {
    console.log(`  ${r.pass ? '\x1b[32m✅\x1b[0m' : '\x1b[31m🔴\x1b[0m'} ${r.name.padEnd(w)}  ${r.detail}`)
    if (!r.pass) console.log(`     \x1b[2m↳ ${r.fix}\x1b[0m`)
  }
  const failed = rows.filter((r) => !r.pass)
  console.log(
    failed.length
      ? `\n  ${failed.length} of ${rows.length} row(s) need a DNS change. Nothing here is broken today; these are at-volume reputation items.`
      : `\n  \x1b[32m✓ mail DNS: all ${rows.length} rows pass.\x1b[0m`,
  )
}
process.exit(rows.every((r) => r.pass) ? 0 : 1)
