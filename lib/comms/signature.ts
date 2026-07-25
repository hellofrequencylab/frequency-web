import 'server-only'

// Per-sender email signature for outbound conversation replies. Auto-generated from the sender's name +
// frequencylocal.com by default; overridable per-user (profiles.email_signature) and edited in Settings.
// Appended to the EMAIL body only — the stored message / in-app chat keeps the clean text (mirrors the
// footer-strip principle). Server-only (reads the profile through the admin client).

import { createAdminClient } from '@/lib/supabase/admin'

/** The default signature when the operator has not saved a custom one. Plain, honest, no em dashes. */
export function defaultSignature(name: string | null): string {
  const clean = (name ?? '').trim() || 'The Frequency team'
  return `${clean}\nfrequencylocal.com`
}

/** Append a signature to a plain-text body, separated by the standard `-- ` signature delimiter (RFC 3676),
 *  which mail clients recognize and can fold. No-op for an empty signature. PURE. */
export function appendSignature(body: string, signature: string | null): string {
  const sig = (signature ?? '').trim()
  const text = (body ?? '').trimEnd()
  if (!sig) return text
  return `${text}\n\n-- \n${sig}`
}

/** Resolve the signature to stamp for a sender: their saved `email_signature`, else the auto default from
 *  their display name. FAIL-SAFE: the default from the passed name on any read error. The `name` argument is
 *  the already-resolved display name (callers usually have it), used for the default. */
export async function resolveSignature(profileId: string | null | undefined, name: string | null): Promise<string> {
  if (!profileId) return defaultSignature(name)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    const { data } = await db.from('profiles').select('email_signature, display_name').eq('id', profileId).maybeSingle()
    const saved = (data?.email_signature as string | null)?.trim()
    if (saved) return saved
    return defaultSignature(name ?? (data?.display_name as string | null) ?? null)
  } catch {
    return defaultSignature(name)
  }
}

/** For a Space reply where the "sender" is the brand, not a person. */
export function brandSignature(brandName: string | null): string {
  const clean = (brandName ?? '').trim() || 'The team'
  return `${clean}\nfrequencylocal.com`
}
