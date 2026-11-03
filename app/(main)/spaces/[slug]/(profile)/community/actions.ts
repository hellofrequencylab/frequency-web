'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// WRITE TO A SPACE'S COMMUNITY WALL (ADR-1938, LIVE-2077).
//
// Unlike createPost, this runs on the SESSION client, not the admin client, so the database is the
// authority: the posts INSERT policy admits a wall post only when private.can_post_space_wall says
// the caller may post here (the owner, staff, a paying member, or a follower the owner has let in).
// There is no second copy of that rule in this file to drift. A refusal comes back as 42501 and is
// worded for a person, never shown raw.
//
// Both scope_id and scope_space_id carry the Space id. The sync_post_scope_arc trigger does not
// derive the Space arc on purpose (existing space_update posts already use scope_id = Space id and
// must keep the old policy arms), so the writer states it.

const MAX_BODY = 5000

export async function createWallPost(input: {
  spaceId: string
  slug: string
  body: string
  imageUrl?: string | null
}): Promise<ActionResult> {
  const body = input.body.trim()
  const imageUrl = input.imageUrl?.trim() || null
  if (!body && !imageUrl) return fail('Write something to post.')
  if (body.length > MAX_BODY) return fail('That is a bit long. Trim it under 5,000 characters.')

  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post on this wall.')

  const supabase = await createClient()
  const { error } = await supabase.from('posts').insert({
    author_id: profileId,
    body,
    scope_id: input.spaceId,
    scope_space_id: input.spaceId,
    visibility: 'cluster',
    post_type: 'feed',
    media_urls: imageUrl ? [imageUrl] : [],
  })

  if (error) {
    if (error.code === '42501') return fail('Posting here is for the people this Space has let in.')
    console.error('[createWallPost]', { code: error.code ?? null, message: error.message })
    return fail('Could not save your post. Please try again.')
  }

  revalidatePath(`/spaces/${input.slug}/community`)
  return ok()
}
