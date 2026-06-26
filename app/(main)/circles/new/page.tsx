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
  // Real Crew (or steward/staff) may start a circle; a free member is bounced back to
  // the index, where the "Start a circle" affordance shows the free-beta upgrade popup.
  if (!(await canCreate('circle.create'))) redirect('/circles')

  return <CircleWizard />
}
