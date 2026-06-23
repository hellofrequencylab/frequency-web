// The import orchestrator (ADR-374): pull the member's Google connections, drop the ones already in
// their contact book, and create the rest as owner-scoped Network Profiles (source='import'). Each
// created contact auto-stamps an "Imported" row on the CRM timeline via createContact (lib/connections
// /store.ts), so the import shows up on every contact's history with no extra wiring.
//
// Dedupe is by normalized email (the strong key createContact also lowercases) then by phone (last 10
// digits), against both the existing book AND earlier rows in this same batch, so a re-import is a
// safe no-op. Server-only (delegates all writes to the owner-scoped store).

import { createContact, existingContactKeys } from '@/lib/connections/store'
import { fetchConnections } from './people'

/** Last-10-digits phone key, or null. Mirrors existingContactKeys in the store so the two compare. */
function phoneKey(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D+/g, '')
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

export interface ImportResult {
  added: number
  skipped: number
  total: number
}

/** Pull + import the member's Google contacts. Returns counts for the result banner. FAIL-SAFE: a
 *  failed page read yields fewer people, never a throw; a failed single create counts as skipped. */
export async function importGoogleContacts(ownerId: string, accessToken: string): Promise<ImportResult> {
  const people = await fetchConnections(accessToken)
  const { emails, phones } = await existingContactKeys(ownerId)
  const seenEmail = new Set(emails)
  const seenPhone = new Set(phones)

  let added = 0
  let skipped = 0
  for (const c of people) {
    const emailK = c.email?.toLowerCase() ?? null
    const phoneK = phoneKey(c.phone)
    if ((emailK && seenEmail.has(emailK)) || (phoneK && seenPhone.has(phoneK))) {
      skipped++
      continue
    }
    const id = await createContact(ownerId, {
      source: 'import',
      displayName: c.displayName ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      title: c.title ?? undefined,
      company: c.company ?? undefined,
      city: c.city ?? undefined,
      website: c.website ?? undefined,
    })
    if (id) {
      added++
      if (emailK) seenEmail.add(emailK)
      if (phoneK) seenPhone.add(phoneK)
    } else {
      skipped++
    }
  }
  return { added, skipped, total: people.length }
}
