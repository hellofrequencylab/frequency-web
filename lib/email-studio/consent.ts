// EMAIL-085: the permission record behind a marketing yes (supabase/migrations/20270346410000_contact_consents.sql).
//
// WRITE. recordContactConsent stores one contact_consents row per yes: where (source, page, form), when, and the
// exact wording the person saw. Best-effort by design: the yes itself (contacts.consent_state) is already written by
// the caller, and a lost record only makes that contact unmailable here, never mailable without one.
//
// READ. keepConsentedRecipients is applied to every Email Studio audience before a send or a count. A recipient with
// a Frequency account passes unchanged (account holders get opt-out lifecycle mail under their own consent ledger,
// consent_records). A recipient with NO account (the imported list, reached only through all_contacts and
// imported_contacts) passes only when a contact_consents row exists. A read error throws: an audience we cannot
// check must stop the send, not shrink or widen it.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Recipient } from '@/lib/studio/campaigns'

/** The words shown at each place a person can say yes. Kept here so the stored record and the page agree. */
export const CONSENT_WORDING = {
  subscribe_confirm:
    'Hear from Daniel. A few notes a month on Circles, practices, and events. Unsubscribe any time, one click. [Confirm subscription]',
  import_attestation:
    'The list owner confirmed that everyone on this imported list agreed to get email from them.',
} as const

/** contact_consents is not in lib/database.types.ts until the migration applies and types regenerate (ADR-246),
 *  so it is reached through this narrow untyped seam. */
type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>
type Untyped = {
  from: (t: 'contact_consents') => {
    insert: (row: Record<string, unknown>) => Res<unknown>
    select: (cols: string) => { in: (c: string, v: readonly string[]) => Res<{ contact_id: string }[]> }
  }
}
const db = (): Untyped => createAdminClient() as unknown as Untyped

export type ConsentSource = keyof typeof CONSENT_WORDING

interface ContactConsentInput {
  contactId: string
  spaceId: string | null
  source: ConsentSource
  pagePath?: string | null
  formKey?: string | null
  /** Overrides the stock wording when the page showed something else. */
  wording?: string
  capturedAt?: string
}

/** PURE: the row a yes writes. Exported for the test. */
export function contactConsentRow(input: ContactConsentInput) {
  return {
    contact_id: input.contactId,
    space_id: input.spaceId,
    source: input.source,
    page_path: input.pagePath ?? null,
    form_key: input.formKey ?? null,
    wording: (input.wording ?? CONSENT_WORDING[input.source]).slice(0, 2000),
    captured_at: input.capturedAt ?? new Date().toISOString(),
  }
}

/** Store a permission record. Never throws; returns whether the row landed. */
export async function recordContactConsent(input: ContactConsentInput): Promise<boolean> {
  try {
    const { error } = await db().from('contact_consents').insert(contactConsentRow(input))
    if (error) {
      console.error('[consent] contact_consents insert failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[consent] contact_consents insert threw:', err)
    return false
  }
}

/** PURE: keep account holders, and account-less contacts that hold a permission record. Exported for the test. */
export function filterConsented(recipients: Recipient[], consented: Set<string>): Recipient[] {
  return recipients.filter((r) => r.profileId !== null || consented.has(r.contactId))
}

const IN_CHUNK = 200

/** Drop every account-less recipient with no contact_consents row. Throws on a read error. */
export async function keepConsentedRecipients(recipients: Recipient[]): Promise<Recipient[]> {
  const accountless = recipients.filter((r) => r.profileId === null).map((r) => r.contactId)
  if (accountless.length === 0) return recipients
  const client = db()
  const consented = new Set<string>()
  for (let i = 0; i < accountless.length; i += IN_CHUNK) {
    const chunk = accountless.slice(i, i + IN_CHUNK)
    const { data, error } = await client.from('contact_consents').select('contact_id').in('contact_id', chunk)
    if (error) throw new Error(`Could not read permission records: ${error.message}`)
    for (const row of data ?? []) consented.add(row.contact_id)
  }
  return filterConsented(recipients, consented)
}
