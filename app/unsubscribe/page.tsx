// One-click unsubscribe landing. No login required — that's the point.
// Token in the URL is the authorisation. On load, we immediately flip the
// preference off and show confirmation; the user doesn't need to click
// anything. (RFC 8058 mailbox providers require this no-click behaviour.)

import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { processUnsubscribe } from './actions'
import { isError } from '@/lib/action-result'

const CATEGORY_LABELS: Record<string, string> = {
  dispatches: 'broadcasts',
  events:     'event reminders',
  mentions:   'mention notifications',
  lifecycle:  'onboarding nudges',
}

type SP = { p?: string; c?: string; t?: string }

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const { p, c, t } = await searchParams

  if (!p || !c || !t) {
    return <Layout title="Missing unsubscribe details." description="This link looks incomplete. If you got here from an email, please reply to it and we'll help.">
      <ManageLink />
    </Layout>
  }

  const result = await processUnsubscribe({ profileId: p, category: c, token: t })

  if (isError(result)) {
    return <Layout title="Couldn't process unsubscribe" description={result.error}>
      <ManageLink />
    </Layout>
  }

  const label = CATEGORY_LABELS[result.data.category] ?? result.data.category

  return <Layout title="You're unsubscribed." description={`You'll no longer receive ${label} from Frequency by email.`}>
    <Body>You can re-enable this any time, and adjust other notification types, from your settings.</Body>
    <ManageLink />
  </Layout>
}

// ── Layout helpers ─────────────────────────────────────────────────────

function Layout({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 py-12">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-8">
        <Link
          href="/"
          className="inline-block text-xl font-black tracking-tight text-gray-900 dark:text-gray-50 mb-6"
        >
          frequency
        </Link>
        <FocusTemplate title={title} description={description} width="narrow" divider={false}>
          <div className="space-y-3">{children}</div>
        </FocusTemplate>
      </div>
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{children}</p>
}

function ManageLink() {
  return (
    <div className="pt-3">
      <Link
        href="/settings/notifications"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors"
      >
        Manage all preferences →
      </Link>
    </div>
  )
}
