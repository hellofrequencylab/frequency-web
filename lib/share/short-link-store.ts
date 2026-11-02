import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/qr/codes'
import { log, briefError } from '@/lib/log'
import { shortenablePath, shortLinkFor } from './short-link'

// SHORT SHARE LINKS (LIVE-1960): the database half. share_links / share_link_opens are internal tables
// (RLS on, no client policy), so every call here runs under the service role, like qr_codes. The pair
// is not in the generated types yet, so it is reached through one narrow untyped handle.

type Row = { slug: string }
type Query = {
  select: (cols: string) => Query
  insert: (row: Record<string, unknown>) => Query
  eq: (col: string, val: string) => Query
  is: (col: string, val: null) => Query
  maybeSingle: () => Promise<{ data: Row | null; error: { code?: string } | null }>
}
type Untyped = {
  from: (t: string) => Query
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{
    data: { path: string; sharer_profile_id: string | null }[] | null
    error: unknown
  }>
}
const db = () => createAdminClient() as unknown as Untyped

/** The short link for `input` (a public page) shared by `sharerProfileId`, made on first ask and the
 *  same link every time after. Null when the page is not shareable or the write failed (logged); a
 *  caller falls back to the long URL, so a failure here never blocks a share. */
export async function ensureShareLink(
  origin: string,
  input: string,
  sharerProfileId: string | null,
): Promise<string | null> {
  const path = shortenablePath(input)
  if (!path) return null
  try {
    const find = () => {
      const q = db().from('share_links').select('slug').eq('path', path)
      return (sharerProfileId ? q.eq('sharer_profile_id', sharerProfileId) : q.is('sharer_profile_id', null)).maybeSingle()
    }
    const existing = await find()
    if (existing.data) return shortLinkFor(origin, existing.data.slug)
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = generateSlug(7)
      const { error } = await db()
        .from('share_links')
        .insert({ slug, path, sharer_profile_id: sharerProfileId })
        .select('slug')
        .maybeSingle()
      if (!error) return shortLinkFor(origin, slug)
      // 23505: a double tap made the same link first (path+sharer), or the slug collided. Read, else retry.
      const again = await find()
      if (again.data) return shortLinkFor(origin, again.data.slug)
    }
    return null
  } catch (err) {
    log.warn('share_link_ensure_failed', { path, message: briefError(err) })
    return null
  }
}

/** Open a slug: the stored public path and the sharer, counting the open unless `count` is false.
 *  Null for an unknown slug or a failure (logged). */
export async function openShareLink(
  slug: string,
  count: boolean,
): Promise<{ path: string; sharerProfileId: string | null } | null> {
  try {
    const { data, error } = await db().rpc('open_share_link', { p_slug: slug, p_count: count })
    if (error) throw error
    const row = data?.[0]
    return row ? { path: row.path, sharerProfileId: row.sharer_profile_id } : null
  } catch (err) {
    log.warn('share_link_open_failed', { message: briefError(err) })
    return null
  }
}
