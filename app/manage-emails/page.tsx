// "Manage emails" preference landing. Reached from the footer "Manage emails" link, which carries the SAME
// (profileId, category) HMAC token as the one-click unsubscribe. No login required: the token is the
// authorisation. Unlike /unsubscribe (which opts you out on load, RFC 8058 no-click), this page shows the
// per-category email toggles so a member can turn types off, back on, or leave the rest alone.
//
// Fail-closed: a bad or missing token shows a neutral "invalid or expired" state and never reveals whether
// the profile exists. The tokenless case (the composer-preview footer fallback) lands here too and is routed
// to settings, so the footer link is never dead.

import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import {
  getPreferences,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/lib/notification-preferences'
import { isPreferenceWired } from '@/lib/notifications/wired'
import { ManageEmailsForm, type EmailCategoryState } from './manage-form'

// Token-authorised transactional landing (reached from an email link, never crawled). noindex as
// defense-in-depth so the URL can never enter the index.
export const metadata = { robots: { index: false } }

// The order email types read in on the page (mirrors the settings notifications form).
// 🔴 Only the WIRED ones render (lib/notifications/wired.ts). "Replies" and "Mentions" sat here as
// live-looking subscriptions, default ON, to email no emitter has ever sent (meta-scan B9 D6, the
// SCAN-528 shape); a member reading this page believed they were subscribed to mail that could not
// arrive. The vocabulary stays in order so a shipped emitter reappears in its place.
const DISPLAY_ORDER: NotificationCategory[] = ['dispatches', 'events', 'comments', 'mentions', 'lifecycle']
const VISIBLE_CATEGORIES = DISPLAY_ORDER.filter((category) => isPreferenceWired('email', category))

// `p` = profile id, `c` = the category the token was minted for, `t` = the HMAC token. Same shape as the
// global unsubscribe link (buildManageEmailsUrl mirrors buildUnsubscribeUrl).
type SP = { p?: string; c?: string; t?: string }

export default async function ManageEmailsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const { p, c, t } = await searchParams

  // Fail-closed: any missing part, an unknown category, or a token that does not verify shows the SAME
  // neutral state. Never leaks whether the profile exists.
  const categoryOk = !!c && (NOTIFICATION_CATEGORIES as readonly string[]).includes(c)
  if (!p || !c || !t || !categoryOk || !verifyUnsubscribeToken(p, c as NotificationCategory, t)) {
    return (
      <Layout
        title="This link is invalid or expired."
        description="If you are signed in, you can manage every email from your settings. Otherwise, please reply to one of our emails and we'll help."
      >
        <SettingsLink />
      </Layout>
    )
  }

  const prefs = await getPreferences(p)
  const initial: EmailCategoryState[] = VISIBLE_CATEGORIES.map((category) => ({
    category,
    subscribed: prefs[`email_${category}` as keyof NotificationPreferences] === true,
  }))

  return (
    <Layout title="Manage your emails" description="Choose what Frequency sends you by email. Only you can see this.">
      <ManageEmailsForm profileId={p} tokenCategory={c} token={t} initial={initial} />
      <SettingsLink />
    </Layout>
  )
}

// ── Layout helpers (mirrors app/unsubscribe/page.tsx so the two token landings read as one surface) ──

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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6 py-12">
      <div className="max-w-md w-full bg-surface border border-border rounded-card lift-1 p-8">
        <Link href="/" className="inline-block text-lead font-black tracking-tight text-text mb-6">
          frequency
        </Link>
        <FocusTemplate title={title} description={description} width="narrow" divider={false}>
          <div className="space-y-3">{children}</div>
        </FocusTemplate>
      </div>
    </div>
  )
}

function SettingsLink() {
  return (
    <div className="pt-3">
      <Link
        href="/settings#notifications"
        className="inline-flex items-center gap-1.5 rounded-control bg-primary text-on-primary text-body-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors"
      >
        Manage all preferences →
      </Link>
    </div>
  )
}
