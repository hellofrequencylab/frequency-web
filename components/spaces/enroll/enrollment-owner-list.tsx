import { Users } from 'lucide-react'
import { listSpaceEnrollments } from '@/lib/spaces/enroll'
import { EmptyState } from '@/components/ui/empty-state'
import { EnrollmentCancelButton } from '@/components/spaces/enroll/enrollment-cancel-button'

// OWNER ENROLLEE LIST (ENTITY-SPACES-SYSTEM §2.7, enroll v1). A self-fetching server component for the
// owner enroll surface: the Coaching Space's active enrollees (member name + enrolled date), gated on
// canEditProfile inside listSpaceEnrollments. Each row carries a Remove affordance (the member or a
// space admin may cancel; the owner is always an admin of their Space). No em or en dashes
// (CONTENT-VOICE §10).

export async function EnrollmentOwnerList({ spaceId }: { spaceId: string }) {
  const enrollees = await listSpaceEnrollments(spaceId)

  if (enrollees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No one has enrolled yet."
        description="When a member enrolls in your program, they show here."
      />
    )
  }

  const sinceFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {enrollees.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{e.memberName}</p>
            <p className="text-xs text-muted">Enrolled {sinceFmt.format(new Date(e.enrolledAt))}</p>
          </div>
          <EnrollmentCancelButton enrollmentId={e.id} />
        </li>
      ))}
    </ul>
  )
}
