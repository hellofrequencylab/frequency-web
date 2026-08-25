import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { GUESTBOOK_ENTRIES_SHOWN, type GuestbookEntry } from './guestbook.shared'

export type { GuestbookEntry } from './guestbook.shared'

// Spotlight Guestbook — the server READ side. Follows top-friends.ts exactly: the PUBLIC
// Spotlight page renders to anonymous visitors who hold zero RLS, so the read goes through
// the admin client (this file is on scripts/admin-client-baseline.txt for that one reason)
// and exposes only the signer's already-public identity fields plus the note. Every WRITE
// (sign / remove / hide) runs under the caller's SESSION client with the table's RLS —
// see app/spotlight/[handle]/guestbook-actions.ts.
//
// Hidden entries (hidden_at set — owner/staff moderation) are filtered HERE, so a hidden
// note never reaches any render. A signer whose profile is missing/inactive/system drops,
// so a stale row never surfaces a hidden account (same rule as Top Friends).

/**
 * Read the newest visible guestbook entries for one Spotlight owner, joined to each
 * signer's public identity fields. Best-effort: [] on error or when nobody has signed.
 */
export async function getGuestbookForOwner(ownerProfileId: string): Promise<GuestbookEntry[]> {
  if (!ownerProfileId) return []
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('spotlight_guestbook')
    .select('id, signer_profile_id, message, created_at')
    .eq('owner_profile_id', ownerProfileId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(GUESTBOOK_ENTRIES_SHOWN)
  if (!rows || rows.length === 0) return []

  // Two steps (two FKs to profiles): resolve the signer identities in one .in(),
  // preserving the entry order.
  const signerIds = [...new Set(rows.map((r) => r.signer_profile_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url, is_active, is_system')
    .in('id', signerIds)

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const out: GuestbookEntry[] = []
  for (const r of rows) {
    const s = byId.get(r.signer_profile_id)
    if (!s?.handle || s.is_active === false || s.is_system === true) continue
    out.push({
      id: r.id,
      signerProfileId: r.signer_profile_id,
      signerHandle: s.handle,
      signerDisplayName: s.display_name,
      signerAvatarUrl: s.avatar_url,
      message: r.message,
      createdAt: r.created_at,
    })
  }
  return out
}

/**
 * Resolve a guestbook target by handle: the owner's profile id, only when the profile is a
 * real, active member account. Used by the sign action to key the write; cheap on purpose
 * (the full Spotlight loader is a page read, not a write gate). Null = no such target.
 */
export async function resolveGuestbookOwner(handle: string): Promise<string | null> {
  if (!handle) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, is_active, is_system')
    .eq('handle', handle)
    .maybeSingle()
  if (!data?.id || data.is_active === false || data.is_system === true) return null
  return data.id
}
