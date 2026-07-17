import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { BusinessQuickStartForm } from './business-quickstart-form'

// BUSINESS QUICK-START — the simplest path to a business Space. An authenticated owner drops a name, one
// line on what they do, and their links; createBusinessSpace stands up a PRIVATE business Space seeded
// with a warm cover, their links, and prompts that lead them into writing their own copy, then lands them
// on their new page. A centered, no-rail Focus surface. The server action re-checks auth.

export const metadata = {
  title: 'Start your business page',
  description: 'Stand up a business page on Frequency in under a minute. Drop your name and links, and start from there.',
  robots: { index: false, follow: false },
}

export default async function NewBusinessSpacePage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  return (
    <FocusTemplate
      eyebrow="Spaces"
      title="Start your business page"
      description="Drop a few basics and we will set up your page with your links and a warm look. Then you fill in the prompts in your own words. It starts private, just for you."
      back={{ href: '/spaces/new', label: 'Create a space' }}
    >
      <BusinessQuickStartForm />
    </FocusTemplate>
  )
}
