import { BadgeCheck, CalendarDays, GraduationCap, Users } from 'lucide-react'
import { getProgramWithSeats, getMyEnrollment } from '@/lib/spaces/enroll'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { EnrollButton } from '@/components/spaces/enroll/enroll-button'
import { EnrollmentCancelButton } from '@/components/spaces/enroll/enrollment-cancel-button'

// MEMBER ENROLL SURFACE (ENTITY-SPACES-SYSTEM §2.7 "Coaching academy", MASTER-PLAN ADMIN-04). The
// self-fetching server half of the Coaching "Enroll" tab: it loads this Space's published program
// (with a live seat count) and the viewer's own enrollment (if any), then renders the program details
// and an Enroll button (or, when the viewer is already enrolled, their status + a Cancel). When the
// owner has not published a program, an EmptyState names the situation and the next step.
// Server-first; the fetch sits behind a <Suspense> in the caller (entity-cta) so the tab paints
// instantly (PAGE-FRAMEWORK §5).
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment. Enrolling reserves a seat; paid
// enrollment comes later. The copy here and in the button says so plainly, with no narrated feelings
// and no em/en dashes (CONTENT-VOICE §10).

/** A YYYY-MM-DD date string to a plain label, e.g. "June 23, 2026". The stored date is calendar-only
 *  (no time), so we render it in UTC to avoid a timezone shifting the day. */
function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/** The program's date range as one plain line, or null when no dates are set. */
function rangeLabel(startsOn: string | null, endsOn: string | null): string | null {
  if (startsOn && endsOn) return `${dateLabel(startsOn)} to ${dateLabel(endsOn)}`
  if (startsOn) return `Starts ${dateLabel(startsOn)}`
  if (endsOn) return `Through ${dateLabel(endsOn)}`
  return null
}

export async function EnrollMember({
  spaceId,
  slug,
  ownerProfileId,
}: {
  spaceId: string
  slug: string
  ownerProfileId: string | null
}) {
  const [withSeats, mine] = await Promise.all([
    getProgramWithSeats(spaceId),
    getMyEnrollment(spaceId),
  ])

  if (!withSeats) {
    // OPERATOR (owner / admin / editor): guide them to post a program instead of the member empty state.
    if (await viewerManagesSpace({ id: spaceId, ownerProfileId })) {
      return (
        <AdminSetupPrompt
          icon={GraduationCap}
          title="Your button opens enrollment, but no program is posted."
          description="Add a program members can enroll in. You can also change what your button opens."
          links={[
            { href: `/spaces/${slug}/settings/offerings#enroll`, label: 'Set up your program' },
            {
              href: `/spaces/${slug}/manage/mode`,
              label: 'Change what your button opens',
              tone: 'secondary',
            },
          ]}
        />
      )
    }
    return (
      <EmptyState
        icon={GraduationCap}
        title="No program open yet."
        description="This space has not posted a program. Follow it to hear the moment enrollment opens."
      />
    )
  }

  const { program, seatsLeft } = withSeats
  const range = rangeLabel(program.startsOn, program.endsOn)
  const full = seatsLeft === 0

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-base font-bold leading-tight text-text">{program.name}</h3>

        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          {program.schedule && (
            <li className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span>{program.schedule}</span>
            </li>
          )}
          {range && (
            <li className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span>{range}</span>
            </li>
          )}
          {seatsLeft != null && (
            <li className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span>{seatsLeft === 0 ? 'No seats left' : `${seatsLeft} seats left`}</span>
            </li>
          )}
        </ul>

        {program.description && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{program.description}</p>
        )}

        <div className="mt-4">
          {mine ? (
            <div className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-center">
              <BadgeCheck className="mx-auto mb-1.5 h-6 w-6 text-success" aria-hidden />
              <p className="text-sm font-semibold text-text">You are enrolled.</p>
              <p className="mt-0.5 text-2xs text-muted">
                Enrolled {dateLabel(mine.enrolledAt.slice(0, 10))}.
              </p>
              <div className="mt-3 flex justify-center">
                <EnrollmentCancelButton
                  enrollmentId={mine.id}
                  label="Cancel enrollment"
                  align="center"
                />
              </div>
            </div>
          ) : (
            <EnrollButton spaceId={spaceId} full={full} />
          )}
        </div>
      </div>

      {!mine && (
        <p className="text-2xs text-subtle">
          Enrolling reserves your seat. We do not take a payment yet, so paid enrollment comes later.
        </p>
      )}
    </div>
  )
}
