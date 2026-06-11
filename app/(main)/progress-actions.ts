'use server'

import { getMyProfileId } from '@/lib/auth'
import { acknowledgeStage } from '@/lib/member-progress'
import { acknowledgeAmplitudeLevel } from '@/lib/amplitude-celebration'

/**
 * Mark the highest stage the member has seen, so the "just unlocked" celebration
 * fires exactly once. The profile is resolved server-side from the session — the
 * client only passes which stage index it just showed.
 */
export async function acknowledgeStageAction(stageIndex: number): Promise<void> {
  const profileId = await getMyProfileId()
  if (profileId) await acknowledgeStage(profileId, stageIndex)
}

/** Same exactly-once contract for the Amplitude level-up celebration. */
export async function acknowledgeAmplitudeAction(level: number): Promise<void> {
  const profileId = await getMyProfileId()
  if (profileId) await acknowledgeAmplitudeLevel(profileId, level)
}
