import Link from 'next/link'
import { CalendarClock, Eye, SlidersHorizontal, Tag } from 'lucide-react'
import { JourneyAuthorActions } from '@/components/journey/v2/learn/journey-author-actions'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { getJourneyOffer, seatLine } from '@/lib/journeys/paid'
import { HostSchedule } from '@/components/journey/v2/learn/host-schedule'
import { getPlanAuthor, countActiveAdopters } from '@/lib/journey-plans'
import { getLinkedEvent, pillarsById } from '@/lib/journeys/learn'
import { loadJourneyLearnRoute } from '@/lib/journeys/learn-route'
import { phaseLockStates } from '@/lib/journeys/schedule'
import { MeetingBlock, AuthorBlock } from '@/components/journey/v2/learn/journey-overview'
import { CourseProgress, CoursePath, resumePoint, playHref } from '@/components/journey/v2/learn/course-home'
import { LeaveJourneyButton } from '@/components/journey/v2/learn/leave-journey-button'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { JourneyDock } from '@/components/journey/nav/journey-dock'
import { DetailTemplate, PageHero } from '@/components/templates'
import { ShareImageProvider } from '@/components/qr/share-image-context'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'
import { resolveIdentityHero } from '@/lib/layout/detail-hero'
import { accentColor } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'

// THE COURSE HOME — where an enrolled member lands (ADR-252 J1b, split from the player). One of the
// four Journey views the dock links: About (the sales page, /journeys/<slug>), Course (here), Focus
// (the player, /journeys/<slug>/play) and Library (/journeys/library). This page answers how far
// am I, what do I do now, and what is the whole shape; the lesson itself opens in the player.
// The door, the drip anchor and the Run reads live in lib/journeys/learn-route.ts, shared with the
// player so the two routes cannot drift.
export const dynamic = 'force-dynamic'

export default async function JourneyLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const r = await loadJourneyLearnRoute(slug, 'learn')
  const { plan, tree, extras, entry, isAuthor, cohort, kickoff, anchorStart, dripIntervalDays, runId, isRunHost, phaseEventsById } = r
  const canManageJourney = entry.canManage
  const journeyCaps = entry.caps

  const [author, meetupEvent, gatheringEvent] = await Promise.all([
    getPlanAuthor(plan.author_id),
    getLinkedEvent(extras.meeting.eventId),
    getLinkedEvent(extras.meeting.gathering?.eventId ?? null),
  ])

  // Members currently ON this Journey, named in the unpublish confirmation. Author + public only.
  const adopterCount = isAuthor && plan.visibility === 'public' ? await countActiveAdopters(plan.id, r.profileId) : 0

  // The sell chip's state (ADR-1397): a host already in the course can still price without leaving.
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

  const byId = pillarsById(extras.pillars)
  const pillarByLesson: Record<string, string> = {}
  for (const [itemId, practice] of extras.practiceByItem) {
    const pillar = practice.domain_id ? byId.get(practice.domain_id) ?? null : null
    if (pillar) pillarByLesson[itemId] = pillar.name
  }
  const phaseFocusById = Object.fromEntries(extras.phaseFocus)
  const locks = phaseLockStates(tree.phases.length, anchorStart, dripIntervalDays)
  const next = resumePoint(tree, locks)

  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon
  const oStyle = plan.header_overlay_style
  const hero = await resolveIdentityHero(`/journeys/${slug}/learn`, {
    entityImage: plan.cover_image,
    entityFocus: plan.cover_focus,
    defaults: oStyle === 'none' || oStyle === 'shadow' || oStyle === 'fade' ? { overlayStyle: oStyle } : {},
  })

  const quietButton =
    'inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text'

  return (
    <ShareImageProvider imageUrl={plan.cover_image ?? null}>
      <DetailTemplate
        hero={
          <PageHero
            {...hero}
            eyebrow="Your Journey"
            leading={
              plan.logo_image ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator logo on a user-controlled host, not a configured next/image domain
                <img src={plan.logo_image} alt="" className="h-12 w-12 shrink-0 rounded-card object-cover shadow ring-1 ring-on-ink/10" />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-canvas/90 shadow ring-1 ring-on-ink/10 backdrop-blur"
                  style={{ color: accentColor(plan.accent) }}
                >
                  <PlanIcon className="h-6 w-6" />
                </span>
              )
            }
            title={plan.title}
            subtitle={plan.summary || undefined}
          />
        }
        title={plan.title}
        band={
          // Manager controls left, share right, one line. The band always renders: sharing is for
          // everyone (owner ruling, 2026-09-17).
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {canManageJourney && (
                <OpenAdminBarButton
                  scope={{ kind: 'journey', id: plan.id }}
                  caps={Array.from(journeyCaps)}
                  label="Manage"
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  className={quietButton}
                />
              )}
              {canManageJourney && (
                <OpenAdminBarButton
                  scope={{ kind: 'journey', id: plan.id }}
                  caps={Array.from(journeyCaps)}
                  label={sellLabel}
                  icon={<Tag className="h-4 w-4" />}
                  className={
                    sellOffer
                      ? 'inline-flex items-center gap-1.5 rounded-control border border-success/40 bg-success-bg px-3 py-1.5 text-body-sm font-semibold text-success transition-colors hover:bg-success-bg/70'
                      : quietButton
                  }
                />
              )}
              {canManageJourney && (
                <Link href={`/journeys/${slug}`} className={quietButton}>
                  <Eye className="h-4 w-4" aria-hidden /> Sales page
                </Link>
              )}
              {isAuthor && (
                <JourneyAuthorActions slug={slug} planId={plan.id} visibility={plan.visibility} adopterCount={adopterCount} />
              )}
            </div>
            <div className="shrink-0">
              <QrShareDropdown manager={canManageJourney} />
            </div>
          </div>
        }
      >
        <div className="space-y-8">
          <CourseProgress slug={slug} tree={tree} locks={locks} anchorLessonId={extras.anchorItemId} />

          {(kickoff || cohort || (isRunHost && runId)) && (
            <div className="space-y-3">
              {kickoff && (
                <Link
                  href={`/events/${kickoff.slug}`}
                  className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2.5 text-body-sm transition-colors hover:border-primary"
                >
                  <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" />
                  <span className="font-medium text-text">Kickoff meetup</span>
                  <span className="text-muted">
                    {new Date(kickoff.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </Link>
              )}
              {cohort && <CohortMeter progress={cohort} />}
              {cohort && anchorStart && (
                <p className="flex items-center gap-2 text-meta text-muted">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Your Run runs {new Date(anchorStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} through{' '}
                  {new Date(new Date(anchorStart).getTime() + tree.phases.length * dripIntervalDays * 86_400_000).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  .
                </p>
              )}
              {isRunHost && runId && (
                <HostSchedule
                  slug={slug}
                  runId={runId}
                  phases={tree.phases
                    .map((p, i) => ({ id: p.id, label: p.title?.trim() || `Week ${i + 1}` }))
                    .filter((p) => p.id !== 'implicit-phase')}
                  scheduled={phaseEventsById}
                />
              )}
            </div>
          )}

          <CoursePath
            slug={slug}
            tree={tree}
            locks={locks}
            phaseFocusById={phaseFocusById}
            pillarByLesson={pillarByLesson}
            anchorLessonId={extras.anchorItemId}
          />

          <MeetingBlock meeting={extras.meeting} meetupEvent={meetupEvent} gatheringEvent={gatheringEvent} />
          <AuthorBlock author={author} />

          {/* The quiet exit (adoption-lifecycle Phase 0): only an actually-enrolled member sees it. */}
          {entry.enrolled ? (
            <div className="border-t border-border pt-6">
              <LeaveJourneyButton planId={plan.id} journeyTitle={plan.title} />
            </div>
          ) : null}
        </div>

        <JourneyDock
          slug={slug}
          active="course"
          percent={tree.percent}
          aboutHref={isAuthor ? `/journeys/${slug}` : undefined}
          focusHref={playHref(slug, next?.lesson.id)}
        />
      </DetailTemplate>
    </ShareImageProvider>
  )
}
