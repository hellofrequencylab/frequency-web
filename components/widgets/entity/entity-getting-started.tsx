import Link from 'next/link'
import { Sprout, ArrowRight } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { spaceManageHref } from '@/lib/spaces/types'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { spaceProfileIsEmpty, viewerCanEditActiveSpace } from '@/lib/spaces/profile-presence'
import { buttonClasses } from '@/components/ui/button'

// ENTITY MODULE — Getting started (ENTITY-SPACES-BUILD §A.3, the skeptic test). The ONE composite
// empty that makes a brand-new Space read as intentional instead of a column of identical dashed
// boxes (§3). It renders ONLY when the profile has no published content at all (spaceProfileIsEmpty);
// the per-section modules suppress their own empties in that case (see suppressSectionEmpty), so this
// is the single thing a visitor sees. When the Space has any content, this returns null and the real
// sections render as normal.
//
// Two reads, one card:
//   • OWNER (viewerCanEditActiveSpace) — ACTIONABLE: "Your <type> profile is ready to fill in" plus a
//     primary CTA into the management hub to add the first thing. The empties become a to-do, not a void.
//   • MEMBER / visitor — the quiet "just getting started, here's what's coming" voice: names what will
//     land here, no narrated feelings, no false numbers (CONTENT-VOICE §10, the skeptic test).
//
// Placed FIRST in every role's About tab so it leads the index when the Space is empty. NULL when
// there's no active Space (a non-profile route) or the profile has content.

// What lands on a profile, by role — the plain "here's what's coming" list. Role-specific so the
// promise matches the Space's job (§5): a venue talks events, a coach talks curriculum.
const COMING: Record<string, string[]> = {
  practitioner: ['Sessions you can book', 'Practices and Journeys to try', 'Circles to join'],
  business: ['Classes on the schedule', 'Memberships to join', 'The team behind the studio'],
  organization: ['Programs and the work behind them', 'Ways to support', 'Circles to take part in'],
  coaching: ['The curriculum and how it runs', 'Programs to enroll in', 'The coaches you will work with'],
  event_space: ['Events with tickets', 'What the venue hosts', 'Circles around the space'],
}
const DEFAULT_COMING = ['Sessions to book', 'Practices to try', 'Circles to join']

export async function EntityGettingStarted() {
  const space = getActiveSpace()
  if (!space) return null
  if (!(await spaceProfileIsEmpty())) return null

  const name = space.brandName ?? space.name
  const blueprint = blueprintForType(space.type)
  const typeLabel = (blueprint?.typeLabel ?? 'space').toLowerCase()
  const coming = COMING[space.type] ?? DEFAULT_COMING
  const canEdit = await viewerCanEditActiveSpace()
  // The management entry (ADR-441 EM1-3): the unified /manage console for the console types, the
  // legacy /settings hub otherwise. One rule, one helper.
  const settingsHref = spaceManageHref(space.type, space.slug)

  return (
    <section className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 sm:p-8">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong"
        aria-hidden
      >
        <Sprout className="h-5 w-5" />
      </span>

      {canEdit ? (
        <>
          <h2 className="mt-4 text-lg font-bold text-text">Your {typeLabel} profile is ready to fill in.</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Add your first session, practice, or program and it shows up here. Here is what a finished
            profile carries:
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-4 text-lg font-bold text-text">{name} is just getting started.</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            There is nothing to browse yet. Follow along and these show up the moment they go live:
          </p>
        </>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {coming.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-xl bg-surface-elevated/60 px-3 py-2 text-sm text-text"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-5">
          <Link href={settingsHref} className={buttonClasses('primary', 'md')}>
            Set up your profile
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  )
}
