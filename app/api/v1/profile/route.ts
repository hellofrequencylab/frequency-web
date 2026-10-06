import { profileEditInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toProfileView } from '@/lib/contract/views'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from '@/app/(main)/settings/profile/actions'

// /api/v1/profile (LIVE-716): GET is the caller's own profile; PATCH edits the fields Settings →
// Profile edits, through the web's updateProfile (the sanitizer, the handle uniqueness check, the
// update under the caller's own RLS). A field left out keeps its stored value: updateProfile writes
// the whole set, so PATCH reads the stored row first and fills the gaps from it.

export const dynamic = 'force-dynamic'

const OWN_COLUMNS =
  'id, handle, display_name, avatar_url, header_image_url, bio, website, city, phone, community_role, membership_tier, created_at'

async function readOwn(authUserId: string) {
  const { data, error } = await (await createClient())
    .from('profiles')
    .select(OWN_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error || !data) return null
  return data as Record<string, string | null> & { id: string }
}

async function authUserIdOf(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getUser()
  return data.user?.id ?? null
}

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'profile')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    return await asCaller(auth, async () => {
      const uid = await authUserIdOf()
      const row = uid ? await readOwn(uid) : null
      return row ? ok(toProfileView(row)) : fail('internal', 'Could not read the profile right now. Try again.')
    })
  } catch (e) {
    return failFrom(e)
  }
}

export async function PATCH(request: Request) {
  const limited = await rateLimited(request, 'profile-edit', { limit: 20, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const input = readInput(profileEditInput, await request.json().catch(() => null))
    return await asCaller(auth, async () => {
      const uid = await authUserIdOf()
      const cur = uid ? await readOwn(uid) : null
      if (!uid || !cur) return fail('internal', 'Could not read the profile right now. Try again.')
      try {
        await updateProfile({
          displayName: input.displayName ?? cur.display_name ?? '',
          handle: input.handle ?? cur.handle ?? '',
          bio: input.bio ?? cur.bio ?? '',
          website: input.website ?? cur.website ?? '',
          city: input.city ?? cur.city ?? '',
          phone: cur.phone ?? '',
          // '' leaves the stored avatar untouched (updateProfile's contract).
          avatarUrl: '',
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : ''
        if (message === 'That handle is already taken.') return fail('conflict', message)
        if (/^(Display name|Handle) /.test(message)) return fail('invalid_input', message)
        throw e
      }
      const after = await readOwn(uid)
      return after ? ok(toProfileView(after)) : fail('internal')
    })
  } catch (e) {
    return failFrom(e)
  }
}
