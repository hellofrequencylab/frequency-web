// Feed polls (LIVE-682): reading a poll's options with their tallies and the viewer's own vote.
// Options carry vote_count (kept by trigger, migration 20270346002400), so a reader never sees who
// voted for what. Reads go through the SESSION client: the options policy hands back only options
// of posts the viewer can read, and the votes policy only the viewer's own vote.

import { createClient } from '@/lib/supabase/server'
import type { PollView } from './poll-tally'

export type { PollView }

/** Polls for the given post ids, keyed by post id. FAIL-SAFE: an empty map. */
export async function loadPolls(postIds: readonly string[], viewerProfileId: string | null): Promise<Map<string, PollView>> {
  const out = new Map<string, PollView>()
  const ids = [...new Set(postIds)].slice(0, 100)
  if (ids.length === 0) return out
  try {
    const supabase = await createClient()
    const [{ data: options }, { data: votes }] = await Promise.all([
      supabase.from('post_poll_options').select('id, post_id, label, position, vote_count').in('post_id', ids).order('position'),
      viewerProfileId
        ? supabase.from('post_poll_votes').select('post_id, option_id').in('post_id', ids).eq('profile_id', viewerProfileId)
        : Promise.resolve({ data: [] as { post_id: string; option_id: string }[] }),
    ])
    const mine = new Map(((votes ?? []) as { post_id: string; option_id: string }[]).map((v) => [v.post_id, v.option_id]))
    for (const o of (options ?? []) as { id: string; post_id: string; label: string; vote_count: number }[]) {
      const view = out.get(o.post_id) ?? { options: [], total: 0, myOptionId: mine.get(o.post_id) ?? null }
      view.options.push({ id: o.id, label: o.label, votes: o.vote_count })
      view.total += o.vote_count
      out.set(o.post_id, view)
    }
  } catch {
    /* fail-safe: the post renders without its options */
  }
  return out
}
