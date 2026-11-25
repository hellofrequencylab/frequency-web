// FIND A TIME FROM AN EMAIL LINK (EMAIL-092). An outside collaborator opens the link a Space's team
// sent them and answers each candidate date Yes, If need be or No, with no account. The token in the
// URL is the authorisation (lib/calendar/time-vote-token.ts); a link that does not verify, has
// expired, or points at a Plan that was put away shows one neutral state and reads nothing more.

import { FocusTemplate } from '@/components/templates'
import { FrequencyUtilityCard } from '@/components/frequency/site/pages/legal/legal-reading'
import { SITE_DESIGN } from '@/lib/theme/design'
import { loadGuestPoll } from '@/lib/calendar/time-vote-guest'
import { GuestVoteForm } from './guest-vote-form'

// Reached from an email, never crawled, and personal to one address.
export const metadata = { title: 'Find a time', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function FindATimePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const poll = await loadGuestPoll(decodeURIComponent(token))
  if (!poll) {
    return (
      <Layout
        title="This link is invalid or expired."
        description="Ask the person who sent it for a fresh link. Links to pick a date work for three weeks."
      >
        <span />
      </Layout>
    )
  }
  return (
    <Layout
      title={`Which dates work for ${poll.planTitle}?`}
      description={`${poll.spaceName} is picking a date. Mark each one, and they will see your answers right away.`}
    >
      <GuestVoteForm token={decodeURIComponent(token)} initial={poll} />
    </Layout>
  )
}

function Layout({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  if (SITE_DESIGN === 'frequency') {
    return (
      <FrequencyUtilityCard title={title} description={description}>
        {children}
      </FrequencyUtilityCard>
    )
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6 py-12">
      <div className="max-w-md w-full bg-surface border border-border rounded-card lift-1 p-8">
        <FocusTemplate title={title} description={description} width="narrow" divider={false}>
          <div className="space-y-3">{children}</div>
        </FocusTemplate>
      </div>
    </div>
  )
}
