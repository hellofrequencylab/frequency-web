import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CaptureBar } from '@/components/feed/capture-bar'
import { CreateMenu } from '@/components/feed/create-menu'
import { FeedList } from '@/components/feed/feed-list'
import { StreamTemplate } from '@/components/templates/stream-template'
import { SectionHeader } from '@/components/ui/section-header'
import { PracticePrompt } from '@/components/practice/practice-prompt'
import { FeedOnboardingGuide } from '@/components/feed/feed-onboarding-guide'
import { JourneyBoard } from '@/components/feed/journey-board'
import { VeraLightbox } from '@/components/onboarding/vera-lightbox'
import { buildVeraOpening, buildWelcomeSlides } from '@/lib/onboarding/vera-welcome'
import { getPracticesToLogToday } from '@/lib/practices'
import { getMemberProgress } from '@/lib/member-progress'
import { getMemberPillarBalance } from '@/lib/pillars'
import { StageStrip } from '@/components/progress/stage-strip'
import { StageCelebration } from '@/components/progress/stage-celebration'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; welcome?: string; v?: string }>
}) {
  const { sort: sortParam, welcome, v } = await searchParams
  const sort: 'recent' | 'relevant' | 'nearby' | 'story' =
    sortParam === 'recent' ? 'recent'
      : sortParam === 'nearby' ? 'nearby'
      : sortParam === 'story' ? 'story'
      : 'relevant'
  const showVeraWelcome = welcome === 'vera'
  // "Ask Vera" opens straight in chat; the post-induction welcome plays the deck.
  const veraStartInChat = v === 'chat'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  let myProfileId: string | null = null
  let myRole: CommunityRole = 'member'
  let primaryCircleId: string | null = null
  let canAnnounce = false
  let firstName: string | null = null
  let streak = 0
  let homeLat: number | null = null
  let homeLng: number | null = null
  let feedRadiusM = 25000
  let veraWelcome: { slides: ReturnType<typeof buildWelcomeSlides>; opening: ReturnType<typeof buildVeraOpening> } | null = null

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role, display_name, current_streak, meta')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      myRole = (profile.community_role ?? 'member') as CommunityRole
      firstName = (profile.display_name ?? '').trim().split(/\s+/)[0] || null
      streak = (profile.current_streak as number | null) ?? 0

      // Member geo (ADR-088) — read through an untyped handle since the new columns
      // aren't in the generated types yet (cast pattern, per lib/practices.ts).
      const { data: geoRow } = await (admin as unknown as SupabaseClient)
        .from('profiles')
        .select('home_lat, home_lng, feed_radius_m')
        .eq('id', profile.id)
        .maybeSingle()
      const geo = (geoRow ?? null) as { home_lat: number | null; home_lng: number | null; feed_radius_m: number | null } | null
      homeLat = geo?.home_lat ?? null
      homeLng = geo?.home_lng ?? null
      feedRadiusM = geo?.feed_radius_m ?? 25000

      // Vera's onboarding lightbox continues from what induction already learned
      // (profiles.meta.beta), so she never opens cold. Built only when arriving
      // straight from induction (?welcome=vera).
      if (showVeraWelcome) {
        const beta = ((profile.meta as Record<string, unknown> | null)?.beta ?? {}) as {
          intent?: string | null
          interests?: string | null
          location?: { label?: string | null } | null
        }
        const ctx = {
          firstName,
          intent: beta.intent ?? null,
          interests: beta.interests ?? null,
          location: beta.location?.label ?? null,
        }
        veraWelcome = { slides: buildWelcomeSlides(ctx), opening: buildVeraOpening(ctx) }
      }
      canAnnounce = ['host', 'guide', 'mentor', 'janitor'].includes(myRole)

      const { data: membership } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      primaryCircleId = (membership?.circle_id as string) ?? null
    }
  }

  const composerScopeId = primaryCircleId ?? myProfileId
  const composerVisibility: 'public' | 'group' = primaryCircleId ? 'group' : 'public'
  const hasCircle = !!primaryCircleId
  const hasHome = homeLat != null && homeLng != null

  // Adopted practices not yet logged today -> the feed "log today" nudge (WAM).
  const practicesToLog = myProfileId ? await getPracticesToLogToday(myProfileId) : []

  // The member progress spine — one read that folds activation, the daily practice
  // streak, Journeys and rank into a stage. It drives the hero: a teal onboarding
  // guide until set up, then the JourneyBoard, which reveals more panels as the
  // stage climbs (progressive disclosure, ADR-146). It also carries the activation
  // status, the streak and the Journeys, so the feed reads them all just once.
  const progress = myProfileId ? await getMemberProgress(myProfileId) : null
  const onboarding = progress?.onboarding ?? null
  const practiceStreak = progress?.streakState ?? null
  const stageIndex = progress?.stage.index ?? 0
  const nextGateLabel = progress?.nextGates.find((g) => !g.met)?.label ?? null

  // Pillar balance for the graduated board — only surfaced once the member is
  // Established (stage 3), so fetch it only then.
  const pillarBalance = myProfileId && stageIndex >= 3
    ? await getMemberPillarBalance(myProfileId)
    : undefined

  // Top active journey → a slim "current step" line on the graduated board.
  const journeyProgress = progress?.journeys ?? []
  const activeJourney = journeyProgress[0]
    ? {
        title: journeyProgress[0].plan.title,
        href: '/crew/journey',
        done: journeyProgress[0].done,
        total: journeyProgress[0].total,
        nextStepTitle: journeyProgress[0].nextItem?.practice?.title ?? null,
      }
    : undefined

  // Warm, time-aware greeting headline (the feed is "home", so it greets you).
  // Greet in the community's timezone (the beta is North County San Diego) so the
  // server's UTC clock doesn't roll the date + greeting forward late at night.
  const tz = 'America/Los_Angeles'
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }))
  const partOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const greeting = firstName ? `${partOfDay}, ${firstName}` : partOfDay
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  })

  return (
    <div className="max-w-2xl mx-auto w-full">
      {veraWelcome && <VeraLightbox slides={veraWelcome.slides} opening={veraWelcome.opening} startInChat={veraStartInChat} />}
      <StreamTemplate
        eyebrow={today}
        title={greeting}
        description={hasCircle ? 'What your people are up to today.' : "What's happening around you."}
        action={<CreateMenu role={myRole} />}
      >

      {/* Hero slot. Onboarding incomplete → the persistent teal guide sits up top and
          the streak box (if any) rides below it. Complete → the guide is gone and the
          streak box graduates into the JourneyBoard, which takes the top spot, fronted
          by the stage strip (and a one-time celebration when the stage advances). */}
      {onboarding && !onboarding.complete && <FeedOnboardingGuide status={onboarding} />}

      {progress?.justAdvanced && progress.newlyUnlocked && (
        <StageCelebration
          stageIndex={progress.newlyUnlocked.index}
          stageLabel={progress.newlyUnlocked.label}
          tagline={progress.newlyUnlocked.tagline}
        />
      )}

      {onboarding?.complete && progress && (
        <StageStrip
          stageIndex={progress.stage.index}
          stageLabel={progress.stage.label}
          tagline={progress.stage.tagline}
          nextStageLabel={progress.next?.label ?? null}
          nextGateLabel={nextGateLabel}
        />
      )}

      {onboarding?.complete
        ? <JourneyBoard
            practices={practicesToLog}
            streak={practiceStreak?.current ?? streak}
            atRisk={practiceStreak?.atRisk ?? false}
            loggedToday={practiceStreak?.loggedToday ?? false}
            freezeTokens={practiceStreak?.freezeTokens ?? 0}
            willFreezeProtect={practiceStreak?.willFreezeProtect ?? false}
            stageIndex={stageIndex}
            pillarBalance={pillarBalance}
            activeJourney={activeJourney}
          />
        : <PracticePrompt
            practices={practicesToLog}
            streak={practiceStreak?.current ?? streak}
            atRisk={practiceStreak?.atRisk ?? false}
            loggedToday={practiceStreak?.loggedToday ?? false}
          />}

      {/* Capture — the primary "log a moment" entry (ADR-155/156); posting is one
          mode inside it. Replaces the always-open inline composer. */}
      {composerScopeId && (
        <div className="mb-6">
          <CaptureBar
            scopeId={composerScopeId}
            visibility={composerVisibility}
            placeholder={primaryCircleId ? 'What’s on your mind? Your circle’s listening.' : 'What’s on your mind?'}
            canAnnounce={canAnnounce}
          />
          {!primaryCircleId && (
            <p className="text-xs text-subtle -mt-2 px-1">
              <Link href="/circles" className="text-primary-strong hover:underline">
                Join a circle
              </Link>{' '}
              to post to your group instead.
            </p>
          )}
        </div>
      )}

      {/* Sort toggle + feed */}
      <section className="mt-8">
        <SectionHeader
          title={sort === 'nearby' ? 'Nearby' : sort === 'relevant' ? 'For you' : sort === 'story' ? 'The community’s story' : 'Recent'}
          action={
            <div className="flex items-center gap-0.5 bg-surface-elevated rounded-lg p-0.5">
              {hasHome && (
                <Link
                  href="?sort=nearby"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    sort === 'nearby'
                      ? 'bg-surface text-text shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  Nearby
                </Link>
              )}
              <Link
                href="?sort=relevant"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sort === 'relevant'
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                For you
              </Link>
              <Link
                href="?sort=recent"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sort === 'recent'
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                Recent
              </Link>
              <Link
                href="?sort=story"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sort === 'story'
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                Story
              </Link>
            </div>
          }
        />

        {sort === 'story' && (
          <p className="-mt-1 mb-4 px-1 text-xs text-muted">
            A record of what the community lived — not a scroll to consume.
          </p>
        )}

        <FeedList
          myProfileId={myProfileId}
          sort={sort}
          viewerRole={myRole}
          nearby={hasHome && homeLat != null && homeLng != null ? { lat: homeLat, lng: homeLng, radiusM: feedRadiusM } : null}
          emptyMessage={hasCircle
            ? 'Your circle’s quiet right now. Share what’s on your mind.'
            : 'Find your people to fill this up — or share something with the community.'}
        />
      </section>
      </StreamTemplate>
    </div>
  )
}
