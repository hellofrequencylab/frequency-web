'use server'

// Server actions for the Starter Circle lifecycle: Remix a blueprint into a
// draft, publish a draft as an original Circle, and generate the standing
// events. Thin authz wrappers over lib/circles/*; the heavy lifting + the
// upward-only Host elevation live there.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { remixTemplate, publishCircle } from '@/lib/circles/remix'
import { generateCircleEvents } from '@/lib/circles/events'

/** The signed-in REAL member's profile id. Demo profiles cannot remix (mirrors
 *  the claim guard). */
async function callerProfileId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in to remix a Circle.')
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, is_demo').eq('auth_user_id', user.id).maybeSingle()
  const me = data as { id: string; is_demo?: boolean } | null
  if (!me || me.is_demo) throw new Error('Only real members can remix a Circle.')
  return me.id
}

export async function remixTemplateAction(templateId: string): Promise<{ slug: string; circleId: string }> {
  const profileId = await callerProfileId()
  const res = await remixTemplate({ templateId, profileId })
  revalidatePath('/circles')
  revalidatePath('/lead')
  return res
}

export async function publishCircleAction(circleId: string): Promise<{ slug: string }> {
  const profileId = await callerProfileId()
  const res = await publishCircle({ circleId, profileId })
  revalidatePath('/circles')
  revalidatePath(`/circles/${res.slug}`)
  revalidatePath('/lead')
  return res
}

export async function generateCircleEventsAction(input: {
  circleId: string
  meetupAt?: string
  gatheringAt?: string
}): Promise<{ meetupId: string | null; gatheringId: string | null }> {
  const profileId = await callerProfileId()
  const admin = createAdminClient()
  const { data } = await admin.from('circles').select('host_id, name').eq('id', input.circleId).maybeSingle()
  const c = data as { host_id: string | null; name: string } | null
  if (!c || c.host_id !== profileId) throw new Error('Only the Host can add these events.')
  const res = await generateCircleEvents({
    circleId: input.circleId,
    hostId: profileId,
    circleName: c.name,
    meetupAt: input.meetupAt,
    gatheringAt: input.gatheringAt,
  })
  revalidatePath('/circles')
  return res
}
