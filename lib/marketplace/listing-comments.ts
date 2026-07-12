// Reader for the polymorphic marketplace listing Q&A feed (listing_comments). Server-only, behind
// app-code authz through the service-role admin client (repo convention — the table is new, so it is
// reached through an untyped handle until lib/database.types.ts is regenerated). The matching writes
// live in ./listing-qna-actions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ListingCommentTargetKind } from '@/lib/listings-shared/detail-view'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface ListingComment {
  id: string
  body: string
  imageUrl: string | null
  createdAt: string
  author: { id: string; displayName: string; handle: string; avatarUrl: string | null } | null
}

type RawRow = {
  id: string
  body: string | null
  image_url: string | null
  created_at: string
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

/** Newest-first Q&A comments for one listing. Fail-safe to [] (a missing table pre-migration reads
 *  as empty, never throws), so the detail page renders the composer even before the migration lands. */
export async function getListingComments(
  targetKind: ListingCommentTargetKind,
  targetId: string,
): Promise<ListingComment[]> {
  const { data, error } = await db()
    .from('listing_comments')
    .select('id, body, image_url, created_at, author:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .eq('target_kind', targetKind)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return []
  return ((data ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    body: r.body ?? '',
    imageUrl: r.image_url,
    createdAt: r.created_at,
    author: r.author
      ? { id: r.author.id, displayName: r.author.display_name, handle: r.author.handle, avatarUrl: r.author.avatar_url }
      : null,
  }))
}
