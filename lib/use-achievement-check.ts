'use client'

import { useCallback, useRef } from 'react'
import { checkRecentUnlocks } from '@/app/(main)/crew/gamification-actions'
import { showAchievementToast } from '@/components/achievement-toast'
import type { AchievementTier } from '@/lib/gamification'

export function useAchievementCheck() {
  const lastCheckRef = useRef<string>(new Date().toISOString())

  const checkForUnlocks = useCallback(async () => {
    const since = lastCheckRef.current
    lastCheckRef.current = new Date().toISOString()

    try {
      const unlocks = await checkRecentUnlocks(since)
      for (const unlock of unlocks) {
        showAchievementToast({
          id: unlock.id,
          name: unlock.name,
          description: unlock.description,
          icon: unlock.icon,
          tier: unlock.tier as AchievementTier,
          zapsReward: unlock.zapsReward,
        })
      }
    } catch {
      // Non-critical — don't break the user flow
    }
  }, [])

  return { checkForUnlocks }
}
