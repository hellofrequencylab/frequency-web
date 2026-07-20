'use server'

// SPACE MEMBER COMPOSER — SERVER actions (the search + send seam for space-member-composer.tsx). The
// space-scoped twin of components/admin/crm/member-composer-actions.ts, with ZERO crossover to the platform
// CRM: no `contacts` search across the whole platform, no resolveSegment, no `campaigns` admin send, no
// approver/writer gate. Instead every action resolves the Space from its SLUG (server-derived, never trusted
// from the client), gates on the SPACE editor (resolveSpaceManageAccess.canManage), reads ONLY this Space's
// own contacts (space_id filter), and sends through the SPACE email seam (sendSpaceEmailDraftToRecipients ->
// sendSpaceCampaign), so the Space kill-switch, daily cap, consent + suppression, per-recipient unsubscribe,
// and outreach_sends ledger all apply.
//
// This is a 'use server' module: the client composer imports only the exported action stubs (RPC), never the
// server-only deps below (admin client / entitlements). Voice canon: no em dashes in any copy.

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { spaceEmailColors } from '@/lib/spaces/email-colors'
import { DEFAULT_EMAIL_COLORS, type EmailColors } from '@/lib/email-studio/render'
import { normalizeEmail, type SpaceRecipient } from '@/lib/spaces/email'
import { sendSpaceEmailDraftToRecipients } from '@/lib/spaces/email-drafts'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import type { Space } from '@/lib/spaces/types'

/** A hard cap so one composed member message can never resolve an unbounded recipient list in a single send
 *  (the per-Space daily cap in the send seam still applies across calls). */
const MAX_MEMBER_RECIPIENTS = 500

/** One Space-contact search result the composer turns into a removable recipient chip. */
export interface SpaceRecipientOption {
  /** The linked member profile id, or null for a sealed lead. */
  profileId: string | null
  email: string
  displayName: string
}

/** Resolve the Space from its slug and require the caller be a SPACE EDITOR (owner / admin / editor). A staff
 *  janitor PREVIEW (staffViewing) is read-only and is NOT granted send/search here. Fail-closed. */
async function requireSpaceEditorBySlug(
  slug: string,
): Promise<{ ok: true; space: Space } | { ok: false; error: string }> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return { ok: false, error: 'Space not found.' }
  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) return { ok: false, error: 'You do not have permission to email members of this space.' }
  return { ok: true, space }
}

/** Map the given emails to their contact id WITHIN this Space (for the ledger / unsubscribe link). Reads the
 *  untyped `contacts` table (space_id + email not fully in the generated types, ADR-246), PINNED to space_id
 *  so a cross-space address never resolves. FAIL-SAFE to an empty map (an unmatched email still sends bare;
 *  the send seam's consent gate decides). */
async function contactIdsByEmail(spaceId: string, emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!spaceId || emails.length === 0) return out
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: { id: string; email: string | null }[] | null }>
          }
        }
      }
    }
    const { data } = await db.from('contacts').select('id, email').eq('space_id', spaceId).in('email', emails)
    for (const c of data ?? []) {
      const e = typeof c.email === 'string' ? normalizeEmail(c.email) : ''
      if (e && c.id && !out.has(e)) out.set(e, c.id)
    }
  } catch {
    // fall through to the empty map (fail-safe)
  }
  return out
}

/**
 * Search THIS Space's own contacts to add as recipients (space-editor gated). Matches display name or email,
 * scoped to `space_id = this space` so a Space A caller can never reach Space B's (or the platform's)
 * contacts. Returns up to 8. FAIL-SAFE to [] (an ungated caller or a too-short query gets nothing).
 */
export async function searchSpaceMemberRecipientsAction(
  slug: string,
  query: string,
): Promise<SpaceRecipientOption[]> {
  const gate = await requireSpaceEditorBySlug(slug)
  if (!gate.ok) return []

  // Strip characters that would break the PostgREST or-filter grammar / the ilike pattern, then require a
  // real search term so the search can never resolve to an unbounded match.
  const safe = (query ?? '').replace(/[%_,()\\]/g, ' ').trim()
  if (safe.length < 2) return []
  const like = `%${safe}%`

  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            or: (filter: string) => {
              limit: (
                n: number,
              ) => Promise<{
                data: { id: string; email: string | null; display_name: string | null; profile_id: string | null }[] | null
              }>
            }
          }
        }
      }
    }
    const { data } = await db
      .from('contacts')
      .select('id, email, display_name, profile_id')
      .eq('space_id', gate.space.id)
      .or(`display_name.ilike.${like},email.ilike.${like}`)
      .limit(8)

    return (data ?? [])
      .filter((c) => c.email)
      .map((c) => ({
        profileId: typeof c.profile_id === 'string' && c.profile_id ? c.profile_id : null,
        email: String(c.email),
        displayName: (c.display_name as string)?.trim() || String(c.email),
      }))
  } catch {
    return []
  }
}

/**
 * The Space's OWN email brand palette (spaceEmailColors), so the member composer's body editor + live preview
 * paint in the Space's identity, not the platform amber. Space-editor gated; FAIL-SAFE to the DAWN default
 * palette (so a gate miss simply loses the brand tint, never the editor).
 */
export async function spaceMemberComposerColorsAction(slug: string): Promise<EmailColors> {
  const gate = await requireSpaceEditorBySlug(slug)
  if (!gate.ok) return DEFAULT_EMAIL_COLORS
  return spaceEmailColors(gate.space)
}

/**
 * Send the composed member message NOW (space-editor gated). `recipientKeys` are the chip emails; we normalize
 * + de-dupe them, resolve each to its Space contact (for the ledger link), and hand the resolved recipients to
 * the Space draft send seam (sendSpaceEmailDraftToRecipients), which compiles the draft's block body with the
 * Space brand palette and routes it through sendSpaceCampaign so consent, suppression, the daily cap, and the
 * per-recipient unsubscribe all apply. Returns how many actually went out. FAIL-CLOSED: an empty audience
 * sends to nobody.
 */
export async function sendSpaceMemberMessageAction(
  slug: string,
  input: { campaignId: string; recipientKeys: string[] },
): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await requireSpaceEditorBySlug(slug)
  if (!gate.ok) return fail(gate.error)
  const { space } = gate

  const campaignId = typeof input?.campaignId === 'string' ? input.campaignId : ''
  if (!campaignId) return fail('Could not find the message draft. Try again.')

  // Normalize + de-dupe the chip emails (fail-safe: junk is dropped, never sent).
  const emails = Array.from(
    new Set(
      (input?.recipientKeys ?? [])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => normalizeEmail(k))
        .filter((e) => e.length > 0),
    ),
  ).slice(0, MAX_MEMBER_RECIPIENTS)
  if (emails.length === 0) return fail('Add at least one recipient.')

  // Resolve each email to its Space contact so the outreach_sends ledger / unsubscribe map can link it. An
  // email with no matching Space contact still sends as a bare recipient; the send seam's consent +
  // suppression gate is the real authority on whether it goes out.
  const byEmail = await contactIdsByEmail(space.id, emails)
  const recipients: SpaceRecipient[] = emails.map((email) => {
    const contactId = byEmail.get(email)
    return contactId ? { contactId, email } : { email }
  })

  const res = await sendSpaceEmailDraftToRecipients(space.id, campaignId, recipients)
  if (isError(res)) return res
  return ok({ recipientCount: res.data.recipientCount })
}
