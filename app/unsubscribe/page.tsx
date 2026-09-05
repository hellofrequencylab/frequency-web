// One-click unsubscribe landing. No login required — that's the point.
// Token in the URL is the authorisation. On load, we immediately flip the
// preference off and show confirmation; the user doesn't need to click
// anything. (RFC 8058 mailbox providers require this no-click behaviour.)
//
// ⚠️ The three lines above are RETIRED (L2-01, 2026-09-05) and kept as the record of what went
// wrong. "On load" meant "on any HTTP GET", and corporate link scanners plus mail-client
// prefetchers GET every link in an email, so members were opted out without ever clicking. The
// RFC 8058 requirement the parenthesis cites is for the `List-Unsubscribe-Post` ONE-CLICK flow,
// where the mailbox provider POSTs to /api/unsubscribe; it never asked a landing PAGE to act on
// GET. So now: a GET of this page only verifies the token and shows a confirm button
// (confirm-unsubscribe.tsx), and `processUnsubscribe` runs solely from the server action the
// click invokes. This file must never import that action: the page render path is GET.

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeToken, verifySpaceUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import { getContactPreferences, CONTACT_TOPICS } from '@/lib/comms/contact-preferences'
import type { NotificationCategory, NotificationTopic } from '@/lib/notification-preferences'
import { PreferenceCenter, type ContactTopicState } from './preference-center'
import { ConfirmUnsubscribe } from './confirm-unsubscribe'
import { Layout, ManageLink } from './card'

// Token-authorised transactional landing (reached from an email link, never crawled). Already in
// robots.ts DISALLOW; this page-level noindex is defense-in-depth so the URL can never enter the index.
export const metadata = { robots: { index: false } }

const CATEGORY_LABELS: Record<string, string> = {
  dispatches: 'Dispatches',
  events:     'event reminders',
  mentions:   'mention notifications',
  comments:   'comment notifications',
  lifecycle:  'onboarding nudges',
}

// `p`/`c` carry the GLOBAL member unsubscribe; `s`/`e` carry the per-Space unsubscribe (a Space
// emails contacts who may have no Frequency profile, so it is keyed on space + email, not profile +
// category). Both share `t` (the HMAC token).
type SP = { p?: string; c?: string; s?: string; e?: string; t?: string }

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const { p, c, s, e, t } = await searchParams

  // Per-Space preference center: instead of a one-shot hard unsubscribe, the token opens a
  // preference center where a contact can opt DOWN individual topics or unsubscribe from
  // everything. The global member preferences are untouched, so this never quiets Frequency
  // itself. (The RFC 8058 one-click POST at /api/unsubscribe still records the full space
  // suppression for the inbox "unsubscribe" button.)
  if (s || e) {
    if (!s || !e || !t || !verifySpaceUnsubscribeToken(s, e, t)) {
      return <Layout title="This link is invalid or expired." description="If you got here from an email, please reply to it and we'll help.">
        <ManageLink />
      </Layout>
    }

    const spaceName = await loadSpaceName(s)
    const stored = await getContactPreferences(e, s)
    const initial: ContactTopicState[] = (CONTACT_TOPICS as readonly NotificationTopic[]).map((topic) => {
      const row = stored.find((r) => r.topic === topic && r.channel === 'email')
      return { topic, subscribed: row ? row.state === 'subscribed' : true }
    })

    return <Layout title={`Email from ${spaceName}`} description="Choose what you'd like to keep. This only affects this one sender, not Frequency itself.">
      <PreferenceCenter spaceId={s} email={e} token={t} spaceName={spaceName} initial={initial} />
      <ManageLink />
    </Layout>
  }

  if (!p || !c || !t) {
    return <Layout title="Missing unsubscribe details." description="This link looks incomplete. If you got here from an email, please reply to it and we'll help.">
      <ManageLink />
    </Layout>
  }

  // GET only VERIFIES. The same HMAC check `processUnsubscribe` runs (a token is minted over
  // profileId + category, so an unknown category fails here too), but nothing is written: a bad
  // link gets the invalid layout, a good one gets a button. The write happens in the action.
  if (!verifyUnsubscribeToken(p, c as NotificationCategory, t)) {
    return <Layout title="This link is invalid or expired." description="If you got here from an email, please reply to it and we'll help.">
      <ManageLink />
    </Layout>
  }

  const label = CATEGORY_LABELS[c] ?? c

  return <ConfirmUnsubscribe profileId={p} category={c} token={t} label={label} />
}

// Best-effort Space name for the preference-center copy. Falls back to a neutral label
// so a missing/renamed Space never breaks the page. Admin client: this page has no login.
async function loadSpaceName(spaceId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('spaces').select('name').eq('id', spaceId).maybeSingle()
    const name = (data as { name?: string } | null)?.name
    return name && name.trim().length ? name.trim() : 'this space'
  } catch {
    return 'this space'
  }
}

// ── Layout helpers ─────────────────────────────────────────────────────
// `Layout`, `Body` and `ManageLink` live in ./card.tsx now, shared with the client confirm step.
