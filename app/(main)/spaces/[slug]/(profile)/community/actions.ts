'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizePollOptions } from '@/lib/feed/compose-kinds'
import { attachWallPollOptions } from '@/lib/spaces/community-wall'

// WRITE TO A SPACE'S COMMUNITY WALL (ADR-1938, LIVE-2077, LIVE-2095).
//
// Unlike createPost, this runs on the SESSION client, not the admin client, so the database is the
// authority: the posts INSERT policy admits a wall post only when private.can_post_space_wall says
// the caller may post here (the owner, staff, a paying member, or a follower the owner has let in,
// and never a person the team has banned). The same policy decides the KIND: anyone who may post
// may post, poll or ask; an announcement is for the Space team only. There is no second copy of
// those rules in this file to drift. A refusal comes back as 42501 and is worded for a person,
// never shown raw.
//
// Both scope_id and scope_space_id carry the Space id. The sync_post_scope_arc trigger does not
// derive the Space arc on purpose (existing space_update posts already use scope_id = Space id and
// must keep the old policy arms), so the writer states it.
//
// A poll's options go in on the service role after the post lands (lib/spaces/community-wall.ts
// attachWallPollOptions), the same way createPost does it: the options table has no member INSERT
// policy. If the options fail, the post is removed so no question is left standing without its
// answers.

const MAX_BODY = 5000

type WallPostKind = 'feed' | 'poll' | 'ask' | 'announcement'
const WALL_KINDS: readonly WallPostKind[] = ['feed', 'poll', 'ask', 'announcement']

export async function createWallPost(input: {
  spaceId: string
  slug: string
  body: string
  imageUrl?: string | null
  kind?: string
  pollOptions?: readonly unknown[]
}): Promise<ActionResult> {
  const body = input.body.trim()
  const imageUrl = input.imageUrl?.trim() || null
  if (!body && !imageUrl) return fail('Write something to post.')
  if (body.length > MAX_BODY) return fail('That is a bit long. Trim it under 5,000 characters.')

  const kind: WallPostKind = WALL_KINDS.includes(input.kind as WallPostKind) ? (input.kind as WallPostKind) : 'feed'
  let pollOptions: string[] = []
  if (kind === 'poll') {
    if (!body) return fail('A poll needs its question.')
    const normalized = normalizePollOptions(input.pollOptions ?? [])
    if (!normalized.ok) return fail(normalized.error)
    pollOptions = normalized.options
  }

  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post on this wall.')

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('posts')
    .insert({
      author_id: profileId,
      body,
      scope_id: input.spaceId,
      scope_space_id: input.spaceId,
      visibility: 'cluster',
      post_type: kind,
      media_urls: imageUrl ? [imageUrl] : [],
    })
    .select('id')
    .single()

  if (error || !inserted) {
    if (error?.code === '42501') {
      return fail(
        kind === 'announcement'
          ? 'Announcements are for the people who run this Space.'
          : 'Posting here is for the people this Space has let in.',
      )
    }
    console.error('[createWallPost]', { code: error?.code ?? null, message: error?.message ?? 'no row' })
    return fail('Could not save your post. Please try again.')
  }

  if (kind === 'poll' && !(await attachWallPollOptions(inserted.id, pollOptions))) {
    return fail('Could not save the poll options. Please try again.')
  }

  revalidatePath(`/spaces/${input.slug}/community`)
  return ok()
}
