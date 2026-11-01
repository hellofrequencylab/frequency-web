'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mergeProfileMeta } from '@/lib/profiles/meta'
import { memberWithinLeadershipAllowance } from '@/lib/pricing/member-leadership'
import { growsPastCap, SPOTLIGHT_BLOCKS_MESSAGE } from '@/lib/spotlight/caps'
import { PAGE_META_KEY, readPageSettings, validatePageSettings, type SpotlightPageSettings } from '@/lib/spotlight/link-in-bio'
import type { EntitlementTier } from '@/lib/core/entitlement'

// SAVE THE PERSONAL SPOTLIGHT PAGE (links, social row, "Show Frequency features"). Owner-only and
// SESSION-DERIVED: no target id, so a caller can only ever write their own row. The wire is validated
// (validatePageSettings) before it is stored at meta.spotlightPage, and only that key is merged server-side.
// The link count rides the same `spotlight_blocks` meter as the grid (Member 12, Crew 40); a page no bigger
// than the saved one is always kept, so nobody is locked out of a page they already built.
export async function saveSpotlightPage(raw: unknown): Promise<{ error?: string; saved?: SpotlightPageSettings }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  const row = me as { id: string; handle?: string | null; meta?: unknown; membership_tier?: string | null }

  const safe = validatePageSettings(raw)
  const next = safe.links.length
  const saved = readPageSettings(row.meta).links.length
  if (next > saved) {
    const tier = (row.membership_tier ?? 'free') as EntitlementTier
    const allowed = await memberWithinLeadershipAllowance('spotlight_blocks', tier, next - 1)
    if (growsPastCap(next, saved, allowed)) return { error: SPOTLIGHT_BLOCKS_MESSAGE }
  }

  const { error } = await mergeProfileMeta(supabase, row.id, { [PAGE_META_KEY]: safe })
  if (error) return { error }
  if (row.handle) {
    revalidatePath(`/spotlight/${row.handle}`)
    revalidatePath('/settings/profile/spotlight')
  }
  return { saved: safe }
}
