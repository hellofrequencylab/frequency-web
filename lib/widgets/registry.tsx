import type { ReactElement } from 'react'
import { CommunityPulse } from '@/components/widgets/community-pulse'
import { NewestMembers } from '@/components/widgets/newest-members'
import { PopularChannels } from '@/components/widgets/popular-channels'
import { TopCircles } from '@/components/widgets/top-circles'
import { QuestFinishCelebration } from '@/components/widgets/quest/quest-finish-celebration'
import { QuestIntention } from '@/components/widgets/quest/quest-intention'
import { QuestSeasonMap } from '@/components/widgets/quest/quest-season-map'
import { QuestJourneys } from '@/components/widgets/quest/quest-journeys'
import { QuestNextGathering } from '@/components/widgets/quest/quest-next-gathering'
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
import { PracticesLibrary } from '@/components/widgets/practices/practices-library'
import { VaultStanding } from '@/components/widgets/vault/vault-standing'
import { VaultLeaderboard } from '@/components/widgets/vault/vault-leaderboard'
import { VaultSummary } from '@/components/widgets/vault/vault-summary'
import { VaultTrophies } from '@/components/widgets/vault/vault-trophies'
import { VaultAwards } from '@/components/widgets/vault/vault-awards'
import { VaultStore } from '@/components/widgets/vault/vault-store'
import { PracticeDetailStats } from '@/components/widgets/practice-detail/practice-detail-stats'
import { PracticeDetailAbout } from '@/components/widgets/practice-detail/practice-detail-about'
import { PracticeDetailGuide } from '@/components/widgets/practice-detail/practice-detail-guide'
import { PracticeDetailTags } from '@/components/widgets/practice-detail/practice-detail-tags'
import { PracticeDetailUsedIn } from '@/components/widgets/practice-detail/practice-detail-usedin'

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
  'quest-intention': QuestIntention,
  'quest-season-map': QuestSeasonMap,
  'quest-journeys': QuestJourneys,
  'quest-next-gathering': QuestNextGathering,
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
  // Practices page (/practices) — the upper personal blocks + the faceted library.
  'practices-stats': PracticesStats,
  'practices-activity': PracticesActivity,
  'practices-balance': PracticesBalance,
  'practices-mine': PracticesMine,
  'practices-library': PracticesLibrary,
  // The Vault (/crew/store).
  'vault-standing': VaultStanding,
  'vault-leaderboard': VaultLeaderboard,
  'vault-summary': VaultSummary,
  'vault-trophies': VaultTrophies,
  'vault-awards': VaultAwards,
  'vault-store': VaultStore,
  // Practice detail (/practices/<id>) — the arrangeable body sections.
  'practice-detail-stats': PracticeDetailStats,
  'practice-detail-about': PracticeDetailAbout,
  'practice-detail-guide': PracticeDetailGuide,
  'practice-detail-tags': PracticeDetailTags,
  'practice-detail-usedin': PracticeDetailUsedIn,
}

export function componentFor(id: string): ModuleComponent | undefined {
  return COMPONENTS[id]
}
