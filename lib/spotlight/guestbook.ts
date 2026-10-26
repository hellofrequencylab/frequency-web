import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { routeNotification } from '@/lib/notifications/router'
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
  return readGuestbook(ownerProfileId, 'visible')
}

/**
 * The OWNER's view of what they hid (ADR-1279): the unhide surface. Same reader, same identity
 * resolution, filtered to hidden_at IS NOT NULL. The caller must already know the viewer is the
 * owner (the block checks the session before asking); this read is never handed to a visitor.
 */
export async function getHiddenGuestbookForOwner(ownerProfileId: string): Promise<GuestbookEntry[]> {
  return readGuestbook(ownerProfileId, 'hidden')
}

async function readGuestbook(ownerProfileId: string, which: 'visible' | 'hidden'): Promise<GuestbookEntry[]> {
  if (!ownerProfileId) return []
  const admin = createAdminClient()

  const base = admin
    .from('spotlight_guestbook')
    .select('id, signer_profile_id, message, created_at')
    .eq('owner_profile_id', ownerProfileId)
  const { data: rows } = await (which === 'visible' ? base.is('hidden_at', null) : base.not('hidden_at', 'is', null))
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

/** The injectable seams of the sign notice, so the decision is unit-testable without IO. */
export interface GuestbookNotifyDeps {
  client?: Pick<ReturnType<typeof createAdminClient>, 'from'>
  route?: typeof routeNotification
  log?: (message: string, detail: Record<string, unknown>) => void
}

/**
 * Tell the owner someone signed their guestbook (ADR-1279). Two channels, both behind the
 * owner's `comments` preferences and both riding the registry row `guestbook.sign`: the router's
 * send-gate reads `inapp_comments` for the bell row and `push_comments` for the push, plus the
 * hard suppression list, and enqueues each allowed channel on the outbox. Best-effort end to
 * end: a refused or failed notice never undoes a note that already landed, and nothing here throws.
 */
export async function notifyGuestbookSigned(
  input: { ownerProfileId: string; ownerHandle: string; signerProfileId: string },
  deps: GuestbookNotifyDeps = {},
): Promise<{ inapp: boolean; push: number }> {
  const client = deps.client ?? createAdminClient()
  const route = deps.route ?? routeNotification
  const log = deps.log ?? ((m, d) => console.error(m, d))
  const out = { inapp: false, push: 0 }
  const { ownerProfileId, ownerHandle, signerProfileId } = input
  if (!ownerProfileId || !ownerHandle || !signerProfileId) return out

  // The signer's public name, for the push copy. The bell prints the actor's name itself.
  const { data: signer } = await client
    .from('profiles')
    .select('display_name, handle')
    .eq('id', signerProfileId)
    .maybeSingle()
  const signerName =
    (signer as { display_name?: string | null; handle?: string | null } | null)?.display_name ||
    ((signer as { handle?: string | null } | null)?.handle ? `@${(signer as { handle: string }).handle}` : 'Someone')
  const url = `/people/${ownerHandle}#guestbook`

  try {
    const result = await route(
      'guestbook.sign',
      { profileId: ownerProfileId },
      {
        title: 'New note in your guestbook',
        body: `${signerName} signed your guestbook.`,
        url,
        ownerHandle,
        signerProfileId,
      },
    )
    out.inapp = result.outcomes.some((o) => o.channel === 'inapp' && o.enqueued)
    out.push = result.outcomes.some((o) => o.channel === 'push' && o.enqueued) ? 1 : 0
  } catch (err) {
    log('[guestbook] sign notice threw', { ownerProfileId, error: err instanceof Error ? err.message : String(err) })
  }
  return out
}
