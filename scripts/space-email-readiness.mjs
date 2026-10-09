#!/usr/bin/env node
// Read-only, aggregate-only evidence. This command never imports a sender or database client.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const PILOT = { spaceId: '9f58e07e-8912-4c3e-8551-d15b275dc768', slug: 'danieltyack', domain: 'danieltyack.com' }
const REQUIRED_CONTRACTS = {
  contacts: ['space_id', 'email', 'consent_state'],
  spaces: ['id', 'slug', 'status', 'email_enabled'],
  comms_messages: ['id', 'conversation_id'],
  notification_queue: ['id', 'status'],
  outreach_sends: ['id', 'space_id', 'resend_id'],
}
const SOURCE_PATHS = ['lib/email.ts', 'lib/spaces/email.ts', 'lib/spaces/audiences.ts', 'lib/comms/inbound.ts', 'app/api/webhooks/resend/route.ts']
const CONSENT_STATES = ['subscribed', 'unsubscribed', 'unknown']

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error(`Unexpected fields in ${label}; only aggregate evidence is accepted`)
}
export function validateObservation(raw) {
  exactKeys(raw, ['observedAt', 'provenance', 'spaceId', 'active', 'emailEnabled', 'contacts', 'consentCounts'], 'observation')
  if (raw.spaceId !== PILOT.spaceId) throw new Error('Observation must belong to the pilot Space')
  if (typeof raw.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw.observedAt) || !Number.isFinite(Date.parse(raw.observedAt))) throw new Error('Observation requires an ISO timestamp')
  if (!['read-only-aggregate', 'controlled-fixture'].includes(raw.provenance)) throw new Error('Unknown observation provenance')
  if (typeof raw.active !== 'boolean' || typeof raw.emailEnabled !== 'boolean') throw new Error('Space readiness flags must be boolean')
  if (!Number.isSafeInteger(raw.contacts) || raw.contacts < 0) throw new Error('Invalid aggregate contact count')
  exactKeys(raw.consentCounts, CONSENT_STATES, 'consent counts')
  if (CONSENT_STATES.some(k => !Number.isSafeInteger(raw.consentCounts[k]) || raw.consentCounts[k] < 0)) throw new Error('All consent states need nonnegative integer counts')
  if (CONSENT_STATES.reduce((n, k) => n + raw.consentCounts[k], 0) !== raw.contacts) throw new Error('Consent counts must reconcile with contacts')
  return raw
}

export function inspectSchemaContracts(schema) {
  return Object.entries(REQUIRED_CONTRACTS).map(([table, columns]) => {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const body = schema.match(new RegExp(`      ${escaped}: \\{\\s*Row: \\{([\\s\\S]*?)\\n        \\}`))?.[1] ?? ''
    const missing = columns.filter(column => !new RegExp(`^\\s+${column}:`, 'm').test(body))
    return { table, missing, state: missing.length ? 'missing' : 'present' }
  })
}

export function buildReadiness({ root, observation = null, now = new Date(), environment = {} }) {
  const checkedAt = now.toISOString()
  const obs = observation ? validateObservation(observation) : null
  if (obs && Date.parse(obs.observedAt) > now.getTime()) throw new Error('Observation timestamp is in the future')
  let commit = null
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch { /* no live source attestation */ }
  const source = SOURCE_PATHS.map(file => {
    try { return { file, state: readFileSync(path.join(root, file), 'utf8').length ? 'present' : 'missing' } } catch { return { file, state: 'missing' } }
  })
  let schema = []
  try { schema = inspectSchemaContracts(readFileSync(path.join(root, 'lib/database.types.ts'), 'utf8')) } catch { schema = inspectSchemaContracts('') }
  const configuredKeys = ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_CONVERSATION_FROM', 'CONVERSATION_REPLY_DOMAIN', 'RESEND_WEBHOOK_SECRET']
  const unknownConsent = obs?.consentCounts.unknown ?? null
  const deniedConsent = obs?.consentCounts.unsubscribed ?? null
  return {
    version: 1, checkedAt, pilot: PILOT,
    source: { commit, checks: source },
    schema: { kind: 'generated-source-contract', liveVerified: false, checks: schema },
    observation: obs ? { ...obs, precision: obs.observedAt.length === 10 ? 'date' : 'timestamp', freshQueryPerformed: false } : null,
    marketingAudience: {
      state: obs ? 'partial-eligibility-evidence' : 'not-observed',
      consentExcluded: obs ? unknownConsent + deniedConsent : null,
      unknownConsentExcluded: unknownConsent,
      consentGrantedUpperBound: obs?.consentCounts.subscribed ?? null,
      eligibleRecipients: null,
      reason: 'Granted consent is an upper bound; address validity, deduplication, topics and suppression must still be checked. Unknown consent never becomes marketing permission.',
    },
    provider: {
      configurationPresence: Object.fromEntries(configuredKeys.map(k => [k, Boolean(environment[k])])),
      domainVerification: 'not-observed', receivingVerification: 'not-observed', webhookSubscription: 'not-observed', quota: 'not-observed',
      reason: 'Configuration presence does not prove provider verification or the production configuration.',
    },
    liveEvidence: { authenticatedHeaders: 'not-observed', deliveredTest: 'not-observed', inboundReply: 'not-observed', answeredReply: 'not-observed', mailboxThreading: 'not-observed' },
    nextActions: ['Owner initiates one isolated test; never broadcast to the loaded contacts.', 'Record exact Resend sender/receiving verification and runtime configuration through authorized read-only inspection.', 'Capture redacted authentication, delivery and reply timestamps after the owner test.'],
    safety: { sendsPerformed: 0, databaseWritesPerformed: 0, consentChangesPerformed: 0, dnsChangesPerformed: 0 },
  }
}

export function main(args = process.argv.slice(2)) {
  const allowed = ['--json', '--observations']
  if (args.some((arg, i) => !allowed.includes(arg) && args[i - 1] !== '--observations')) throw new Error('Usage: space-email-readiness [--json] [--observations aggregate.json]')
  const at = args.indexOf('--observations')
  if (at >= 0 && (!args[at + 1] || args[at + 1].startsWith('--'))) throw new Error('--observations requires an aggregate JSON file')
  const observation = at < 0 ? null : JSON.parse(readFileSync(args[at + 1], 'utf8'))
  const report = buildReadiness({ root: process.cwd(), observation, environment: process.env })
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log('Space email readiness: live delivery and reply verification still required.')
    console.log(`Pilot: ${report.pilot.slug}; source ${report.source.commit ?? 'unavailable'}`)
    console.log(`Local schema: ${report.schema.checks.filter(c => c.state === 'present').length}/${report.schema.checks.length}; live schema unverified`)
    console.log(`Consent exclusions: ${report.marketingAudience.consentExcluded ?? 'unobserved'}; eligible recipients unverified`)
    console.log(`Observation: ${report.observation?.observedAt ?? 'not supplied'}; no fresh database query performed`)
    console.log('Provider domain, receiving, quota, headers and owner test: not observed')
    console.log('No sends, database writes, consent changes or DNS changes performed.')
  }
  return report.source.checks.some(c => c.state === 'missing') || report.schema.checks.some(c => c.state === 'missing') || !report.source.commit ? 1 : 0
}
if (invokedDirectly(import.meta.url)) {
  try { process.exitCode = main() } catch (error) { console.error(`Readiness evidence refused: ${error.message}`); process.exitCode = 2 }
}
