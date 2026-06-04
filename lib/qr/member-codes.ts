// Per-member code provisioning. Each member owns up to three persistent qr_codes,
// keyed by `purpose` (a unique index makes this idempotent):
//   • connect  — destination_type 'url'  → their public profile
//   • referral — destination_type 'action' (credits the owner on a new signup)
//   • gift_zap — destination_type 'action' (a scanner gives the owner a zap)
// Server-only (qr_codes is service-role).

import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from './codes'
import { connectUrl } from './links'
import { STYLE_PRESETS, DEFAULT_STYLE, type QrStyle } from './style'

export type MemberCodePurpose = 'connect' | 'referral' | 'gift_zap'

export interface MemberCodeRow {
  id: string
  slug: string
  purpose: MemberCodePurpose
  title: string
  style: unknown
  scan_count: number
}

const PURPOSES: MemberCodePurpose[] = ['connect', 'referral', 'gift_zap']

function preset(key: string): QrStyle {
  return STYLE_PRESETS.find((p) => p.key === key)?.style ?? DEFAULT_STYLE
}

const SPEC: Record<MemberCodePurpose, { title: string; destination_type: string; style: QrStyle }> = {
  connect: { title: 'Connect with me', destination_type: 'url', style: preset('sunset') },
  referral: { title: 'Invite to Frequency', destination_type: 'action', style: preset('forest') },
  gift_zap: { title: 'Gift me a zap', destination_type: 'action', style: preset('midnight') },
}

/** Return the member's three personal codes, creating any that don't exist yet. */
export async function ensureMemberCodes(profileId: string, handle: string): Promise<MemberCodeRow[]> {
  const db = createAdminClient()

  const { data: existing } = await db
    .from('qr_codes')
    .select('id, slug, purpose, title, style, scan_count')
    .eq('owner_profile_id', profileId)
    .in('purpose', PURPOSES)

  const have = new Set((existing ?? []).map((c) => c.purpose))
  const missing = PURPOSES.filter((p) => !have.has(p))

  if (missing.length > 0) {
    const rows = missing.map((purpose) => ({
      slug: generateSlug(),
      title: SPEC[purpose].title,
      destination_type: SPEC[purpose].destination_type,
      target_url: purpose === 'connect' ? connectUrl(handle) : null,
      purpose,
      owner_profile_id: profileId,
      created_by: profileId,
      style: SPEC[purpose].style as unknown as never,
    }))
    // Unique (owner, purpose) index makes this safe against a double-provision race.
    await db.from('qr_codes').upsert(rows, { onConflict: 'owner_profile_id,purpose', ignoreDuplicates: true })
  }

  const { data: all } = await db
    .from('qr_codes')
    .select('id, slug, purpose, title, style, scan_count')
    .eq('owner_profile_id', profileId)
    .in('purpose', PURPOSES)

  // Stable order: connect, referral, gift_zap.
  return (all ?? [])
    .map((c) => ({ ...c, purpose: c.purpose as MemberCodePurpose }))
    .sort((a, b) => PURPOSES.indexOf(a.purpose) - PURPOSES.indexOf(b.purpose))
}
