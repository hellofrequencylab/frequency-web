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
import { PracticeAdminStats } from '@/components/widgets/practices/admin/stats'
import { PracticeReviewQueue } from '@/components/widgets/practices/admin/review-queue'
import { PracticeMergeSuggestions } from '@/components/widgets/practices/admin/merge'
import { PracticeNeedsAttention } from '@/components/widgets/practices/admin/needs-attention'
import { PracticeAdminLibrary } from '@/components/widgets/practices/admin/library'
import { PracticeTagGovernance } from '@/components/widgets/practices/admin/tag-governance'
import { PracticeRemixLevers } from '@/components/widgets/practices/admin/remix-levers'
import { PracticeContributorRecognition } from '@/components/widgets/practices/admin/contributor-recognition'
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
import { PracticeDetailLineage } from '@/components/widgets/practice-detail/practice-detail-lineage'
import { ProgramsList } from '@/components/widgets/programs/programs-list'
import { ChannelsList } from '@/components/widgets/channels/channels-list'
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
import { MarketingAnalyticsNorthStar } from '@/components/widgets/marketing/analytics-northstar'
import { MarketingAnalyticsRetention } from '@/components/widgets/marketing/analytics-retention'
import { MarketingAnalyticsCrm } from '@/components/widgets/marketing/analytics-crm'
import { MarketingAnalyticsEmail } from '@/components/widgets/marketing/analytics-email'
import { MarketingDeliverabilityHealth } from '@/components/widgets/marketing/deliverability-health'
import { MarketingDeliverabilityDeadLetters } from '@/components/widgets/marketing/deliverability-dead-letters'
import { CrmGraphMetrics } from '@/components/widgets/crm/graph-metrics'
import { CrmGraphConnections } from '@/components/widgets/crm/graph-connections'
import { CrmPlaybooksStats } from '@/components/widgets/crm/playbooks-stats'
import { CrmPlaybooksRegistry } from '@/components/widgets/crm/playbooks-registry'
import { CrmPlaybooksRuns } from '@/components/widgets/crm/playbooks-runs'
import { CommunityStructure } from '@/components/widgets/community/structure'
import { CommunityTrustSafety } from '@/components/widgets/community/trust-safety'
import { CommunityFeedReach } from '@/components/widgets/community/feed-reach'
import { CommunityManage } from '@/components/widgets/community/manage'
import { CommunityRelated } from '@/components/widgets/community/related'
import { AuditRecentActions } from '@/components/widgets/audit/recent-actions'
import { AdminHubsRoster } from '@/components/widgets/admin/admin-hubs-roster'
import { AdminNexusesRoster } from '@/components/widgets/admin/admin-nexuses-roster'
import { AdminModerationQueue } from '@/components/widgets/admin/admin-moderation-queue'
import { OperationsAi } from '@/components/widgets/operations/ai-area'
import { OperationsPlatform } from '@/components/widgets/operations/platform-area'
import { OperationsManage } from '@/components/widgets/operations/manage'
import { OperationsRelated } from '@/components/widgets/operations/related'
import { GrowthFunnel } from '@/components/widgets/growth/funnel-area'
import { GrowthPipeline } from '@/components/widgets/growth/pipeline-area'
import { GrowthExpansion } from '@/components/widgets/growth/expansion-area'
import { GrowthManage } from '@/components/widgets/growth/manage'
import { GrowthRelated } from '@/components/widgets/growth/related'
import { CrmMembers } from '@/components/widgets/crm/cockpit-members'
import { CrmCockpitStats } from '@/components/widgets/crm/cockpit-stats'
import { CrmRising } from '@/components/widgets/crm/rising'
import { CrmTrust } from '@/components/widgets/crm/trust'
import { CrmToday } from '@/components/widgets/crm/today'
import { CrmMembersRoster } from '@/components/widgets/crm/members-roster'
import { LeadStats } from '@/components/widgets/lead/lead-stats'
import { LeadAttention } from '@/components/widgets/lead/lead-attention'
import { LeadCircles } from '@/components/widgets/lead/lead-circles'
import { LeadNetworks } from '@/components/widgets/lead/lead-networks'
import { LeadEvents } from '@/components/widgets/lead/lead-events'
import { LeadJourneys } from '@/components/widgets/lead/lead-journeys'
import { LeadSpaces } from '@/components/widgets/lead/lead-spaces'
import { LeadPractices } from '@/components/widgets/lead/lead-practices'
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
import { CircleMeeting } from '@/components/widgets/circles/circle-meeting'
import { CircleChallengesBlock } from '@/components/widgets/circles/circle-challenges'
import { CircleInvite } from '@/components/widgets/circles/circle-invite'
import { CircleJourneyRun } from '@/components/widgets/circles/circle-journey-run'
import { CircleText } from '@/components/widgets/circles/circle-text'
import { EventDescription } from '@/components/widgets/events/event-description'
import {
  EventLineup,
  EventSchedule,
  EventGoodToKnow,
  EventPricing,
  EventLinks,
  EventSponsors,
  EventDetailsBlock,
} from '@/components/widgets/events/event-poster-sections'
import { EventCohosts } from '@/components/widgets/events/event-cohosts'
import { EventSales } from '@/components/widgets/events/event-sales'
import { EventDispatch } from '@/components/widgets/events/event-dispatch'
import { EventActivityBlock } from '@/components/widgets/events/event-activity-block'
import { EventRecap } from '@/components/widgets/events/event-recap'
import { EventJoin } from '@/components/widgets/events/event-join'
import { EventWarmProof } from '@/components/widgets/events/event-warm-proof'
import { EventFacts } from '@/components/widgets/events/event-facts'
import { EventLocation } from '@/components/widgets/events/event-location'
import { EventWhenWhere } from '@/components/widgets/events/event-when-where'
import { EventAttendees } from '@/components/widgets/events/event-attendees'
import { EventCheckin } from '@/components/widgets/events/event-checkin'
import { GamificationSeason } from '@/components/widgets/gamification/gamification-season'
import { GamificationRewards } from '@/components/widgets/gamification/gamification-rewards'
import { GamificationMetrics } from '@/components/widgets/gamification/gamification-metrics'
import { GamificationStats } from '@/components/widgets/gamification/gamification-stats'
import { GamificationTopAchievers } from '@/components/widgets/gamification/gamification-top-achievers'
import { GamificationAchievements } from '@/components/widgets/gamification/gamification-achievements'
import { GamificationChallenges } from '@/components/widgets/gamification/gamification-challenges'

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
  // Admin Practices blocks (/admin/content/practices) — the curation workspace.
  'admin-practices-stats': PracticeAdminStats,
  'admin-practices-review': PracticeReviewQueue,
  'admin-practices-merge': PracticeMergeSuggestions,
  'admin-practices-attention': PracticeNeedsAttention,
  'admin-practices-library': PracticeAdminLibrary,
  'admin-practices-tags': PracticeTagGovernance,
  'admin-practices-remix-levers': PracticeRemixLevers,
  'admin-practices-contributor-recognition': PracticeContributorRecognition,
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
  'practice-detail-lineage': PracticeDetailLineage,
  // Programs page (/programs) — the frameworks browse list.
  'programs-list': ProgramsList,
  // Channels page (/channels) — the pillar-grouped topical browse.
  'channels-list': ChannelsList,
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
  // Marketing analytics (/admin/marketing/analytics) — read-models off the event backbone.
  'marketing-analytics-northstar': MarketingAnalyticsNorthStar,
  'marketing-analytics-retention': MarketingAnalyticsRetention,
  'marketing-analytics-crm': MarketingAnalyticsCrm,
  'marketing-analytics-email': MarketingAnalyticsEmail,
  // Deliverability (/admin/marketing/deliverability) — outbox health + dead-letter recovery.
  'marketing-deliverability-health': MarketingDeliverabilityHealth,
  'marketing-deliverability-dead-letters': MarketingDeliverabilityDeadLetters,
  // Resonance Graph (/admin/crm/graph) — the consent-first relationship + health view.
  'crm-graph-metrics': CrmGraphMetrics,
  'crm-graph-connections': CrmGraphConnections,
  // Playbooks (/admin/crm/playbooks) — the saved Vera plays + their run history.
  'crm-playbooks-stats': CrmPlaybooksStats,
  'crm-playbooks-registry': CrmPlaybooksRegistry,
  'crm-playbooks-runs': CrmPlaybooksRuns,
  // Community dashboard (/admin/community) — the people and their spaces as one operator home.
  'community-structure': CommunityStructure,
  'community-trust-safety': CommunityTrustSafety,
  'community-feed-reach': CommunityFeedReach,
  'community-manage': CommunityManage,
  'community-related': CommunityRelated,
  // Audit log (/admin/audit) — the append-only security trail.
  'audit-recent-actions': AuditRecentActions,
  // Structure rosters (/admin/hubs, /admin/nexuses) — the editable network tables.
  'admin-hubs-roster': AdminHubsRoster,
  'admin-nexuses-roster': AdminNexusesRoster,
  // Moderation queue (/admin/moderation) — the community report queue.
  'admin-moderation-queue': AdminModerationQueue,
  // Operations dashboard (/admin/operations) — the platform machine as one operator home.
  'operations-ai': OperationsAi,
  'operations-platform': OperationsPlatform,
  'operations-manage': OperationsManage,
  'operations-related': OperationsRelated,
  // Growth dashboard (/admin/growth) — the growth engine as one operator home.
  'growth-funnel': GrowthFunnel,
  'growth-pipeline': GrowthPipeline,
  'growth-expansion': GrowthExpansion,
  'growth-manage': GrowthManage,
  'growth-related': GrowthRelated,
  // Resonance CRM (/admin/crm) — the Platform Resonance CRM cockpit (ADR-459).
  'crm-members': CrmMembers,
  'crm-cockpit-stats': CrmCockpitStats,
  'crm-rising': CrmRising,
  'crm-trust': CrmTrust,
  // Vera Today (/admin/crm/today) — the person-plus-action inbox.
  'crm-today': CrmToday,
  // Resonance CRM members (/admin/crm/members) — the standalone member-viewer, keyed on the URL facet.
  'crm-members-roster': CrmMembersRoster,
  // Leadership dashboard (/lead) — a leader's consolidated home.
  'lead-stats': LeadStats,
  'lead-attention': LeadAttention,
  'lead-circles': LeadCircles,
  'lead-networks': LeadNetworks,
  'lead-events': LeadEvents,
  'lead-journeys': LeadJourneys,
  'lead-spaces': LeadSpaces,
  'lead-practices': LeadPractices,
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
  'circle-meeting': CircleMeeting,
  'circle-challenges': CircleChallengesBlock,
  'circle-invite': CircleInvite,
  'circle-journey-run': CircleJourneyRun,
  'circle-text': CircleText,
  // Event detail (/events/<slug>) — the FULL arrangeable interior, every section its own movable
  // block (post area + the former Join aside + the per-poster-section blocks).
  'event-join': EventJoin,
  'event-warm-proof': EventWarmProof,
  'event-facts': EventFacts,
  'event-location': EventLocation,
  'event-when-where': EventWhenWhere,
  'event-attendees': EventAttendees,
  'event-checkin': EventCheckin,
  'event-description': EventDescription,
  'event-lineup': EventLineup,
  'event-schedule': EventSchedule,
  'event-good-to-know': EventGoodToKnow,
  'event-pricing': EventPricing,
  'event-links': EventLinks,
  'event-sponsors': EventSponsors,
  'event-details': EventDetailsBlock,
  'event-cohosts': EventCohosts,
  'event-sales': EventSales,
  'event-dispatch': EventDispatch,
  'event-activity': EventActivityBlock,
  'event-recap': EventRecap,
  // Gamification (/admin/gamification) — achievements, challenges, and engagement, plus the
  // janitor-only reward-economy editor (self-gating, renders null for a non-janitor).
  'gamification-season': GamificationSeason,
  'gamification-rewards': GamificationRewards,
  'gamification-metrics': GamificationMetrics,
  'gamification-stats': GamificationStats,
  'gamification-top-achievers': GamificationTopAchievers,
  'gamification-achievements': GamificationAchievements,
  'gamification-challenges': GamificationChallenges,
}

export function componentFor(id: string): ModuleComponent | undefined {
  return COMPONENTS[id]
}

/** Every id with a bound component. The reachability test asserts each is either offered by some
 *  route set or explicitly parked, so a bound-but-unreachable block (site-audit BUG-1) can't recur. */
export const COMPONENT_IDS: readonly string[] = Object.keys(COMPONENTS)
