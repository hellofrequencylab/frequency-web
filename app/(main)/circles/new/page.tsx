import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { canCreate } from '@/lib/core/load-capabilities'
import { CircleWizard } from '@/components/circles/builder/circle-wizard'

// Start a Circle (Stage 4, decision #8). A signed-in member lands in the four-entry
// wizard: start from a Starter Circle, upload an outline, answer a few questions, or
// start from scratch. Nothing persists until a path commits a draft, at which point
// the wizard routes into the full-page builder at /circles/[slug]/edit.
export const dynamic = 'force-dynamic'

export default async function NewCirclePage() {
  const caller = await getCallerProfile()
  if (!caller) redirect('/circles')
  // Any signed-in member may start a circle (LIVE-266): the wall this comment used to
  // describe is what this change took down. The redirect is now only the signed-out and
  // suspended case. What a free member may PUBLISH is still a quantity, metered as
  // `circle_host` in feature-meters.ts and enforced where the circle goes live, never here.
  if (!(await canCreate('circle.create'))) redirect('/circles')

  return <CircleWizard />
}
