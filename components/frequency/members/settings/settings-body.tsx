import { Suspense } from 'react'
import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { SettingsPanes, type SettingsPane } from './settings-panes'
import { AppearanceSection } from '@/app/(main)/settings/appearance/section'
import { NotificationsSection } from '@/app/(main)/settings/notifications/section'
import { ConnectionsSection } from '@/app/(main)/settings/connections/section'
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
//   Account        the profile editor door, then blocked people, your data, delete account
//   Notifications  the four-channel grid
//   Privacy and location   who can find you, location precision, reach
//   Appearance     light or dark (and, under DAWN only, Midnight: the skin registry filters by design,
//                  ADR-1737, so this pane never offers it here)
//   Install the app
//   Membership     plan and billing, then the Spaces you belong to
//
// The reference's Feed pane is not built: there are no feed settings to save yet, and a switch that
// saves nothing would be a lie.

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
          <div className="row wrap">
            <span className="grow">
              <span className="t1 mc-block">Your profile</span>
              <span className="t2">Name, handle, photo, bio and your Spotlight page</span>
            </span>
            <Link className="btn sm" href="/settings/profile">
              Edit profile
            </Link>
          </div>
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
      label: 'Privacy and location',
      anchors: ['connections', 'location'],
      content: (
        <>
          <PaneHead
            title="Privacy and location"
            intro="Decide who can find you, how precisely your location is shown, and how far your reach extends. Changes save instantly."
          />
          <Suspense fallback={<Pending rows={4} />}>
            <ConnectionsSection />
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
            intro={`Pick ${SELECTABLE_SKINS.length > 1 ? 'the palette, and ' : ''}light or dark. Changes save instantly.`}
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
    </MembersBody>
  )
}
