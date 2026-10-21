import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { aiEnabled } from '@/lib/ai/client'
import { LaunchFlow } from './launch-flow'

// LAUNCH YOUR PAGE: the owner-facing front door onto the Business Seeder pipeline. A member answers a few
// plain questions and Vera drafts a page in the standard Space layout. When AI is off the member is sent to
// the by-hand Create a Space wizard, which is always there.

export const metadata = {
  title: 'Launch your page',
  description: 'Answer a few questions and Vera drafts your page, laid out like every Space on Frequency.',
  robots: { index: false, follow: false },
}

export default async function LaunchPage() {
  if (!(await getMyProfileId())) redirect('/sign-in')
  if (!aiEnabled()) redirect('/spaces/new')
  return (
    <FocusTemplate
      eyebrow="Spaces"
      title="Launch your page"
      description="A few questions, then Vera drafts your page. You look it over before anything goes live."
      back={{ href: '/spaces/new', label: 'Create by hand' }}
    >
      <LaunchFlow />
    </FocusTemplate>
  )
}
