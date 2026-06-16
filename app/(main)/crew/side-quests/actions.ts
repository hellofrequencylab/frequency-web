'use server'

// Side Quests (ADR-300 Part 3) — the member claim action. Finishing a Side Quest unlocks its badge
// and pays the Zaps reward exactly once (the idempotency lives in lib/side-quests.claimSideQuest).

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { claimSideQuest } from '@/lib/side-quests'

export async function claimSideQuestAction(achievementId: string): Promise<ActionResult<{ zaps: number; name: string }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to take on Side Quests.')
  if (!achievementId) return fail('No quest given.')
  const res = await claimSideQuest(caller.id, achievementId)
  if (!res.ok) return fail(res.alreadyClaimed ? 'You already finished this one.' : 'Could not claim that quest.')
  revalidatePath('/crew/side-quests')
  return ok({ zaps: res.zaps ?? 0, name: res.name ?? 'Side Quest' })
}
