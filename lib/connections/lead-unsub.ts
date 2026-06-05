// Stateless unsubscribe tokens for email-only LEADS (non-members) — the scan-intro
// recipients who have a `contacts` row but no profile, so the member-keyed
// lib/unsubscribe-tokens doesn't apply. HMAC over the contacts.id, so
// `/u/scan?c=<id>&t=<tok>` flips contacts.consent_state to 'unsubscribed' with no
// DB lookup to *issue* the link. Same secret + shape as lib/unsubscribe-tokens.

import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  const explicit = process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error('[lead-unsub] No UNSUBSCRIBE_SECRET and no SUPABASE_SERVICE_ROLE_KEY — cannot sign.')
  }
  return fallback
}

export function makeLeadUnsubToken(contactId: string): string {
  return createHmac('sha256', getSecret()).update(`lead:${contactId}`).digest('hex').slice(0, 32)
}

export function verifyLeadUnsubToken(contactId: string, token: string): boolean {
  if (!contactId || !token || token.length !== 32) return false
  try {
    return timingSafeEqual(
      Buffer.from(makeLeadUnsubToken(contactId), 'hex'),
      Buffer.from(token, 'hex'),
    )
  } catch {
    return false
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

export function buildLeadUnsubUrl(contactId: string): string {
  return `${BASE_URL}/u/scan?c=${encodeURIComponent(contactId)}&t=${makeLeadUnsubToken(contactId)}`
}
