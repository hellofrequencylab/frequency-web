import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { listMyTickets } from '@/lib/support/store'
import { relativeTime } from '@/lib/utils'
import { TYPE_LABELS, STATUS_LABELS } from '@/lib/support/types'
import { getAllCategories, getSearchIndex } from '@/lib/help/content'
import { HelpBody } from '@/components/frequency/members/help/help-body'

export const dynamic = 'force-dynamic'

// A member's support history (ADR-159) — every report they've filed and its status,
// newest activity first. "New report" opens the global capture dialog.
export default async function SupportPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/support')
  const tickets = await listMyTickets(me.id)
  const [categories, index] = await Promise.all([getAllCategories(), getSearchIndex()])
  return (
    <HelpBody
      categories={categories}
      index={index}
      reports={tickets.map((t) => ({
        id: t.id,
        ref: t.ref,
        subject: t.subject,
        status: t.status,
        statusLabel: STATUS_LABELS[t.status],
        typeLabel: TYPE_LABELS[t.type],
        updated: relativeTime(t.lastActivityAt),
      }))}
    />
  )
}

