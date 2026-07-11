import { Suspense } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CaptureBar } from '@/components/feed/capture-bar'
import { CreateMenu } from '@/components/feed/create-menu'
import { FeedList } from '@/components/feed/feed-list'
import { LocalCornerCard } from '@/components/feed/local-corner-card'
import { HostPromptCard } from '@/components/feed/host-prompt-card'
import { RomanceStrip } from '@/components/feed/romance-strip'
import { getLocalActivity } from '@/lib/feed/density'
import { StreamTemplate } from '@/components/templates/stream-template'
import { SectionHeader } from '@/components/ui/section-header'
import { PracticePrompt } from '@/components/practice/practice-prompt'
import { FeedOnboardingGuide } from '@/components/feed/feed-onboarding-guide'
import { AvatarNudge } from '@/components/feed/avatar-nudge'
import { FeedWalkthrough } from '@/components/walkthroughs/feed-walkthrough'
import { FeedRolePromotion } from '@/components/walkthroughs/feed-role-promotion'
import { nextStepsEnabled } from '@/lib/onboarding/status'
import { JourneyBoard } from '@/components/feed/journey-board'
import { VeraLightbox } from '@/components/onboarding/vera-lightbox'
import { autoPopupsEnabled } from '@/lib/onboarding/flags'
import { buildVeraOpening, buildWelcomeSlides } from '@/lib/onboarding/vera-welcome'
import { getPracticesToLogToday, getPartialPracticesToday } from '@/lib/practices'
import { getMemberProgress } from '@/lib/member-progress'
import { getMemberPillarBalance } from '@/lib/pillars'
import { StageCelebration } from '@/components/progress/stage-celebration'
import { AmplitudeCelebration } from '@/components/progress/amplitude-celebration'
import { getAmplitudeCelebration } from '@/lib/amplitude-celebration'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; welcome?: string; v?: string }>
}) {
  const { sort: sortParam, welcome, v } = await searchParams
  const sort: 'recent' | 'relevant' | 'nearby' | 'story' | 'popular' =
    sortParam === 'recent' ? 'recent'
      : sortParam === 'nearby' ? 'nearby'
      : sortParam === 'story' ? 'story'
      : sortParam === 'popular' ? 'popular'
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
  // Default true so we never flash the "add a photo" nudge before we know (ADR-421).
  let hasAvatar = true
  let veraWelcome: { slides: ReturnType<typeof buildWelcomeSlides>; opening: ReturnType<typeof buildVeraOpening> } | null = null

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role, display_name, current_streak, meta, avatar_url')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      myRole = (profile.community_role ?? 'member') as CommunityRole
      firstName = (profile.display_name ?? '').trim().split(/\s+/)[0] || null
      streak = (profile.current_streak as number | null) ?? 0
      hasAvatar = !!(profile as { avatar_url?: string | null }).avatar_url

      // Member geo (ADR-088) + primary circle — independent reads, fetched together rather
      // than back-to-back (site audit 2026-06-18). Geo goes through an untyped handle since the
      // new columns aren't in the generated types yet (cast pattern, per lib/practices.ts).
      const [{ data: geoRow }, { data: membership }] = await Promise.all([
        (admin)
          .from('profiles')
          .select('home_lat, home_lng, feed_radius_m')
          .eq('id', profile.id)
          .maybeSingle(),
        admin
          .from('memberships')
          .select('circle_id')
          .eq('profile_id', profile.id)
          .eq('status', 'active')
          .order('joined_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])
      const geo = (geoRow ?? null) as { home_lat: number | null; home_lng: number | null; feed_radius_m: number | null } | null
      homeLat = geo?.home_lat ?? null
      homeLng = geo?.home_lng ?? null
      feedRadiusM = geo?.feed_radius_m ?? 25000
      primaryCircleId = (membership?.circle_id as string) ?? null

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
    }
  }

  // A post written from the HOME feed lands on the member's own wall + the public feed,
  // never their circle (owner directive 2026-06-21). The circle composer lives on the
  // circle page itself; the home box is always scoped to the member's profile (their wall)
  // and public-visible, so it also surfaces in the feed.
  const composerScopeId = myProfileId
  const composerVisibility = 'public' as const
  const hasCircle = !!primaryCircleId
  const hasHome = homeLat != null && homeLng != null

  // The feed's independent reads, fetched together (they were serial — a visible slice of the
  // page's latency, site audit 2026-06-18): the adopted-practices "log today" nudge (WAM); the
  // member-progress spine (one read folding activation, the daily practice streak, Journeys and
  // rank into a stage — it drives the hero and is read once for all of them, ADR-146); the
  // exactly-once Amplitude level-up banner (Rewards v2); and the two operator switches (default off).
  // Local-activity state + adaptive radius (Resonance Feed Phase 2, ADR-416) joins the batch
  // (site-audit PERF-7: it was awaited serially after this Promise.all, but it only needs the
  // profile id, so it's independent). Drives the founder-vs-location-nudge card AND widens the
  // 'nearby' radius when the area is sparse. Cached, fail-safe.
  const [practicesToLog, partialPractices, progress, amplitudeMoment, nextSteps, autoPopups, localActivity] = await Promise.all([
    myProfileId ? getPracticesToLogToday(myProfileId) : Promise.resolve([]),
    myProfileId ? getPartialPracticesToday(myProfileId) : Promise.resolve([]),
    myProfileId ? getMemberProgress(myProfileId) : Promise.resolve(null),
    myProfileId ? getAmplitudeCelebration(myProfileId) : Promise.resolve(null),
    nextStepsEnabled(),
    autoPopupsEnabled(),
    myProfileId ? getLocalActivity(myProfileId) : Promise.resolve(null),
  ])
  const effectiveRadiusM = localActivity?.effectiveRadiusM ?? feedRadiusM

  const onboarding = progress?.onboarding ?? null
  const practiceStreak = progress?.streakState ?? null
  const stageIndex = progress?.stage.index ?? 0

  // Pillar balance for the graduated board — only surfaced once the member is
  // Established (stage 3), so fetch it only then.
  const pillarBalance = myProfileId && stageIndex >= 3
    ? await getMemberPillarBalance(myProfileId)
    : undefined

  // Top enrolled journey → a slim "current step" line on the graduated board (v2; ADR-253).
  const journeyProgress = progress?.journeys ?? []
  const activeJourney = journeyProgress[0]
    ? {
        title: journeyProgress[0].title,
        href: '/crew',
        done: journeyProgress[0].phasesComplete,
        total: journeyProgress[0].phasesTotal,
        nextStepTitle: journeyProgress[0].nextLesson?.title ?? null,
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
      {autoPopups && veraWelcome && <VeraLightbox slides={veraWelcome.slides} opening={veraWelcome.opening} startInChat={veraStartInChat} />}
      <StreamTemplate
        eyebrow={today}
        title={greeting}
        description={hasCircle ? 'What your people are up to today.' : "What's happening around you."}
        action={<CreateMenu role={myRole} />}
        // Create is compact, so it rides beside the greeting on mobile too.
        inlineAction
      >

      {/* Hero slot. Onboarding incomplete → the persistent teal guide sits up top and
          the streak box (if any) rides below it. Complete → the guide is gone and the
          streak box graduates into the JourneyBoard, which takes the top spot, fronted
          by the stage strip (and a one-time celebration when the stage advances). */}
      {nextSteps && onboarding && !onboarding.complete && <FeedOnboardingGuide status={onboarding} />}

      {/* Walkthroughs (Phase B): a gentle, dismissible in-feed card — pull-based, so the
          right member sees the right card next load. Never blocks the shell. */}
      {myProfileId && (
        <Suspense fallback={null}>
          <FeedWalkthrough profileId={myProfileId} />
        </Suspense>
      )}

      {/* Role-promotion tours (P1.8): the code-shipped tour assignRole queued when this
          member's trust role advanced. Same gentle card + lightbox; resolves to nothing
          when no tour is pending. Never blocks the shell. */}
      {myProfileId && (
        <Suspense fallback={null}>
          <FeedRolePromotion profileId={myProfileId} />
        </Suspense>
      )}

      {progress?.justAdvanced && progress.newlyUnlocked && (
        <StageCelebration
          stageIndex={progress.newlyUnlocked.index}
          stageLabel={progress.newlyUnlocked.label}
          tagline={progress.newlyUnlocked.tagline}
        />
      )}

      {/* Amplitude level-up — mid-tier celebration, exactly-once (Rewards v2). */}
      {amplitudeMoment && (
        <AmplitudeCelebration
          level={amplitudeMoment.level}
          amplitude={amplitudeMoment.amplitude}
          milestoneLabel={amplitudeMoment.milestoneLabel}
        />
      )}

      {onboarding?.complete
        ? <JourneyBoard
            practices={practicesToLog}
            partials={partialPractices}
            streak={practiceStreak?.current ?? streak}
            zaps={progress?.standing.seasonZaps ?? 0}
            gems={progress?.standing.lifetimeGems ?? 0}
            rank={progress?.rank.rank}
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
            partials={partialPractices}
            streak={practiceStreak?.current ?? streak}
            atRisk={practiceStreak?.atRisk ?? false}
            loggedToday={practiceStreak?.loggedToday ?? false}
          />}

      {/* "Add a photo" nudge (ADR-421): a safety net for anyone who landed without an
          avatar (the localStorage-quota loss, a cross-browser magic-link, or any upload
          hiccup). Dismissible; disappears once they add a photo. */}
      {myProfileId && !hasAvatar && <AvatarNudge />}

      {/* Capture — the primary "log a moment" entry (ADR-155/156); posting is one
          mode inside it. Replaces the always-open inline composer. */}
      {composerScopeId && (
        <div className="mb-6">
          <CaptureBar
            scopeId={composerScopeId}
            visibility={composerVisibility}
            placeholder="What’s on your mind?"
            canAnnounce={canAnnounce}
          />
        </div>
      )}

      {/* Sort toggle + feed */}
      <section className="mt-8">
        <SectionHeader
          title={sort === 'nearby' ? 'Nearby' : sort === 'relevant' ? 'Resonance' : sort === 'popular' ? 'Most popular' : sort === 'story' ? 'The community’s story' : 'Most recent'}
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
                Resonance
              </Link>
              <Link
                href="?sort=recent"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sort === 'recent'
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                Most recent
              </Link>
              <Link
                href="?sort=popular"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sort === 'popular'
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                Most popular
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
            A record of what the community lived, not a scroll to consume.
          </p>
        )}

        {/* "Your corner" (Phase 2): a location nudge or a founder prompt when the area is
            empty; nothing when it's already alive. Streamed so it never blocks the feed.
            Shown on the home lenses (not the chronological Story record). */}
        {myProfileId && sort !== 'story' && (
          <div className="mb-4">
            <Suspense fallback={null}>
              <LocalCornerCard viewerProfileId={myProfileId} />
            </Suspense>
          </div>
        )}

        {/* Lone-Wolf -> Local-Host graduation prompt (Beta P2 "Wolf-to-host prompts"):
            the celebratory "you're ready to start a Circle" ask once a member reaches the
            host-ready rank, or the "a few people near you are into this" ignition. Inert
            until platform_flags.beta_host_prompts is on; dismissible + capped so it never
            nags. Streamed so it never blocks the feed. */}
        {myProfileId && sort !== 'story' && (
          <div className="mb-4">
            <Suspense fallback={null}>
              <HostPromptCard viewerProfileId={myProfileId} />
            </Suspense>
          </div>
        )}

        {/* Romance lane (Phase 5, ADR-419): renders ONLY for members who opted into
            romance mode and have mutual opt-ins to show; invisible to everyone else. */}
        {myProfileId && sort === 'relevant' && (
          <div className="mb-4">
            <Suspense fallback={null}>
              <RomanceStrip viewerProfileId={myProfileId} />
            </Suspense>
          </div>
        )}

        {/* The feed query is the heaviest read on the page; stream it behind Suspense so the
            greeting, hero and composer paint immediately and posts fill in (PAGE-FRAMEWORK §5). */}
        <Suspense fallback={<FeedListSkeleton />}>
          <FeedList
            myProfileId={myProfileId}
            sort={sort}
            viewerRole={myRole}
            nearby={hasHome && homeLat != null && homeLng != null ? { lat: homeLat, lng: homeLng, radiusM: effectiveRadiusM } : null}
            emptyMessage={hasCircle
              ? 'Your circle’s quiet right now. Share what’s on your mind.'
              : 'Find your people to fill this up, or share something with the community.'}
          />
        </Suspense>
      </section>
      </StreamTemplate>
    </div>
  )
}

// Lightweight placeholder while the feed query resolves — a few post-shaped pulses so the
// stream has visible structure before the real cards stream in.
function FeedListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-3 w-32 rounded bg-surface-elevated animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-surface-elevated animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-surface-elevated animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
