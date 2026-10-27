import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { pageContentMetadata } from '@/lib/page-content'
import { noteFailedRead, CONTENT_FALLBACK } from './inbox-data'
import { FrequencyMessages } from '@/components/frequency/members/messages/messages-body'

// 🔴 ROOM CREATION IS OPEN TO ANY SIGNED-IN MEMBER (ADR-1294, LIVE-221). It used to require the
// paid tier or a steward role, and the server action in ./rooms/actions.ts carried the same wall.
// Both halves came down together: a wall in the page alone would hide the button while the action
// happily accepted the request, which is the worse of the two failures. Under the core model a
// member never pays for a forward-facing feature, so do not re-add a tier check here.

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/messages', CONTENT_FALLBACK)
}

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  // RLS convergence surface 5 (migration 20260602195209): rooms + DMs read on the
  // user client (am_room_member / am_participant SELECT policies); the DM
  // participants' profiles, which RLS would otherwise hide from sub-crew/
  // cross-region viewers, come from the message_peer_profiles DEFINER RPC.
  const { data: myProfile, error: myProfileErr } = await supabase
    .from('profiles')
    .select('id, community_role, membership_tier, is_crew_lead')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // The redirect below cannot tell "this account has no profile yet" from "the profile read
  // failed", and it answers both with /onboarding — which sends a fully onboarded member back
  // through signup. The redirect stays (bouncing to onboarding is still the safer of the two
  // wrong answers), but the two causes are no longer indistinguishable in the logs.
  noteFailedRead('my profile', myProfileErr)
  if (!myProfile) redirect('/onboarding')
  const myProfileId = myProfile.id as string
  return <FrequencyMessages supabase={supabase} myProfileId={myProfileId} isCrewLead={myProfile.is_crew_lead === true} />
}



