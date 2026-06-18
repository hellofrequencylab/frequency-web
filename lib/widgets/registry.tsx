import type { ReactElement } from 'react'
import { CommunityPulse } from '@/components/widgets/community-pulse'
import { NewestMembers } from '@/components/widgets/newest-members'
import { PopularChannels } from '@/components/widgets/popular-channels'
import { TopCircles } from '@/components/widgets/top-circles'
import { QuestFinishCelebration } from '@/components/widgets/quest/quest-finish-celebration'
import { QuestSeasonMap } from '@/components/widgets/quest/quest-season-map'
import { QuestJourneys } from '@/components/widgets/quest/quest-journeys'
import { QuestTasks } from '@/components/widgets/quest/quest-tasks'
import { QuestExplore } from '@/components/widgets/quest/quest-explore'
import { QuestLeaderboard } from '@/components/widgets/quest/quest-leaderboard'
import { AdminJourneysStats } from '@/components/widgets/admin/admin-journeys-stats'
import { AdminJourneysReview } from '@/components/widgets/admin/admin-journeys-review'
import { AdminJourneysLibrary } from '@/components/widgets/admin/admin-journeys-library'
import { JourneysStart } from '@/components/widgets/journeys/journeys-start'
import { JourneysMine } from '@/components/widgets/journeys/journeys-mine'
import { JourneysLibrary } from '@/components/widgets/journeys/journeys-library'
import { PracticesStats } from '@/components/widgets/practices/practices-stats'
import { PracticesActivity } from '@/components/widgets/practices/practices-activity'
import { PracticesBalance } from '@/components/widgets/practices/practices-balance'
import { PracticesMine } from '@/components/widgets/practices/practices-mine'

// Binds each layout-module id (lib/widgets/modules.ts) to its self-fetching RSC. Kept apart
// from the metadata so the editor / actions / resolver never import server components. The
// renderer (components/widgets/page-modules.tsx) looks components up here by id.
type ModuleComponent = () => Promise<ReactElement | null>

const COMPONENTS: Record<string, ModuleComponent> = {
  // Community blocks (the global default set).
  'community-pulse': CommunityPulse,
  'newest-members': NewestMembers,
  'popular-channels': PopularChannels,
  'top-circles': TopCircles,
  // My Quest blocks (/crew).
  'quest-finish-celebration': QuestFinishCelebration,
  'quest-season-map': QuestSeasonMap,
  'quest-journeys': QuestJourneys,
  'quest-tasks': QuestTasks,
  'quest-explore': QuestExplore,
  'quest-leaderboard': QuestLeaderboard,
  // Admin Journeys blocks (/admin/content/journeys).
  'admin-journeys-stats': AdminJourneysStats,
  'admin-journeys-review': AdminJourneysReview,
  'admin-journeys-library': AdminJourneysLibrary,
  // Journeys member page (/journeys).
  'journeys-start': JourneysStart,
  'journeys-mine': JourneysMine,
  'journeys-library': JourneysLibrary,
  // Practices page (/practices) — the upper, personal blocks.
  'practices-stats': PracticesStats,
  'practices-activity': PracticesActivity,
  'practices-balance': PracticesBalance,
  'practices-mine': PracticesMine,
}

export function componentFor(id: string): ModuleComponent | undefined {
  return COMPONENTS[id]
}
