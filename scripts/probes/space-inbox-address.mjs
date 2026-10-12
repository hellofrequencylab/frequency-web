// EMAIL-022 probe: every Space can have hello@<slug>.<root>. Runs the REAL pure core (no test runner,
// LIVE-475): the address and domain rules, the recipient matcher the inbound webhook routes on, the
// provider-record to zone-record mapping, the verification state, and the From line. Then reads the two
// seams as source: the inbound router resolves the Space address BEFORE the signed alias, and the Space
// default-identity resolver falls back to the inbox From. Last, the consequence the row is open for: the
// switch on in production with the pilot observed, read from the row's own evidence through the ledger
// loader (never the raw file). Until that line is appended, this probe fails and the row stays open.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/space-inbox-address.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadBacklog } from '../../scripts/lib/ledger.mjs'
import {
  SPACE_INBOX_LOCAL_PART, spaceInboxDomain, spaceInboxAddress, spaceInboxFromLine, matchSpaceInboxRecipient,
  providerRecordsToZoneRecords, inboxStateFromProvider, inboxStateLabel, normalizeInboxRoot,
} from '../../lib/comms/space-inbox-address-core.ts'

// ── The address: a fixed local part on <slug>.<root>, and only a DNS-label slug qualifies ──────────
assert.equal(SPACE_INBOX_LOCAL_PART, 'hello')
assert.equal(spaceInboxDomain('Labs', 'FrequencyLocal.com'), 'labs.frequencylocal.com')
assert.equal(spaceInboxAddress('labs.frequencylocal.com'), 'hello@labs.frequencylocal.com')
assert.equal(spaceInboxDomain('-bad', 'frequencylocal.com'), null)
assert.equal(spaceInboxDomain('a.b', 'frequencylocal.com'), null)
assert.equal(spaceInboxDomain('labs', 'not a domain'), null)
assert.equal(normalizeInboxRoot(' '), null)
assert.equal(spaceInboxFromLine('Labs Collective', 'hello@labs.frequencylocal.com'), 'Labs Collective <hello@labs.frequencylocal.com>')
assert.equal(spaceInboxFromLine('  ', 'hello@labs.frequencylocal.com'), null)

// ── The matcher: one Space address routes; the root, a deeper host, or two Spaces do not ──────────
assert.deepEqual(matchSpaceInboxRecipient(['Labs <Hello@Labs.FrequencyLocal.com>', 'hello@labs.frequencylocal.com'], 'frequencylocal.com'),
  { kind: 'match', domain: 'labs.frequencylocal.com', localPart: 'hello', address: 'hello@labs.frequencylocal.com' })
assert.deepEqual(matchSpaceInboxRecipient(['hello@frequencylocal.com'], 'frequencylocal.com'), { kind: 'none' })
assert.deepEqual(matchSpaceInboxRecipient(['hello@a.labs.frequencylocal.com'], 'frequencylocal.com'), { kind: 'none' })
assert.deepEqual(matchSpaceInboxRecipient(['reply+1-abc@reply.frequencylocal.com'], 'frequencylocal.com'), { kind: 'none' })
assert.deepEqual(matchSpaceInboxRecipient(['hello@labs.frequencylocal.com', 'hello@other.frequencylocal.com'], 'frequencylocal.com'), { kind: 'ambiguous' })
assert.deepEqual(matchSpaceInboxRecipient(['hello@labs.frequencylocal.com'], null), { kind: 'none' })
assert.deepEqual(matchSpaceInboxRecipient(['hello@labs.frequencylocal.com'], ''), { kind: 'none' })

// ── Provider records land in the ROOT zone with names relative to it ──────────────────────────────
const zone = providerRecordsToZoneRecords('labs.frequencylocal.com', 'frequencylocal.com', [
  { record: 'Receiving', type: 'MX', name: '@', value: 'inbound-smtp.resend.com.', priority: 10 },
  { record: 'SPF', type: 'TXT', name: 'send', value: 'v=spf1 include:amazonses.com ~all' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.labs.frequencylocal.com', value: 'p=key' },
  { record: 'Tracking', type: 'A', name: 'track', value: '1.2.3.4' },
])
assert.deepEqual(zone.map(r => [r.type, r.name, r.value, r.mxPriority]), [
  ['MX', 'labs', 'inbound-smtp.resend.com', 10],
  ['TXT', 'send.labs', 'v=spf1 include:amazonses.com ~all', undefined],
  ['TXT', 'resend._domainkey.labs', 'p=key', undefined],
])

// ── Verified means verified AND receiving on; anything else waits or needs attention ──────────────
assert.equal(inboxStateFromProvider({ status: 'verified', capabilities: { sending: 'enabled', receiving: 'enabled' } }), 'verified')
assert.equal(inboxStateFromProvider({ status: 'verified', capabilities: { sending: 'enabled', receiving: 'disabled' } }), 'pending')
assert.equal(inboxStateFromProvider({ status: 'failed', capabilities: { sending: 'enabled', receiving: 'enabled' } }), 'failed')
assert.equal(inboxStateFromProvider({ status: 'pending' }), 'pending')
assert.equal(inboxStateLabel('verified'), 'Ready'); assert.equal(inboxStateLabel('paused'), 'Needs attention'); assert.equal(inboxStateLabel(null), 'Not set up')

// ── The seams, read as source ─────────────────────────────────────────────────────────────────────
const inbound = readFileSync(new URL('../../lib/comms/inbound.ts', import.meta.url), 'utf8')
const inboxAt = inbound.indexOf('resolveSpaceInboxRoute(parsed.recipients)')
const aliasAt = inbound.indexOf('resolveTenantReplyAlias(parsed.recipients)')
assert.ok(inboxAt > 0 && aliasAt > inboxAt, 'the Space address resolves before the signed alias')
assert.ok(inbound.includes("quarantineSpaceInboxMessage(inbox.reason"), 'an unknown or unverified address quarantines')
const onboarding = readFileSync(new URL('../../lib/spaces/email-domain-onboarding.ts', import.meta.url), 'utf8')
assert.ok(onboarding.includes('resolveSpaceInboxFrom(spaceId)'), 'the default identity falls back to the Space inbox From')
const runbook = readFileSync(new URL('../../docs/RUNBOOKS.md', import.meta.url), 'utf8')
assert.ok(runbook.includes('SPACE_INBOX_ADDRESSES_ENABLED') && runbook.includes('### Space inbox address (EMAIL-022)'), 'the switch has its activation gate')
// ── The consequence: live in production, pilot observed ───────────────────────────────────────────
const row = loadBacklog().entries.find(r => r.id === 'EMAIL-022')
assert.ok(row, 'EMAIL-022 is in the ledger')
const evidence = `${row.verify?.evidence ?? ''}\n${row.detail ?? ''}`
assert.ok(/SWITCH ON IN PRODUCTION \d{4}-\d{2}-\d{2}/.test(evidence) && /PILOT OBSERVED/.test(evidence),
  'EMAIL-022 stays open until its evidence records "SWITCH ON IN PRODUCTION <date>" and "PILOT OBSERVED" (one outside mail into a new Space conversation, one reply from hello@<slug>.frequencylocal.com)')
console.log('space-inbox-address: ok')
