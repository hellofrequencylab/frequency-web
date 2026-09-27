import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { circleDoor } from '@/lib/circles/locked-door'
import type { CircleJoinReason } from '@/lib/circles/visibility'

// The body a viewer who may SEE this Circle but not ENTER it gets, in place of the tabs
// (LIVE-519). Before this they got the tabs themselves, rendering against a roster the shell had
// deliberately blanked: a Circle with zero members, empty bodies, and nothing saying why.
//
// The sentence and the destination are `circleDoor()`, which is pure and tested on its own. This
// component only renders them, through the SAME `EmptyState variant="permission"` the Circle's
// own stats tab uses for its narrower boundary, so the two boundaries read as one product rather
// than two authors.
export function CircleLocked({
  reason,
  circleSlug,
  spaceSlug,
  spaceName,
}: {
  reason: CircleJoinReason
  circleSlug: string
  spaceSlug: string | null
  spaceName: string | null
}) {
  const door = circleDoor({ reason, circleSlug, spaceSlug, spaceName })

  return (
    <div className="mx-auto max-w-xl py-4">
      <EmptyState
        variant="permission"
        title={door.title}
        description={door.body}
        action={
          door.action ? (
            <Link
              href={door.action.href}
              className="inline-flex rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary lift-1 transition-colors hover:bg-primary-hover"
            >
              {door.action.label}
            </Link>
          ) : undefined
        }
      />
    </div>
  )
}
