import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarClock, Eye, SlidersHorizontal, Tag } from 'lucide-react'
import { JourneyAuthorActions } from '@/components/journey/v2/learn/journey-author-actions'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { getJourneyCapabilities } from '@/lib/core/load-capabilities'
import { createClient } from '@/lib/supabase/server'
import { getJourneyPlayerView } from '@/lib/journeys/store'
import { canEnterJourney } from '@/lib/journeys/entry-gate'
import { getJourneyOffer, seatLine } from '@/lib/journeys/paid'
import { getMemberRunForPlan, getCohortProgress, getSoloEnrollmentStart, getKickoffEvent, getPhaseEvents, type KickoffEvent } from '@/lib/journeys/runs'
import { HostSchedule } from '@/components/journey/v2/learn/host-schedule'
import { getPlanAuthor, isPlanAdopted, countActiveAdopters } from '@/lib/journey-plans'
import { getJourneyLearnExtras, getLinkedEvent, getLoggedTodayPracticeIds, pillarsById } from '@/lib/journeys/learn'
import { getPartialMapToday, type PartialToday } from '@/lib/practices'
import { LearnPlayer } from '@/components/journey/v2/learn/learn-player'
import { PracticeDetail } from '@/components/journey/v2/learn/practice-detail'
import { AboutThisJourneyHero, MeetingBlock, AuthorBlock } from '@/components/journey/v2/learn/journey-overview'
import { LeaveJourneyButton } from '@/components/journey/v2/learn/leave-journey-button'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { DetailTemplate, PageHero } from '@/components/templates'
import { ShareImageProvider } from '@/components/qr/share-image-context'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
import { resolveIdentityHero } from '@/lib/layout/detail-hero'
import { accentColor } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import type { CohortProgress } from '@/lib/journeys/cohort'

// Journeys v2 — the learner player route (ADR-252, J1b). The clean, focused "take this journey"
// surface — overhauled into a fully cohesive COURSE a member follows: the intro/overview, an
// "About this Journey" band (weeks · time · difficulty · reward · cadence · Pillar balance), how
// the Circle meets, the author, and the lesson player with each week's focus + the real practice
// detail (cadence · time · Pillar · the "Why it works / How to do it" write-up) inline. Renders the
// Phase → Module → Lesson tree for the signed-in member. Works on existing (flat) journeys too —
// the tree wraps loose lessons in an implicit phase — so it's reachable before the full v2 cutover.
export const dynamic = 'force-dynamic'

export default async function JourneyLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')

  const profileId = (profile as { id: string }).id
  const view = await getJourneyPlayerView(slug, profileId)
  if (!view) notFound()

  const { plan } = view

  // Visibility gate (mirrors the detail page at [slug]/page.tsx): a PRIVATE Journey is
  // readable only by its author. getJourneyPlayerView -> getPlan loads by slug with no
  // visibility filter, so without this any signed-in member could open an unpublished
  // draft's full lesson bodies + media by hitting /journeys/<slug>/learn directly.
  if (plan.visibility === 'private' && plan.author_id !== profileId) notFound()

  // ── THE DOOR (ADR-1397) ───────────────────────────────────────────────────────────────────────
  //
  // 🔴 THIS PAGE USED TO ADMIT ANY SIGNED-IN MEMBER. The visibility check above was the whole gate,
  // so every lesson body, video and exercise of every public Journey was readable without enrolling,
  // and `journey_enrollments` was a progress record nothing consulted. Owner ruling 2026-09-17:
  // EVERY Journey checks enrolment. That is what makes enrolment mean something, what makes
  // `enroll_cap` real, and what there is to sell.
  //
  // Resolved HERE rather than further down because a refusal must cost one pair of reads, not the
  // whole player. Both facts were already loaded by this page; they have only moved earlier.
  //
  // ⚠️ REFUSAL IS A REDIRECT TO THE JOURNEY'S OWN PAGE, which is its sales page: cover, summary,
  // phase outline, facts and the enrol control all live there. `notFound()` would hide the one page
  // built to convert this visitor, and it stays reserved for the private case above.
  const [journeyCaps, adopted] = await Promise.all([
    getJourneyCapabilities(plan.id),
    isPlanAdopted(profileId, plan.id),
  ])
  const canManageJourney = journeyCaps.has('journey.editSettings')
  const isAuthor = plan.author_id === profileId
  if (!canEnterJourney({ viewerProfileId: profileId, authorId: plan.author_id, canManage: canManageJourney, enrolled: adopted })) {
    redirect(`/journeys/${plan.slug}`)
  }

  // The follow-along extras: the library practice behind each `practice` step, each phase's focus
  // copy, the normalized meeting, and the four-Pillar balance — composed over the existing reads
  // (lib/journeys/learn.ts), plus the author. Loaded in parallel with the Run/cohort resolution.
  const [extras, author, loggedToday, partialMap] = await Promise.all([
    getJourneyLearnExtras(slug),
    getPlanAuthor(plan.author_id),
    getLoggedTodayPracticeIds(profileId),
    // Banked-but-unfinished sits today, keyed by practice id — a timer practice step then offers
    // "Continue Practice" to resume the rest. One read, no per-step query.
    getPartialMapToday(profileId),
  ])
  const partialByPractice: Record<string, PartialToday> = Object.fromEntries(partialMap)

  // The Events each touchpoint gathers around (the Circle Meetup + the Weekend Gathering, ADR-307),
  // resolved to link targets. Null when unset or gone — the block then shows a plain line.
  const [meetupEvent, gatheringEvent] = await Promise.all([
    getLinkedEvent(extras.meeting.eventId),
    getLinkedEvent(extras.meeting.gathering?.eventId ?? null),
  ])

  // If the member is in a Circle Run of this Journey, show the shared cohort meter.
  // Best-effort: hidden (and harmless) until the Runs tables are live.
  // We also resolve the phase-drip ANCHOR here (build item §11.1 #1): a cohort drips from the
  // Run's start, a solo learner from their own enrollment start. null = no drip lock.
  const planDrip = (plan as { drip_interval_days?: number }).drip_interval_days ?? 7
  let cohort: CohortProgress | null = null
  let kickoff: KickoffEvent | null = null
  let anchorStart: string | null = null
  let dripIntervalDays = planDrip
  let runId: string | null = null
  let isRunHost = false
  // Per-week scheduled touchpoint Events (ADR-307), keyed by phase id, serialized for the client.
  let phaseEventsById: Record<
    string,
    { meetup: { slug: string; title: string; startsAt: string } | null; gathering: { slug: string; title: string; startsAt: string } | null }
  > = {}
  try {
    const run = await getMemberRunForPlan(profileId, view.plan.id)
    if (run) {
      runId = run.id
      isRunHost = run.hostId === profileId
      anchorStart = run.startedAt
      dripIntervalDays = run.dripIntervalDays
      // Three independent run reads — cohort progress, the kickoff Event, and the per-week
      // scheduled touchpoints — fetched together instead of in series (site audit 2026-06-18).
      const [cohortProgress, kickoffEvent, pe] = await Promise.all([
        getCohortProgress(run.id, view.plan.id),
        getKickoffEvent(run.id),
        getPhaseEvents(run.id),
      ])
      cohort = cohortProgress
      kickoff = kickoffEvent
      phaseEventsById = Object.fromEntries(
        [...pe.entries()].map(([pid, v]) => [
          pid,
          {
            meetup: v.meetup ? { slug: v.meetup.slug, title: v.meetup.title, startsAt: v.meetup.startsAt } : null,
            gathering: v.gathering ? { slug: v.gathering.slug, title: v.gathering.title, startsAt: v.gathering.startsAt } : null,
          },
        ]),
      )
    } else {
      anchorStart = await getSoloEnrollmentStart(profileId, view.plan.id)
    }
  } catch {
    /* Runs not enabled yet */
  }

  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  // The standardized admin rail trigger (ADR-515 Phase 6). journey.editSettings resolves to the author,
  // platform staff, or a parent-scope manager (getJourneyCapabilities) — so an author OR an operator
  // reaches the Journey's core editable functions (Settings inline · Builder/Layout · Export · Danger) in
  // place, mirroring how the channel page mounts OpenAdminBarButton. Every module re-gates server-side, so
  // this is UX, never the authority.

  // Members currently ON this Journey (excluding the author's own adoption), named in the unpublish
  // confirmation so a creator knows how many people taking it down affects. One `head: true` count,
  // and only for an author looking at a PUBLISHED Journey — nobody else pays for it.
  const adopterCount = isAuthor && plan.visibility === 'public' ? await countActiveAdopters(plan.id, profileId) : 0

  // ── THE SELL CHIP'S STATE (ADR-1397) ──────────────────────────────────────────────────────────
  // 🔴 THIS BAND, NOT THE DETAIL PAGE'S. An author opening /journeys/<slug> is REDIRECTED to this
  // route (page.tsx: isAuthor && !preview), so a price control on the detail page would be invisible
  // to the one person allowed to set a price. Resolved only for a manager, because nobody else can
  // act on it and it is a read nobody else should pay for.
  const sellOffer = canManageJourney ? await getJourneyOffer(plan.id) : null
  const sellLabel = sellOffer
    ? [
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: (sellOffer.currency || 'usd').toUpperCase(),
          maximumFractionDigits: sellOffer.priceCents % 100 === 0 ? 0 : 2,
        }).format(sellOffer.priceCents / 100),
        seatLine(sellOffer),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Set a price'

  // Pre-render the rich practice detail ONCE per practice step (server-rendered markdown, no client
  // cost) and the per-step Pillar names — the player looks both up by the selected lesson id (the
  // RSC interleaving pattern: a Server Component handed to a Client Component as a node map).
  const byId = pillarsById(extras.pillars)
  const detailById: Record<string, ReactNode> = {}
  const pillarByLesson: Record<string, string> = {}
  const practiceIdByLesson: Record<string, string> = {}
  const usesTimerByLesson: Record<string, boolean> = {}
  for (const [itemId, practice] of extras.practiceByItem) {
    const pillar = practice.domain_id ? byId.get(practice.domain_id) ?? null : null
    detailById[itemId] = <PracticeDetail practice={practice} pillar={pillar} />
    if (pillar) pillarByLesson[itemId] = pillar.name
    practiceIdByLesson[itemId] = practice.id
    usesTimerByLesson[itemId] = practice.uses_timer
  }
  const phaseFocusById = Object.fromEntries(extras.phaseFocus)

  // The standardized `header` element (ADR-793), identity layout — the space-page treatment: the cover +
  // a background-aware icon chip + title + summary, with the Manage / author actions riding the image
  // (bottom-right). No breadcrumb under the cover. The "About this Journey" stats live in the body below.
  // The identity band's chrome through the ONE resolver (PROG-P5, ADR-1136) — the same call the
  // Journey overview page makes, so the two surfaces can never drift.
  const oStyle = plan.header_overlay_style
  const hero = await resolveIdentityHero(`/journeys/${slug}/learn`, {
    entityImage: plan.cover_image,
    entityFocus: plan.cover_focus,
    defaults: oStyle === 'none' || oStyle === 'shadow' || oStyle === 'fade' ? { overlayStyle: oStyle } : {},
  })

  return (
    // The framework "QR & Share" control (header actions) centers THIS Journey's cover in its share QR —
    // the entity's own image, never the viewer's avatar.
    <ShareImageProvider imageUrl={plan.cover_image ?? null}>
    <DetailTemplate
      hero={
        <PageHero
          {...hero}
          eyebrow="Journey"
          leading={
            plan.logo_image ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator logo on a user-controlled host, not a configured next/image domain
              <img
                src={plan.logo_image}
                alt=""
                className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow ring-1 ring-on-ink/10"
              />
            ) : (
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-canvas/90 shadow ring-1 ring-on-ink/10 backdrop-blur"
                style={{ color: accentColor(plan.accent) }}
              >
                <PlanIcon className="h-6 w-6" />
              </span>
            )
          }
          title={plan.title}
          subtitle={plan.summary || undefined}
          /* QR & Share is NOT here any more (owner ruling, 2026-09-17: "Move QR button under
             header"). It renders in the band below, with the other controls. Leaving it on the
             cover got worse in the same pass that turned the ink scrim off by default: a glassy
             on-ink button over a raw photograph is exactly the case HERO_ACTION_CLASS was holding
             up, and the band is a plain surface where an ordinary button reads. */
        />
      }
      title={plan.title}
      band={
        // ── THE BAND ALWAYS RENDERS NOW, because QR & Share is in it and sharing is for everyone
        //    (owner ruling, 2026-09-17). It used to render only for an author or a manager, so
        //    hanging the share control off the old condition would have hidden it from exactly the
        //    visitors a share control exists for. Manager controls left, share right, one line.
        (
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {canManageJourney && (
              <OpenAdminBarButton
                scope={{ kind: 'journey', id: plan.id }}
                caps={Array.from(journeyCaps)}
                label="Manage"
                icon={<SlidersHorizontal className="h-4 w-4" />}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              />
            )}
            {/* Selling, in the band rather than only in the rail (ADR-1397). The rail row was
                `tier: 'extra'`, which is a COLLAPSED "More" disclosure at the bottom, and the owner
                could not find it. It is `standard` now, and this chip is the affordance that says a
                price exists (or does not) without opening anything. It OPENS the rail rather than
                carrying a second copy of the form, so there is one editor and one authority.
                Shown to any manager: if they turn out not to be allowed to sell, the rail says why,
                which is a better answer than a control that is simply absent. */}
            {canManageJourney && (
              <OpenAdminBarButton
                scope={{ kind: 'journey', id: plan.id }}
                caps={Array.from(journeyCaps)}
                label={sellLabel}
                icon={<Tag className="h-4 w-4" />}
                className={
                  sellOffer
                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success-bg px-3 py-1.5 text-body-sm font-semibold text-success transition-colors hover:bg-success-bg/70'
                    : 'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text'
                }
              />
            )}
            {/* ── SEE WHAT A BUYER SEES (ADR-1400) ────────────────────────────────────────────
                The sell chip above OPENS THE RAIL and keeps doing so: ADR-1398 §2 put one editor
                and one authority behind it, and this does not touch that. This is the other half
                the author had no way to reach. `/journeys/<slug>` redirects an author straight
                back here (page.tsx: isAuthor && !preview), so the ONLY way for the person setting
                a $444 price to look at the page that charges it is the `?preview=1` escape hatch,
                and nothing in the product linked to it. It matters more now that the page is the
                till rather than a pitch that pointed at one. */}
            {canManageJourney && (
              <Link
                href={`/journeys/${slug}?preview=1`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Eye className="h-4 w-4" aria-hidden /> Sales page
              </Link>
            )}
            {isAuthor && (
              <JourneyAuthorActions
                slug={slug}
                planId={plan.id}
                visibility={plan.visibility}
                adopterCount={adopterCount}
              />
            )}
          </div>
          <div className="shrink-0">
            <QrShareDropdown manager={canManageJourney} />
          </div>
          </div>
        )
      }
    >
      {kickoff && (
        <Link
          href={`/events/${kickoff.slug}`}
          className="mb-4 flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2.5 text-body-sm transition-colors hover:border-primary"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" />
          <span className="font-medium text-text">Kickoff meetup</span>
          <span className="text-muted">
            {new Date(kickoff.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        </Link>
      )}
      {cohort && (
        <div className="mb-4 space-y-2">
          <CohortMeter progress={cohort} />
          {anchorStart && (
            <p className="flex items-center gap-2 text-meta text-muted">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              Your Run runs{' '}
              {new Date(anchorStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} through{' '}
              {new Date(
                new Date(anchorStart).getTime() + view.tree.phases.length * dripIntervalDays * 86_400_000,
              ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              .
            </p>
          )}
        </div>
      )}
      {isRunHost && runId && (
        <HostSchedule
          slug={slug}
          runId={runId}
          phases={view.tree.phases
            .map((p, i) => ({ id: p.id, label: p.title?.trim() || `Week ${i + 1}` }))
            .filter((p) => p.id !== 'implicit-phase')}
          scheduled={phaseEventsById}
        />
      )}

      {/* Overview + course context — what this is, how it's shaped, how it meets, who guides it —
          read above the player so the Journey lands as a cohesive course, not a bare lesson list.
          The hero is two-column: the description on the left, the stat band + key details right. */}
      <div className="mb-6 space-y-6">
        <AboutThisJourneyHero plan={plan} phaseCount={view.tree.phases.length} pillarBalance={extras.pillarBalance} />
        <MeetingBlock meeting={extras.meeting} meetupEvent={meetupEvent} gatheringEvent={gatheringEvent} />
        <AuthorBlock author={author} />
      </div>

      <LearnPlayer
        slug={slug}
        title={plan.title}
        tree={view.tree}
        lessonsById={view.lessonsById}
        detailById={detailById}
        phaseFocusById={phaseFocusById}
        pillarByLesson={pillarByLesson}
        practiceIdByLesson={practiceIdByLesson}
        usesTimerByLesson={usesTimerByLesson}
        anchorLessonId={extras.anchorItemId}
        phaseEventsById={phaseEventsById}
        loggedPracticeIds={loggedToday}
        partialByPractice={partialByPractice}
        certificateEnabled={plan.certificate_enabled}
        anchorStart={anchorStart}
        dripIntervalDays={dripIntervalDays}
      />

      {/* The quiet exit (adoption-lifecycle Phase 0): only an actually-enrolled member sees it.
          Sits below the player so it never competes with the course itself. */}
      {adopted ? (
        <div className="mt-10 border-t border-border pt-6">
          <LeaveJourneyButton planId={view.plan.id} journeyTitle={plan.title} />
        </div>
      ) : null}
    </DetailTemplate>
    </ShareImageProvider>
  )
}
