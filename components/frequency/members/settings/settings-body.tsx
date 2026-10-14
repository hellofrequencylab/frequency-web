import { Suspense } from 'react'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import { SettingsPanes, type SettingsPane } from './settings-panes'
import { AppearanceSection } from '@/app/(main)/settings/appearance/section'
import { NotificationsSection } from '@/app/(main)/settings/notifications/section'
import { AccountPaneForm, PrivacyPane, LocationPane, FeedPane } from './connection-panes'
import { AccountSection } from '@/app/(main)/settings/account/section'
import { PlanSection } from '@/app/(main)/settings/billing/section'
import { MyMembershipsSection } from '@/app/(main)/settings/memberships/section'
import { InstallSettingsCard } from '@/components/push/install-card'
import { SELECTABLE_SKINS } from '@/lib/theme/skins'

// SETTINGS under Frequency (design_handoff/frequency/templates/members/Settings.html): "You /
// Settings", a side list and one pane at a time. The panes are the SAME section components the DAWN
// suite stacks (each with its own forms, server actions and Suspense), so nothing a member can change
// is lost, only regrouped under the reference's names:
//
//   Account        photo, name, email and About you saved in place (the profile editor's own action),
//                  then blocked people, your data, delete account
//   Notifications  the four-channel grid
//   Privacy        Show me on leaderboards, who can find you, location precision, Resonance matching
//   Location       home base, live location
//   Feed           how far the feed reaches, Show why I see things (profiles.meta.feedWhyHidden, read
//                  by the Feed's posts and planner, lib/feed/why-pref.ts), and what the feed always does
//   Membership     plan and billing, then the Spaces you belong to
//   Appearance     the theme (Frequency or Midnight, lib/theme/skins.ts) and light or dark
//   Install the app

function Pending({ rows }: { rows: number }) {
  return (
    <div className="list" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <span className="ic" />
          <span className="grow stack mc-gap-6">
            <span className="mc-bar" />
            <span className="mc-bar short" />
          </span>
        </div>
      ))}
    </div>
  )
}

function PaneHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="stack mc-gap-6">
      <span className="h2">{title}</span>
      {intro && <span className="t2">{intro}</span>}
    </div>
  )
}

export function SettingsBody({ sessionId, payouts }: { sessionId?: string; payouts?: string }) {
  const panes: SettingsPane[] = [
    {
      key: 'account',
      label: 'Account',
      anchors: ['profile'],
      content: (
        <>
          <PaneHead title="Account" />
          <Suspense fallback={<Pending rows={3} />}>
            <AccountPaneForm />
          </Suspense>
          <PaneHead title="Privacy and your data" intro="Manage who you have blocked, download your data, and delete your account." />
          <Suspense fallback={<Pending rows={3} />}>
            <AccountSection />
          </Suspense>
        </>
      ),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      anchors: [],
      content: (
        <>
          <PaneHead title="Notifications" intro="Choose how and when Frequency contacts you. Changes save instantly." />
          <Suspense fallback={<Pending rows={6} />}>
            <NotificationsSection />
          </Suspense>
        </>
      ),
    },
    {
      key: 'privacy',
      label: 'Privacy',
      anchors: ['connections'],
      content: (
        <>
          <PaneHead title="Privacy" intro="Decide who can find you, how precisely your location is shown, and whether you appear on boards. Changes save instantly." />
          <Suspense fallback={<Pending rows={4} />}>
            <PrivacyPane />
          </Suspense>
        </>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      anchors: [],
      content: (
        <>
          <PaneHead title="Location" intro="Where you are based, and whether nearby shows where you are right now." />
          <Suspense fallback={<Pending rows={2} />}>
            <LocationPane />
          </Suspense>
        </>
      ),
    },
    {
      key: 'feed',
      label: 'Feed',
      anchors: [],
      content: (
        <>
          <PaneHead title="Feed" intro="How far your feed reaches, and what it tells you. Changes save instantly." />
          <Suspense fallback={<Pending rows={2} />}>
            <FeedPane />
          </Suspense>
        </>
      ),
    },
    {
      key: 'membership',
      label: 'Membership',
      anchors: ['plan', 'billing', 'memberships'],
      content: (
        <>
          <PaneHead title="Membership" intro="Your plan and payment." />
          <Suspense fallback={<Pending rows={2} />}>
            <PlanSection sessionId={sessionId} payouts={payouts} />
          </Suspense>
          <PaneHead title="Spaces you belong to" intro="Open one, or leave it from here." />
          <Suspense fallback={<Pending rows={2} />}>
            <MyMembershipsSection />
          </Suspense>
        </>
      ),
    },
    {
      key: 'appearance',
      label: 'Appearance',
      anchors: [],
      content: (
        <>
          <PaneHead
            title="Appearance"
            intro={`Pick ${SELECTABLE_SKINS.length > 1 ? `your theme (${SELECTABLE_SKINS.map((s) => s.label).join(' or ')}), and ` : ''}light or dark. Changes save instantly.`}
          />
          <Suspense fallback={<Pending rows={2} />}>
            <AppearanceSection />
          </Suspense>
        </>
      ),
    },
    {
      key: 'install',
      label: 'Install the app',
      anchors: [],
      content: (
        <>
          <PaneHead title="Install the app" intro="Put Frequency on your home screen and open it like any other app." />
          <InstallSettingsCard />
        </>
      ),
    },
  ]

  // A Stripe or Connect return lands on the pane that reads it.
  const initial = sessionId || payouts ? 'membership' : 'account'

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">You</span>
          <h1 className="h1">Settings</h1>
        </div>
      </div>
      <SettingsPanes panes={panes} initial={initial} />
      <Suspense fallback={null}>
        <HubLinks title="Settings" links={(v) => hubLinks('/settings', v)} />
      </Suspense>
    </MembersBody>
  )
}
