// SPACE INBOX ADDRESS, the IO half (EMAIL-022). The rules live in space-inbox-address-core.ts.
//
// WHAT THIS IS. Every Space can have `hello@<slug>.<SPACE_EMAIL_INBOX_ROOT>`: a real address people can
// write to, and the From and Reply-To the Space's conversations go out with once it is verified. It is
// NOT the signed per-thread alias (EMAIL-013): that still rides underneath as the Reply-To on a thread
// that has one, binding a reply to its exact conversation. The Space address is the public door; a mail
// to it opens a NEW conversation in the Space with the sender as the counterpart.
//
// HOW IT IS BUILT. Resend receives mail for every address on a verified domain once its MX record
// points at Resend, and each subdomain is its own domain there. So provisioning is: create the
// `<slug>.<root>` domain at Resend with receiving on, write the records it returns (MX, SPF TXT, DKIM)
// into the <root> zone Vercel hosts, store the row, ask Resend to verify. The owner presses one button
// and never sees a DNS record.
//
// SWITCHES. SPACE_INBOX_ADDRESSES_ENABLED (envFlag) turns provisioning, the Settings card and the
// outbound From on. SPACE_EMAIL_INBOX_ROOT names the zone. Inbound ROUTING reads only the root, so an
// address that was verified keeps receiving when the switch is turned off (the same posture as the
// EMAIL-013 aliases: issuance is switched, routes stay routable).
//
// FINISHES ON ITS OWN. The owner presses the button once. The space-inbox-verify cron
// (app/api/cron/space-inbox-verify, every 15 minutes) then takes every pending row the rest of the way:
// a row whose records were never written (dns_written_at null) is provisioned again, a row whose
// records are in the zone is checked against the provider, until it reads verified. Nobody presses
// Check again; the card keeps the button for the impatient.
//
// FAIL-SAFE. provisionSpaceInboxAddress and checkSpaceInboxAddress never throw to the caller: they return
// a result with a member-safe sentence. resolveSpaceInboxFrom returns null on any miss so the compose
// path falls back to the Frequency sender. The inbound half throws only where the alias router throws
// (a lookup or write fault), which the webhook answers with a 5xx so the provider redelivers.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { envFlag, envStringOrNull } from '@/lib/env/string'
import { escapeLike } from '@/lib/search-sanitize'
import { upsertZoneDnsRecords, vercelDomainsConfigured } from '@/lib/sites/vercel-domains'
import {
  createEmailProviderInboxDomain,
  findEmailProviderDomainByName,
  inspectEmailProviderDomain,
  requestEmailProviderVerification,
} from '@/lib/spaces/email-domain-provider'
import { appendConversationMessage, openOrGetConversation } from './conversations'
import { quarantineTenantReplyAlias } from './tenant-reply-alias'
import {
  inboxStateFromProvider,
  matchSpaceInboxRecipient,
  normalizeInboxRoot,
  providerRecordsToZoneRecords,
  spaceInboxZone,
  spaceInboxAddress,
  spaceInboxDomain,
  spaceInboxFromLine,
  SPACE_INBOX_LOCAL_PART,
  type ProviderDnsRecord,
  type SpaceInboxState,
  type ZoneRecord,
} from './space-inbox-address-core'

interface SpaceInboxAddressRow {
  id: string
  space_id: string
  domain: string
  local_part: string
  provider_domain_id: string | null
  state: SpaceInboxState
  dns_records: ZoneRecord[]
  /** When the zone write last returned ok (migration 20270346008500). Null until written, and
   *  cleared when a write fails, so the verify cron knows whether to provision again or only check. */
  dns_written_at: string | null
  created_at: string
  verified_at: string | null
  updated_at: string
}

export type SpaceInboxResult =
  | { ok: true; address: string; state: SpaceInboxState; message: string }
  | { ok: false; message: string }

type Result = { data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }
type ListResult = { data: Record<string, unknown>[] | null; error: { code?: string; message?: string } | null }
type Query = {
  select(s: string): Query; eq(k: string, v: unknown): Query; ilike(k: string, v: string): Query; limit(n: number): Query
  gte(k: string, v: unknown): Query
  or(filters: string): Query; order(k: string, opts?: Record<string, unknown>): Query
  insert(v: Record<string, unknown>): Query; update(v: Record<string, unknown>): Query
  upsert(v: Record<string, unknown>, opts?: Record<string, unknown>): Query
  single(): Promise<Result>; maybeSingle(): Promise<Result>
  then<T>(onfulfilled: (value: ListResult) => T): Promise<T>
}
const table = (name: string) => (createAdminClient() as unknown as { from(n: string): Query }).from(name)

/** The configured root zone, or null. Read at call time so a test can set it. */
export function spaceInboxRoot(): string | null {
  return normalizeInboxRoot(envStringOrNull('SPACE_EMAIL_INBOX_ROOT'))
}

/** Provisioning, the Settings card and the outbound From are on only with the switch AND a root. */
export function spaceInboxAddressesEnabled(): boolean {
  return envFlag('SPACE_INBOX_ADDRESSES_ENABLED') && spaceInboxRoot() !== null
}

const UNAVAILABLE = 'Your Space address is not available yet. Sending through Frequency keeps working.'

/** The Space's address row, or null (also null on a read fault: the card then offers setup again). */
export async function readSpaceInboxAddress(spaceId: string): Promise<SpaceInboxAddressRow | null> {
  try {
    const { data, error } = await table('space_inbox_addresses').select('*').eq('space_id', spaceId).maybeSingle()
    if (error || !data) return null
    return data as unknown as SpaceInboxAddressRow
  } catch {
    return null
  }
}

/**
 * The rows the verify cron still owes a finish: every `pending` row first (they still restamp
 * `updated_at` so the tail is the next run's head), then every `failed` row whose `updated_at` is
 * at or after `failedSince`. A failed-to-failed save does not restamp, so that stamp is the first
 * failure and an older one waits for the owner. Pending first so frozen failed rows cannot fill
 * the budget. Throws on a read fault so the cron can log it.
 */
export async function listSpaceInboxAddressesToFinish(opts: { limit: number; failedSince: string }): Promise<SpaceInboxAddressRow[]> {
  const pending = await listInboxRowsByState('pending', opts.limit)
  const remaining = Math.max(0, opts.limit - pending.length)
  const failed = remaining === 0 ? [] : await listFailedInboxRows(opts.failedSince, remaining)
  return [...pending, ...failed]
}

async function listInboxRowsByState(state: 'pending', limit: number): Promise<SpaceInboxAddressRow[]> {
  const { data, error } = await table('space_inbox_addresses')
    .select('*')
    .eq('state', state)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message ?? 'Space inbox address list is unavailable.')
  return (data ?? []) as unknown as SpaceInboxAddressRow[]
}

async function listFailedInboxRows(failedSince: string, limit: number): Promise<SpaceInboxAddressRow[]> {
  const { data, error } = await table('space_inbox_addresses')
    .select('*')
    .eq('state', 'failed')
    .gte('updated_at', failedSince)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message ?? 'Space inbox address list is unavailable.')
  return (data ?? []) as unknown as SpaceInboxAddressRow[]
}

/** A failed-to-failed write must not move `updated_at`, or the 24h cron window never ends (SCAN-1011). */
function isFrozenFailedRetry(previous: SpaceInboxState | undefined, next: SpaceInboxState): boolean {
  return previous === 'failed' && next === 'failed'
}

async function readSpace(spaceId: string): Promise<{ slug: string; name: string; brand_name: string | null; owner_profile_id: string | null } | null> {
  const { data, error } = await table('spaces').select('slug, name, brand_name, owner_profile_id').eq('id', spaceId).maybeSingle()
  if (error || !data) return null
  return data as unknown as { slug: string; name: string; brand_name: string | null; owner_profile_id: string | null }
}

/** Write the row. A patch that carries `domain` is the full row and may create it (upsert on space_id).
 *  Any other patch is a change to a row that exists and is an UPDATE: an upsert of a partial row is an
 *  INSERT first, and Postgres rejects a proposed row with `domain` null before it ever reaches the
 *  conflict branch ("null value in column domain violates not-null constraint", the 2026-10-13 02:00
 *  cron run, which wrote the zone records and then could not stamp dns_written_at or the state). */
async function saveRow(spaceId: string, patch: Record<string, unknown>): Promise<SpaceInboxAddressRow | null> {
  const values = { ...patch, updated_at: new Date().toISOString() }
  const query = 'domain' in patch
    ? table('space_inbox_addresses').upsert({ space_id: spaceId, ...values }, { onConflict: 'space_id' })
    : table('space_inbox_addresses').update(values).eq('space_id', spaceId)
  const { data, error } = await query.select('*').single()
  if (error || !data) {
    console.warn('[space-inbox] row save failed', { spaceId, keys: Object.keys(patch), error: error?.message ?? 'no row' })
    return null
  }
  return data as unknown as SpaceInboxAddressRow
}

/**
 * Set up (or resume setting up) the Space's address. Idempotent: an existing provider domain is reused,
 * DNS writes are repeatable, and a verified address is simply reported. Never throws.
 */
export async function provisionSpaceInboxAddress(
  spaceId: string,
  opts?: { restartFailureWindow?: boolean },
): Promise<SpaceInboxResult> {
  try {
    const root = spaceInboxRoot()
    if (!spaceInboxAddressesEnabled() || !root) return { ok: false, message: UNAVAILABLE }
    const space = await readSpace(spaceId)
    if (!space) return { ok: false, message: 'We could not find that Space.' }
    const domain = spaceInboxDomain(space.slug, root)
    if (!domain) return { ok: false, message: 'This Space link cannot carry an email address. Change the link in Space settings first.' }
    const address = spaceInboxAddress(domain)

    const existing = await readSpaceInboxAddress(spaceId)
    if (existing?.state === 'verified' && existing.domain === domain) {
      return { ok: true, address, state: 'verified', message: 'Your Space address is ready.' }
    }
    if (existing?.state === 'paused') {
      return { ok: false, message: 'Your Space address is paused. Write to support to switch it back on.' }
    }
    if (!vercelDomainsConfigured()) return { ok: false, message: UNAVAILABLE }

    // 1) The provider domain, reusing one that already exists (a retried setup, or a slug that came back).
    // The records are re-read from the provider on every run, never from the saved row: a row written by
    // an earlier release can hold stale names (the 2026-10-12 pilot did), and a retry must write the
    // right ones. The zone they go into is the apex Vercel holds, not the root itself (see spaceInboxZone).
    let providerId = existing?.domain === domain ? existing.provider_domain_id : null
    let zoneRecords: ZoneRecord[] = []
    let providerState: SpaceInboxState = 'pending'
    const zone = spaceInboxZone(root)
    const fromProvider = (p: { status: string; capabilities?: { sending?: string; receiving?: string } | null; records: unknown }) => {
      zoneRecords = providerRecordsToZoneRecords(domain, zone, p.records as ProviderDnsRecord[])
      providerState = inboxStateFromProvider(p)
    }
    if (!providerId) {
      const found = await findEmailProviderDomainByName(domain).catch(() => null)
      if (found) {
        providerId = found.id
        fromProvider(await inspectEmailProviderDomain(found.id, domain))
      } else {
        const created = await createEmailProviderInboxDomain(domain)
        providerId = created.id
        fromProvider(created)
      }
    } else {
      fromProvider(await inspectEmailProviderDomain(providerId, domain))
    }

    // 2) Remember the provider id BEFORE touching DNS, so a DNS fault never loses the domain we created.
    //    A cron failed-to-failed retry must not restamp updated_at (SCAN-1011). The owner button passes
    //    restartFailureWindow so Set up my address opens a fresh 24 hours.
    const restartFailureWindow = opts?.restartFailureWindow === true
    const skipFailedStamp = !restartFailureWindow
      && !!existing
      && isFrozenFailedRetry(existing.state, providerState)
      && existing.domain === domain
      && existing.provider_domain_id === providerId
    const saved = skipFailedStamp
      ? existing
      : await saveRow(spaceId, { domain, local_part: SPACE_INBOX_LOCAL_PART, provider_domain_id: providerId, state: providerState, dns_records: zoneRecords })
    if (!saved) return { ok: false, message: 'Your Space address could not be saved. Try again.' }

    // 3) The records into the apex zone. Repeatable; a record already there counts as written. The
    //    outcome is stamped on the row (dns_written_at) so the verify cron can tell a row whose records
    //    are in the zone from one that still needs them.
    const dns = await upsertZoneDnsRecords(zone, zoneRecords.map(r => ({ type: r.type, name: r.name, value: r.value, mxPriority: r.mxPriority })))
    if (!dns.ok) {
      console.warn('[space-inbox] zone DNS write failed', { spaceId, zone, error: dns.error })
      if (restartFailureWindow || existing?.dns_written_at != null) await saveRow(spaceId, { dns_written_at: null })
      return { ok: false, message: 'Your Space address is saved, but its records could not be written yet. It will be tried again on its own.' }
    }
    if (!saved.dns_written_at) await saveRow(spaceId, { dns_written_at: new Date().toISOString() })
    else if (restartFailureWindow) await saveRow(spaceId, { dns_written_at: saved.dns_written_at })

    // 4) Ask the provider to look, and report where it stands.
    return await checkSpaceInboxAddress(spaceId)
  } catch (err) {
    console.error('[space-inbox] provision failed', { spaceId, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, message: 'Your Space address could not be set up just now. Try again in a minute.' }
  }
}

/** Re-read verification from the provider and flip the row's state. Never throws. */
export async function checkSpaceInboxAddress(spaceId: string): Promise<SpaceInboxResult> {
  try {
    const row = await readSpaceInboxAddress(spaceId)
    if (!row) return { ok: false, message: 'Your Space address is not set up yet.' }
    const address = spaceInboxAddress(row.domain, row.local_part)
    if (row.state === 'paused') return { ok: false, message: 'Your Space address is paused. Write to support to switch it back on.' }
    if (!row.provider_domain_id) return { ok: false, message: 'Your Space address needs setting up again.' }
    await requestEmailProviderVerification(row.provider_domain_id).catch(() => undefined)
    const provider = await inspectEmailProviderDomain(row.provider_domain_id, row.domain)
    const state = inboxStateFromProvider(provider)
    // SCAN-1011: a failed-to-failed re-read must not restamp updated_at, or the cron's 24h window
    // never ends. Skip the verify poke's save; the inspect already ran. Pending and verified still write.
    if (isFrozenFailedRetry(row.state, state)) {
      return {
        ok: true,
        address,
        state,
        message: 'The provider could not verify your Space address. Press Set up my address to try again.',
      }
    }
    const saved = await saveRow(spaceId, {
      state,
      verified_at: state === 'verified' ? (row.verified_at ?? new Date().toISOString()) : row.verified_at,
    })
    if (!saved) return { ok: false, message: 'Your Space address was checked, but the result could not be saved. Check again.' }
    const message = state === 'verified'
      ? 'Your Space address is ready.'
      : state === 'failed'
        ? 'The provider could not verify your Space address. Press Set up my address to try again.'
        : 'Your Space address is being set up. DNS can take a few minutes, and it finishes on its own.'
    return { ok: true, address, state, message }
  } catch (err) {
    console.error('[space-inbox] check failed', { spaceId, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, message: 'Could not check your Space address just now. Try again in a minute.' }
  }
}

/** The From line for a Space with a verified address: `"Brand" <hello@slug.root>`. Null whenever the
 *  address is not usable, so the caller keeps the Frequency sender. Never throws. */
export async function resolveSpaceInboxFrom(spaceId: string): Promise<string | null> {
  try {
    if (!spaceInboxAddressesEnabled()) return null
    const row = await readSpaceInboxAddress(spaceId)
    if (!row || row.state !== 'verified') return null
    const space = await readSpace(spaceId)
    if (!space) return null
    return spaceInboxFromLine(space.brand_name ?? space.name, spaceInboxAddress(row.domain, row.local_part))
  } catch {
    return null
  }
}

type SpaceInboxRoute =
  | { kind: 'none' }
  | { kind: 'quarantine'; reason: 'ambiguous_alias' | 'inbox_address_unknown' | 'inbox_address_unverified' }
  | { kind: 'ready'; spaceId: string; ownerProfileId: string | null; brandName: string; address: string }

/** Is this message addressed to a Space's inbox address? Reads the root only, never the switch, so a
 *  verified address keeps receiving after the switch is turned off. Throws on a lookup fault (the
 *  webhook answers 5xx and the provider redelivers), like the alias resolver. */
export async function resolveSpaceInboxRoute(recipients: string[]): Promise<SpaceInboxRoute> {
  const match = matchSpaceInboxRecipient(recipients, spaceInboxRoot())
  if (match.kind === 'none') return { kind: 'none' }
  if (match.kind === 'ambiguous') return { kind: 'quarantine', reason: 'ambiguous_alias' }
  const { data, error } = await table('space_inbox_addresses').select('space_id, state, local_part').eq('domain', match.domain).maybeSingle()
  if (error) throw new Error('Space inbox address lookup is unavailable.')
  if (!data || data.local_part !== match.localPart) return { kind: 'quarantine', reason: 'inbox_address_unknown' }
  if (data.state !== 'verified') return { kind: 'quarantine', reason: 'inbox_address_unverified' }
  const space = await readSpace(String(data.space_id))
  if (!space) throw new Error('Space inbox address lookup is unavailable.')
  return { kind: 'ready', spaceId: String(data.space_id), ownerProfileId: space.owner_profile_id, brandName: space.brand_name ?? space.name, address: match.address }
}

/** Quarantine evidence only (fingerprints), through the EMAIL-013 store. */
export async function quarantineSpaceInboxMessage(reason: string, recipients: string[], messageId: string | null): Promise<void> {
  await quarantineTenantReplyAlias(reason, recipients, messageId)
}

/** The sender as one of THIS Space's contacts, created with consent unknown when new. Null on a fault. */
async function ensureSpaceContact(spaceId: string, email: string): Promise<{ contactId: string; profileId: string | null } | null> {
  const needle = email.trim().toLowerCase()
  if (!needle.includes('@')) return null
  const found = await table('contacts').select('id, profile_id').eq('space_id', spaceId).ilike('email', escapeLike(needle)).limit(1).maybeSingle()
  if (found.error) return null
  if (found.data) return { contactId: String(found.data.id), profileId: (found.data.profile_id as string | null) ?? null }
  const nowIso = new Date().toISOString()
  const inserted = await table('contacts')
    .insert({ email: needle, space_id: spaceId, consent_state: 'unknown', source: 'space_inbox', last_seen_at: nowIso })
    .select('id, profile_id')
    .single()
  if (inserted.error?.code === '23505') {
    const again = await table('contacts').select('id, profile_id').eq('space_id', spaceId).ilike('email', escapeLike(needle)).limit(1).maybeSingle()
    if (again.error || !again.data) return null
    return { contactId: String(again.data.id), profileId: (again.data.profile_id as string | null) ?? null }
  }
  if (inserted.error || !inserted.data) return null
  return { contactId: String(inserted.data.id), profileId: (inserted.data.profile_id as string | null) ?? null }
}

type SpaceInboxRecordStatus =
  | { status: 'recorded'; conversationId: string; ref: string }
  | { status: 'duplicate'; conversationId?: string; ref?: string }
  | { status: 'no_owner' }
  | { status: 'error' }

/**
 * Land a message sent to a verified Space address: the sender becomes (or already is) a contact of the
 * Space, a NEW conversation opens in the Space with them as the counterpart (the sender address is a
 * claim, not a proven identity, so an existing thread is never adopted), and the message is appended
 * inbound, deduped on the provider Message-ID. `error` asks the webhook for a redelivery.
 */
export async function recordSpaceInboxMessage(
  route: Extract<SpaceInboxRoute, { kind: 'ready' }>,
  parsed: { from: string; subject: string | null; text: string | null; messageId: string | null; inReplyTo: string | null; referencesIds: string[] | null },
): Promise<SpaceInboxRecordStatus> {
  if (!route.ownerProfileId) return { status: 'no_owner' }
  // SCAN-1001: a redelivery is acknowledged BEFORE a thread opens. The append's unique index on
  // external_message_id catches the duplicate, but only after forceNew has already inserted a conversation,
  // so every provider retry left an empty thread in the Space console.
  if (parsed.messageId) {
    const seen = await table('comms_messages').select('conversation_id').eq('external_message_id', parsed.messageId).limit(1).maybeSingle()
    if (seen.error) return { status: 'error' }
    if (seen.data) return { status: 'duplicate', conversationId: String(seen.data.conversation_id) }
  }
  const contact = await ensureSpaceContact(route.spaceId, parsed.from)
  if (!contact) return { status: 'error' }
  const subject = (parsed.subject ?? '').trim().slice(0, 300) || '(no subject)'
  const conv = await openOrGetConversation({
    kind: 'crm',
    externalEmail: parsed.from,
    ownerProfileId: route.ownerProfileId,
    subject,
    contactId: contact.contactId,
    memberProfileId: contact.profileId,
    spaceId: route.spaceId,
    channel: 'email',
    metadata: { source: 'space_inbox', to: route.address },
    forceNew: true,
  })
  if (!conv) return { status: 'error' }
  const appended = await appendConversationMessage({
    conversationId: conv.id,
    direction: 'inbound',
    authorKind: contact.profileId ? 'member' : 'contact',
    authorId: contact.profileId,
    authorContactId: contact.profileId ? null : contact.contactId,
    body: parsed.text ?? '(no message body)',
    externalMessageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    referencesIds: parsed.referencesIds,
    metadata: { source: 'space_inbox', from: parsed.from, to: route.address },
    mirror: {
      ownerProfileId: route.ownerProfileId,
      subjectKind: contact.profileId ? 'profile' : 'contact',
      subjectId: contact.profileId ?? contact.contactId,
      spaceId: route.spaceId,
      subject,
      scope: null,
    },
  })
  if (appended === null) return { status: 'error' }
  if ('duplicate' in appended) return { status: 'duplicate', conversationId: conv.id, ref: conv.ref }
  await notifyOwner(route.ownerProfileId, conv.id, conv.ref, subject)
  return { status: 'recorded', conversationId: conv.id, ref: conv.ref }
}

/** Tell the owner someone wrote to the Space. Best-effort; never throws. */
async function notifyOwner(recipientId: string, conversationId: string, ref: string, subject: string): Promise<void> {
  try {
    await table('notifications').insert({
      recipient_id: recipientId,
      type: 'conversation_reply',
      reference_type: 'conversation',
      reference_id: conversationId,
      body: `wrote to your Space, conversation #${ref}: ${subject.slice(0, 80)}`,
    }).select('id').single()
  } catch {
    /* the message is on the thread regardless of the alert */
  }
}
