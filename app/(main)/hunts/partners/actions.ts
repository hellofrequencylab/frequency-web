'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { invitePartner, respondAsSteward, revokePartner } from '@/lib/hunts/partner-store'

// The partner actions (FH-029). Each one establishes the caller itself and refuses while
// HUNTS_AUTHORING_ENABLED is off. A browser supplies only ids, a Space address and a handle, and reads back only a fixed code: who may
// answer for a venue, and who may run the Hunt, are read fresh inside lib/hunts/partner-store.ts.

const UUID = /^[0-9a-f-]{36}$/i

async function caller(...ids: string[]): Promise<string | null> {
  if (!huntSwitchOn('authoring') || ids.some((id) => !UUID.test(id))) return null
  return (await getCallerProfile())?.id ?? null
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

export async function invitePartnerAction(formData: FormData): Promise<void> {
  const huntId = text(formData, 'huntId')
  const profileId = await caller(huntId)
  if (!profileId) return
  const out = await invitePartner(huntId, profileId, { spaceSlug: text(formData, 'spaceSlug').slice(0, 120), stewardHandle: text(formData, 'stewardHandle').slice(0, 60) }, new Date().toISOString())
  revalidatePath(`/hunts/edit/${huntId}/partners`)
  redirect(`/hunts/edit/${huntId}/partners?said=${out.ok ? 'invited' : out.reason}`)
}

export async function revokePartnerAction(formData: FormData): Promise<void> {
  const huntId = text(formData, 'huntId')
  const spaceId = text(formData, 'spaceId')
  const profileId = await caller(huntId, spaceId)
  if (!profileId) return
  const out = await revokePartner(huntId, profileId, spaceId, new Date().toISOString())
  revalidatePath(`/hunts/edit/${huntId}/partners`)
  redirect(`/hunts/edit/${huntId}/partners?said=${out.ok ? 'ended' : out.reason}`)
}

export async function stewardAnswerAction(formData: FormData): Promise<void> {
  const huntId = text(formData, 'huntId')
  const spaceId = text(formData, 'spaceId')
  const answer = text(formData, 'answer')
  const profileId = await caller(huntId, spaceId)
  if (!profileId || (answer !== 'accept' && answer !== 'decline' && answer !== 'withdraw')) return
  const out = await respondAsSteward(answer, { huntId, spaceId, actorId: profileId, now: new Date().toISOString() })
  revalidatePath(`/hunts/partners/${huntId}/${spaceId}`)
  redirect(`/hunts/partners/${huntId}/${spaceId}?said=${out.ok ? out.status : out.reason}`)
}
