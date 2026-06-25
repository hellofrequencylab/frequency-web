import type { ReactElement } from 'react'
import { CommunityPulse } from '@/components/widgets/community-pulse'
import { NewestMembers } from '@/components/widgets/newest-members'
import { PopularChannels } from '@/components/widgets/popular-channels'
import { TopCircles } from '@/components/widgets/top-circles'
import { QuestFinishCelebration } from '@/components/widgets/quest/quest-finish-celebration'
import { QuestIntention } from '@/components/widgets/quest/quest-intention'
import { QuestSeasonMap } from '@/components/widgets/quest/quest-season-map'
import { QuestToday } from '@/components/widgets/quest/quest-today'
import { QuestCta } from '@/components/widgets/quest/quest-cta'
import { QuestMyPractices } from '@/components/widgets/quest/quest-my-practices'
import { QuestJourneys } from '@/components/widgets/quest/quest-journeys'
import { QuestNextGathering } from '@/components/widgets/quest/quest-next-gathering'
import { QuestTasks } from '@/components/widgets/quest/quest-tasks'
import { QuestExplore } from '@/components/widgets/quest/quest-explore'
import { QuestLeaderboard } from '@/components/widgets/quest/quest-leaderboard'
import { MenuSurfaceBlock } from '@/components/widgets/menu/menu-surface-block'
import { MenuGroupsBlock } from '@/components/widgets/menu/menu-groups-block'
import { MenuSpeedBlock } from '@/components/widgets/menu/menu-speed-block'
import { MenuLayoutBlock } from '@/components/widgets/menu/menu-layout-block'
import { MenuRailCardsBlock } from '@/components/widgets/menu/menu-rail-cards-block'
import { AdminJourneysStats } from '@/components/widgets/admin/admin-journeys-stats'
import { AdminJourneysReview } from '@/components/widgets/admin/admin-journeys-review'
import { AdminJourneysLibrary } from '@/components/widgets/admin/admin-journeys-library'
import { JourneysStart } from '@/components/widgets/journeys/journeys-start'
import { JourneysMine } from '@/components/widgets/journeys/journeys-mine'
import { JourneysLibrary } from '@/components/widgets/journeys/journeys-library'
import { FriendsImpact } from '@/components/widgets/friends/friends-impact'
import { LeaderboardConsistency } from '@/components/widgets/leaderboard/leaderboard-consistency'
import { JournalEntries } from '@/components/widgets/journal/journal-entries'
import { LibraryReviewQueue } from '@/components/widgets/library/library-review-queue'
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
import { ProgramsList } from '@/components/widgets/programs/programs-list'
import { ChallengesSeason } from '@/components/widgets/challenges/challenges-season'
import { EntityGettingStarted } from '@/components/widgets/entity/entity-getting-started'
import { EntityAbout } from '@/components/widgets/entity/entity-about'
import { EntityStats } from '@/components/widgets/entity/entity-stats'
import { EntityOfferings } from '@/components/widgets/entity/entity-offerings'
import { EntityPractices } from '@/components/widgets/entity/entity-practices'
import { EntityCommunity } from '@/components/widgets/entity/entity-community'
import { EntityTeam } from '@/components/widgets/entity/entity-team'
import { EntityCta } from '@/components/widgets/entity/entity-cta'
import { PagesInAppMember, PagesInAppFocus } from '@/components/widgets/pages/pages-in-app'
import { PagesSplashFunnels } from '@/components/widgets/pages/pages-splash-funnels'
import { PagesMarketing } from '@/components/widgets/pages/pages-marketing'
import { LeadStats } from '@/components/widgets/lead/lead-stats'
import { LeadAttention } from '@/components/widgets/lead/lead-attention'
import { LeadCircles } from '@/components/widgets/lead/lead-circles'
import { LeadNetworks } from '@/components/widgets/lead/lead-networks'
import { LeadEvents } from '@/components/widgets/lead/lead-events'
import { LeadJourneys } from '@/components/widgets/lead/lead-journeys'
import { LeadCoLeaders } from '@/components/widgets/lead/lead-coleaders'
import { LeadDispatches } from '@/components/widgets/lead/lead-dispatches'
import { LeadRecognition } from '@/components/widgets/lead/lead-recognition'
import { LeadTools } from '@/components/widgets/lead/lead-tools'
import { CircleFeed } from '@/components/widgets/circles/circle-feed'
import { CircleMembers } from '@/components/widgets/circles/circle-members'
import { CircleHealth } from '@/components/widgets/circles/circle-health'
import { CircleMomentumBlock } from '@/components/widgets/circles/circle-momentum'
import { CirclePracticeBlock } from '@/components/widgets/circles/circle-practice'
import { CircleEvents } from '@/components/widgets/circles/circle-events'
import { CircleMapBlock } from '@/components/widgets/circles/circle-map'
import { CircleInvite } from '@/components/widgets/circles/circle-invite'
import { CircleJourneyRun } from '@/components/widgets/circles/circle-journey-run'

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
  'quest-today': QuestToday,
  'quest-cta': QuestCta,
  'quest-my-practices': QuestMyPractices,
  'quest-journeys': QuestJourneys,
  'quest-next-gathering': QuestNextGathering,
  'quest-tasks': QuestTasks,
  'quest-explore': QuestExplore,
  'quest-leaderboard': QuestLeaderboard,
  // Menu Manager page (/admin/menu) — the DB-backed navigation editor as five blocks (ADR-359).
  'menu-surface': MenuSurfaceBlock,
  'menu-groups': MenuGroupsBlock,
  'menu-speed': MenuSpeedBlock,
  'menu-layout': MenuLayoutBlock,
  'menu-rail-cards': MenuRailCardsBlock,
  // Admin Journeys blocks (/admin/content/journeys).
  'admin-journeys-stats': AdminJourneysStats,
  'admin-journeys-review': AdminJourneysReview,
  'admin-journeys-library': AdminJourneysLibrary,
  // Journeys member page (/journeys).
  'journeys-start': JourneysStart,
  'journeys-mine': JourneysMine,
  'journeys-library': JourneysLibrary,
  // Friends page (/friends) — the assignable "Your impact" section.
  'friends-impact': FriendsImpact,
  // Leaderboard page (/crew/leaderboard) — the consistency layer.
  'leaderboard-consistency': LeaderboardConsistency,
  // Journal page (/journal) — the captured-moments log.
  'journal-entries': JournalEntries,
  // Library review queue (/library/review) — the leadership approval queue.
  'library-review-queue': LibraryReviewQueue,
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
  // Programs page (/programs) — the frameworks browse list.
  'programs-list': ProgramsList,
  // Season Challenges (/crew/challenges) — the season KPI band + challenges grid.
  'challenges-season': ChallengesSeason,
  // Entity profile (/spaces/<slug>/*) — the networked profile module set (ENTITY-SPACES-BUILD §B.2).
  'entity-getting-started': EntityGettingStarted,
  'entity-about': EntityAbout,
  'entity-stats': EntityStats,
  'entity-offerings': EntityOfferings,
  'entity-practices': EntityPractices,
  'entity-community': EntityCommunity,
  'entity-team': EntityTeam,
  'entity-cta': EntityCta,
  // Pages workspace (/pages) — the operator's find-any-page-and-edit-it surface.
  'pages-in-app-member': PagesInAppMember,
  'pages-in-app-focus': PagesInAppFocus,
  'pages-splash-funnels': PagesSplashFunnels,
  'pages-marketing': PagesMarketing,
  // Leadership dashboard (/lead) — a leader's consolidated home.
  'lead-stats': LeadStats,
  'lead-attention': LeadAttention,
  'lead-circles': LeadCircles,
  'lead-networks': LeadNetworks,
  'lead-events': LeadEvents,
  'lead-journeys': LeadJourneys,
  'lead-coleaders': LeadCoLeaders,
  'lead-dispatches': LeadDispatches,
  'lead-recognition': LeadRecognition,
  'lead-tools': LeadTools,
  'circle-feed': CircleFeed,
  'circle-members': CircleMembers,
  'circle-health': CircleHealth,
  'circle-momentum': CircleMomentumBlock,
  'circle-practice': CirclePracticeBlock,
  'circle-events': CircleEvents,
  'circle-map': CircleMapBlock,
  'circle-invite': CircleInvite,
  'circle-journey-run': CircleJourneyRun,
}

export function componentFor(id: string): ModuleComponent | undefined {
  return COMPONENTS[id]
}
