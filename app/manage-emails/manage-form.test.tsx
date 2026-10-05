import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NOTIFICATION_CATEGORIES } from '@/lib/notification-preferences'
import { isPreferenceWired } from '@/lib/notifications/wired'
import { CATEGORY_LABELS, ManageEmailsForm } from './manage-form'

// SCAN-733: the form renders nothing for a category with no label, so a category that
// lib/notifications/wired.ts wires to email but CATEGORY_LABELS omits is built by page.tsx and then
// silently dropped. The `matches` row went missing this way, and a member could not turn match
// emails off, or back on, from the page that says it manages their email. Both directions are
// pinned: every email-wired category has a label, and the form shows a switch for each.

const EMAIL_WIRED = NOTIFICATION_CATEGORIES.filter((category) => isPreferenceWired('email', category))

describe('manage-emails CATEGORY_LABELS', () => {
  it('has a label for every category wired to email', () => {
    const missing = EMAIL_WIRED.filter((category) => !CATEGORY_LABELS.some((c) => c.key === category))
    expect(missing, `email-wired categories with no label in app/manage-emails/manage-form.tsx: ${missing.join(', ')}`).toEqual([])
  })

  it('renders a switch for every email-wired category it is given', () => {
    const html = renderToStaticMarkup(
      <ManageEmailsForm
        profileId="profile-1"
        tokenCategory="matches"
        token="t"
        initial={EMAIL_WIRED.map((category) => ({ category, subscribed: true }))}
      />,
    )
    const switches = html.match(/role="switch"/g) ?? []
    expect(switches).toHaveLength(EMAIL_WIRED.length)
    expect(html).toContain('aria-label="Roommate matches"')
  })
})
