import { CalendarClock, MapPin } from 'lucide-react'
import { getPlanById, getPlanAuthor, normalizeJourneyMeeting } from '@/lib/journey-plans'
import { getJourneyOffer } from '@/lib/journeys/paid'
import {
  StoryBlock,
  OutcomesBlock,
  PathBlock,
  InstructorBlock,
  JourneyFaq,
  JourneyStatChips,
  journeyFacts,
} from '@/components/journey/discovery-widgets'
import { SectionHeader } from '@/components/ui/section-header'

// THE SALES BODY OF A JOURNEY PRODUCT (ADR-1398), derived live.
//
// ── WHY THIS IS A COMPOSITION AND NOT A NEW PAGE ────────────────────────────────────────────────
//
// The Journey's own page has been a competent sales page for a long time: the story, what you will
// learn, the phase-by-phase path with its first phase open, the guide, the questions. The product
// page had one sentence of it. So this renders THE SAME BLOCKS, from the same rows, rather than a
// second set that would drift from them the first time either is edited.
//
// 🔴 DERIVED, NEVER COPIED (owner ruling, 2026-09-17: "I want info from the journey to auto
// propagate the sales page"). Everything here is read at request time from `journey_plans` and its
// block tree. `commerce_products` keeps a title, a summary and a cover, and those are ONLY the
// Market grid card's fallback so a card can render without a join. Nothing on this page reads them.
// Edit the Journey and the sales page has already changed.
//
// ⚠️ IT DEGRADES TO NOTHING, on purpose. A missing plan, an empty block tree or a null intro each
// render nothing rather than an empty shell: every block below already returns null when it has no
// content, and a product whose Journey has been deleted still shows its price and its Buy button.
// A sales page that cannot load its story is worse than one that is short.

export async function JourneySalesBody({
  planId,
  proof,
}: {
  planId: string
  /**
   * The reviews block, rendered BETWEEN the guide and the questions (ADR-1401).
   *
   * Proof reads best after the thing being proved and before the objections it answers, which is
   * the order every cohort-sales guide converges on. It used to sit AFTER the FAQ, because the
   * host page appended it below this whole body — so the page ran story, curriculum, guide,
   * objections, and only then the evidence, with the live Q&A composer after that.
   *
   * A SLOT rather than a read: reviews are keyed to the product row, which this component
   * deliberately knows nothing about (it derives everything from the Journey).
   */
  proof?: React.ReactNode
}) {
  const loaded = await getPlanById(planId)
  if (!loaded) return null
  const { plan, items } = loaded

  const author = await getPlanAuthor(plan.author_id)
  // 🔴 THE REAL COUNT. This read `enrolledCount={0}` -- a literal, not a fallback -- so the one
  // chip on this page that is social proof could never appear on the page where it matters most.
  // `getJourneyOffer` already counts live enrolments against the author's real cap for the seat
  // line, so the number is derived exactly like every other fact here and no host can type it.
  const offer = await getJourneyOffer(plan.id)
  const facts = journeyFacts(items)
  const meeting = normalizeJourneyMeeting(plan.meeting)
  const t = meeting.gathering ?? meeting

  // The meeting is the one fact a cohort buyer needs and no existing block shows: where it is, when
  // it runs, and what a session costs them in hours. For Heart on Fire that is the Royal Temple line,
  // and it reaches this page without anyone typing it twice.
  const hasMeeting = !!(t.location || t.schedule || meeting.notes)

  return (
    <div className="space-y-8">
      <JourneyStatChips facts={facts} plan={plan} enrolledCount={offer?.enrolled ?? 0} />

      {/* The long copy. `intro` is the course description AND the sales copy: it opens on the
          problem, says what the four weeks do, and closes on the philosophy. Rendering it here is
          the whole of the owner's "auto propagate" ask. */}
      <StoryBlock intro={plan.intro} />

      <OutcomesBlock summary={plan.summary} />

      {/* The curriculum. Cohort buyers want the calendar before they want the pitch, and PathBlock
          already opens phase one and marks it a free preview. */}
      <PathBlock items={items} accent={plan.accent} facts={facts} dripIntervalDays={plan.drip_interval_days} />

      {hasMeeting && (
        <section>
          <SectionHeader title="How it meets" />
          <div className="space-y-2 rounded-2xl border border-border bg-surface p-5 lift-1">
            {t.location && (
              <p className="flex items-center gap-2 text-body-sm text-text">
                <MapPin className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                {t.location}
              </p>
            )}
            {t.schedule && (
              <p className="flex items-center gap-2 text-body-sm text-text">
                <CalendarClock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                {t.schedule}
                {t.timezone ? ` ${t.timezone}` : ''}
              </p>
            )}
            {meeting.notes && <p className="text-body-sm leading-relaxed text-muted">{meeting.notes}</p>}
          </div>
        </section>
      )}

      <InstructorBlock author={author} />

      {proof}

      <JourneyFaq plan={plan} />
    </div>
  )
}
