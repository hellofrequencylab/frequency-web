import { getPracticesToLogToday, getPartialPracticesToday } from '@/lib/practices'
import { getCachedMemberProgress } from '@/lib/member-progress'
import { getMemberPillarBalance } from '@/lib/pillars'
import { PracticePrompt } from '@/components/practice/practice-prompt'
import { JourneyBoard } from '@/components/feed/journey-board'

// THE PRACTICE BOARD, IN THE RAIL (CORE-MODEL §5 Phase 7.5.3, ADR-1294).
//
// This is the module that used to be the top of /feed. The Quest is "a side thing we all do
// together" (ADR-1295), so it keeps its whole function and loses the centre of home: the board
// renders here, in the right rail, and the first module above the composer is the community board.
//
// The SWITCH is unchanged and deliberately still lives here rather than being split into two
// panel keys: before activation completes a member sees PracticePrompt (streak plus the practices
// to log), and after it the board graduates into JourneyBoard. One key, one read, exactly one of
// the two rendered — the same rule the feed hero applied, moved column.
//
// It is its own async Server Component behind the rail's <Suspense>, so these reads never block
// the rest of the rail (PAGE-FRAMEWORK §5). The progress spine comes through
// `getCachedMemberProgress`, so the page's own read of it and this one are one query.
//
// ⚠️ The rail is `hidden lg:flex` (app-shell), so below lg this board is off /feed entirely. That
// is the demotion, not a gap: the phone's home for the game is the left drawer's Vault cluster
// (`MobileGameStats`), which already carries the counts and today's move, and /practices carries
// the log buttons on every viewport.
export async function PracticeBoardPanel({ profileId }: { profileId: string }) {
  const [practices, partials, progress] = await Promise.all([
    getPracticesToLogToday(profileId).catch(() => []),
    getPartialPracticesToday(profileId).catch(() => []),
    getCachedMemberProgress(profileId),
  ])

  const streakState = progress.streakState
  const stageIndex = progress.stage.index

  // Pillar balance is only surfaced from Established (stage 3), so it is only read then.
  const pillarBalance = stageIndex >= 3 ? await getMemberPillarBalance(profileId).catch(() => undefined) : undefined

  // The member's top enrolled Journey, as the board's slim "current step" line (ADR-253).
  const top = progress.journeys[0]
  const activeJourney = top
    ? {
        title: top.title,
        href: '/crew',
        done: top.phasesComplete,
        total: top.phasesTotal,
        nextStepTitle: top.nextLesson?.title ?? null,
      }
    : undefined

  return (
    // Masked for the same reason every rail panel is: streak, Zaps, Gems, rank and today's
    // practices are all live readings (test/e2e/surfaces.ts, VISUAL_MASK_SITES). The boards bring
    // their own card chrome, so this is a bare masked section rather than a WidgetCard around a
    // second box — the same shape ActivityPanel and SignaturePanel take in right-sidebar.tsx.
    <section data-visual-mask="rail-panel">
      {progress.onboarding.complete ? (
        <JourneyBoard
          practices={practices}
          partials={partials}
          streak={streakState.current}
          zaps={progress.standing.seasonZaps}
          gems={progress.standing.lifetimeGems}
          rank={progress.rank.rank}
          atRisk={streakState.atRisk}
          loggedToday={streakState.loggedToday}
          freezeTokens={streakState.freezeTokens}
          willFreezeProtect={streakState.willFreezeProtect}
          stageIndex={stageIndex}
          pillarBalance={pillarBalance}
          activeJourney={activeJourney}
        />
      ) : (
        <PracticePrompt
          practices={practices}
          partials={partials}
          streak={streakState.current}
          atRisk={streakState.atRisk}
          loggedToday={streakState.loggedToday}
        />
      )}
    </section>
  )
}
