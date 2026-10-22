// MEMBER CARDS: the stage line on a card face (LIVE-1282, ADR-1874). The card shows its owner's
// stage from the member progress spine (lib/member-progress.ts, ADR-146), never a ladder of its own.
// FAIL-SAFE: any failure reads as the first stage, 'Newcomer'.

import { MEMBER_STAGES, getCachedMemberProgress } from '@/lib/member-progress'

const FIRST = MEMBER_STAGES[0].label

/** The display label for a stage key, or the first stage's for an unknown one. Pure. */
export function cardStageLabel(key: string | null | undefined): string {
  return MEMBER_STAGES.find((s) => s.key === key)?.label ?? FIRST
}

/** The member's stage label for their card face. Never throws; 'Newcomer' on any failure. */
export async function readCardStage(profileId: string): Promise<string> {
  if (!profileId) return FIRST
  try {
    const progress = await getCachedMemberProgress(profileId)
    return cardStageLabel(progress?.stage?.key)
  } catch {
    return FIRST
  }
}
