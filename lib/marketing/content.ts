// AI content drafts → the Action Queue (ADR-070 Phase E). Turns the Market Read's
// resonant content ideas into proposable drafts that wait for a human. NOTHING is
// ever auto-published — approving a draft marks it ready for a person to post
// (human-approves-anything-public; MARKETING-AI guardrail). The drafting itself is
// deterministic today (the Market Read); a live Claude operator slots in behind it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMarketRead, type MarketRead } from './market-read'

export interface ContentDraftPayload {
  channel: string
  hook: string
  body: string
  painPoint: string
}
export interface ContentDraftItem {
  payload: ContentDraftPayload
  rationale: string
}

/** Pure: flatten a Market Read into proposable content drafts (one per idea). */
export function contentDraftItems(read: MarketRead): ContentDraftItem[] {
  const items: ContentDraftItem[] = []
  for (const p of read.painPoints) {
    for (const idea of p.ideas) {
      items.push({
        payload: { channel: idea.channel, hook: idea.hook, body: idea.body, painPoint: p.title },
        rationale: `${p.ache} — ${p.evidence}`,
      })
    }
  }
  return items
}

/** Pure: drop items whose hook is already pending, so re-proposing is idempotent. */
export function dedupeByHook(items: ContentDraftItem[], existingHooks: Iterable<string>): ContentDraftItem[] {
  const seen = new Set(existingHooks)
  const out: ContentDraftItem[] = []
  for (const item of items) {
    if (seen.has(item.payload.hook)) continue
    seen.add(item.payload.hook)
    out.push(item)
  }
  return out
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Propose Market-Read content drafts into the Action Queue (idempotent by hook). */
export async function proposeContentDrafts(): Promise<number> {
  const client = db()
  const items = contentDraftItems(await getMarketRead())
  if (!items.length) return 0

  const { data: existing } = await client
    .from('agent_actions')
    .select('payload')
    .eq('kind', 'content_draft')
    .eq('status', 'proposed')
  const existingHooks = ((existing ?? []) as Array<{ payload: { hook?: string } }>)
    .map((e) => e.payload?.hook)
    .filter((h): h is string => !!h)

  const fresh = dedupeByHook(items, existingHooks)
  for (const item of fresh) {
    await client.from('agent_actions').insert({
      kind: 'content_draft',
      payload: item.payload,
      rationale: item.rationale,
      status: 'proposed',
    })
  }
  return fresh.length
}
