'use server'

// Per-Space / per-Circle mute — the write half of the card in ./mutes-form.tsx.
//
// ONE action, because the member is offered ONE decision: quiet this Space/Circle, or don't.
// The store underneath is per (subject, topic, channel), so a mute fans out to every topic ×
// every channel for that subject (MUTE_TOPICS × MUTE_CHANNELS) and an unmute clears the same
// set. `setSubjectTopicMute` upserts when muting and DELETES the row when not, so an unmute
// leaves no rows behind and "absence = not muted" stays true.
//
// The member's GLOBAL grid is never touched here. A mute is scoped to one subject; the
// channel × topic switches in ./form.tsx are a separate row in a separate table.
//
// authz: the action establishes the caller with getMyProfileId() (the authz-guard contract,
// same idiom as ./sms-actions.ts) and then re-derives membership from the DB with
// isMutableSubject(). Both matter. The profile id is never taken from the client, and the
// subject id IS client-supplied, so without the membership check any signed-in caller could
// write mute rows keyed to an arbitrary UUID. Fail-closed on both.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  setSubjectTopicMute,
  type PreferenceSubjectType,
} from '@/lib/notification-preferences'
import { MUTE_CHANNELS, MUTE_TOPICS, isMutableSubject } from './mute-subjects'

const SUBJECT_TYPES: readonly PreferenceSubjectType[] = ['space', 'circle']

/**
 * Mute (or unmute) every notification from one Space or Circle for the signed-in member.
 *
 * Returns an in-voice failure rather than throwing, so the card can revert its optimistic
 * flip and say what happened. A partial write (some pairs stored, some not) reports failure
 * and leaves the subject reading as partially muted, which is the honest state.
 */
export async function setSubjectMute(
  subjectType: PreferenceSubjectType,
  subjectId: string,
  muted: boolean,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to change your notifications.')

  if (!SUBJECT_TYPES.includes(subjectType) || typeof subjectId !== 'string' || !subjectId.trim()) {
    return fail('Could not find that Circle or Space.')
  }

  // The gate. A caller may only mute somewhere they actually belong.
  if (!(await isMutableSubject(profileId, subjectType, subjectId))) {
    return fail('You can only mute a Circle or Space you belong to.')
  }

  const subject = { subjectType, subjectId }
  const writes = MUTE_TOPICS.flatMap((topic) =>
    MUTE_CHANNELS.map((channel) => setSubjectTopicMute(profileId, subject, topic, channel, muted)),
  )
  const results = await Promise.all(writes)
  if (results.some((wrote) => !wrote)) {
    return fail('Could not save that. Try again.')
  }

  // The card renders inside the unified Settings page; /settings/notifications is only a
  // redirect anchor onto it, so this is the one path that holds the rendered state.
  revalidatePath('/settings')
  return ok()
}
