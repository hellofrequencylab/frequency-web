import { createAdminClient } from '@/lib/supabase/admin'
import { partnershipLive, type PartnershipRow, type PartnerSpaceFacts } from './partners'

// The one read of "is this Space a live partner of a live Collective" (SCAN-982). Cross-listing
// eligibility and the Partners tab both call it, so the two can never disagree. It never imports the
// cross-listing store: that store imports this one.
const PAGE = 500
const BATCH = 200
export const PARTNER_COLS = 'id, hub_space_id, partner_space_id, status, invited_by, responded_by, created_at'
export const PARTNER_SPACE_COLS = 'id, slug, name, brand_name, brand_logo_url, owner_profile_id, plan, status, visibility, parent_id, type'
export interface PartnerSpaceRow extends PartnerSpaceFacts { slug: string; name: string | null; brand_name?: string | null; brand_logo_url?: string | null }

/** Spaces by id, batched below the URL ceiling. A failed read throws: callers fail closed. */
export async function partnerSpacesById(ids: readonly string[]): Promise<Map<string, PartnerSpaceRow>> {
  const unique = [...new Set(ids)]
  const out = new Map<string, PartnerSpaceRow>()
  for (let offset = 0; offset < unique.length; offset += BATCH) {
    const { data, error } = await createAdminClient().from('spaces').select(PARTNER_SPACE_COLS).in('id', unique.slice(offset, offset + BATCH))
    if (error) throw new Error('Partner Spaces unavailable')
    for (const row of (data ?? []) as unknown as PartnerSpaceRow[]) out.set(row.id, row)
  }
  return out
}

/** Every partnership row naming these Spaces on one side, exhaustively paged. */
export async function partnershipRows(column: 'hub_space_id' | 'partner_space_id', ids: readonly string[], statuses: readonly string[]): Promise<PartnershipRow[]> {
  const unique = [...new Set(ids)]
  const rows: PartnershipRow[] = []
  for (let offset = 0; offset < unique.length; offset += BATCH) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await createAdminClient().from('collective_partners').select(PARTNER_COLS)
        .in(column, unique.slice(offset, offset + BATCH)).in('status', [...statuses]).order('id').range(from, from + PAGE - 1)
      if (error) throw new Error('Collective partners unavailable')
      const page = (data ?? []) as unknown as PartnershipRow[]
      rows.push(...page)
      if (page.length < PAGE) break
    }
  }
  return rows
}

/** The subset of `ids` that are accepted partners of a live Collective under today's owners.
 *  A failed read returns no partners (fail closed) and says so in the log. */
export async function livePartnerSpaceIds(ids: readonly string[]): Promise<Set<string>> {
  const live = new Set<string>()
  if (!ids.length) return live
  try {
    const rows = await partnershipRows('partner_space_id', ids, ['accepted'])
    if (!rows.length) return live
    const spaces = await partnerSpacesById(rows.flatMap(row => [row.hub_space_id, row.partner_space_id]))
    for (const row of rows) if (partnershipLive(row, spaces.get(row.hub_space_id), spaces.get(row.partner_space_id))) live.add(row.partner_space_id)
  } catch (error) {
    console.error('[collective-partners] live partner read failed; treating as no partners', error)
  }
  return live
}
