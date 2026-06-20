'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for enrollment (ENTITY-SPACES-SYSTEM §2.7, MASTER-PLAN ADMIN-02).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure program
// helpers or the shared types. Those live in lib/spaces/enroll.ts (no directive: pure helpers + IO +
// the action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// surfaces import, so the mutations cross the network boundary as proper Server Actions:
//   program-form.tsx        -> setSpaceProgram
//   enroll-button.tsx       -> enrollInProgram
//   enrollment-cancel-button.tsx -> cancelEnrollment
//
// SERVER components (the enroll surface, the owner enrollee list, the pages) import the READ actions
// (getSpaceProgram / getProgramWithSeats / getSpaceProgramForOwner / getMyEnrollment /
// listSpaceEnrollments) directly from lib/spaces/enroll.ts: they never cross a client boundary, so
// they need no wrapper. The authorization + validation all live in the implementations; these
// wrappers just re-expose them.

import {
  setSpaceProgram as setSpaceProgramImpl,
  enrollInProgram as enrollInProgramImpl,
  cancelEnrollment as cancelEnrollmentImpl,
} from '@/lib/spaces/enroll'
import { type ActionResult } from '@/lib/action-result'

/** Set (create or replace) a Space's program. Gated on canEditProfile (see the implementation). */
export async function setSpaceProgram(
  spaceId: string,
  raw: {
    name: string
    description?: string | null
    schedule?: string | null
    startsOn?: string | null
    endsOn?: string | null
    capacity?: number
    isPublished?: boolean
  },
): Promise<ActionResult> {
  return setSpaceProgramImpl(spaceId, raw)
}

/** Enroll in a Space's program. Any authenticated member; v1 records the enrollment and takes no charge. */
export async function enrollInProgram(spaceId: string): Promise<ActionResult> {
  return enrollInProgramImpl(spaceId)
}

/** Cancel an enrollment. The member who enrolled or a space admin only (gated in the implementation). */
export async function cancelEnrollment(enrollmentId: string): Promise<ActionResult> {
  return cancelEnrollmentImpl(enrollmentId)
}
