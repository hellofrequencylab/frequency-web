'use client'

// "Install the app" (LIVE-703, ADR-1630). Two shapes over one state read:
//
//   · InstallSettingsCard  always in Settings, the permanent way in. A line for every state, the
//                          button only where the browser handed over its install prompt.
//   · InstallBody          the install half of DeviceNudge, the one-time card after an RSVP or post.
//
// What neither ever does: fire the prompt without a tap (the button's click is the gesture), or
// offer a button on iPhone or iPad, where Safari has no prompt to fire. There the card lists the
// Share, Add to Home Screen steps instead.

import { useState, useSyncExternalStore } from 'react'
import { Check, Share, SquarePlus, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  promptInstallFromTap,
  readInstallAvailability,
  subscribeInstall,
  type InstallAvailability,
} from './install'

export const INSTALL_COPY = {
  button: 'Install the app',
  prompt:
    'Open Frequency from your home screen like any other app. No app store, nothing to update.',
  iosLead: 'On iPhone and iPad, add Frequency to your Home Screen:',
  iosSteps: [
    'Tap Share, the square with an arrow.',
    'Choose Add to Home Screen.',
    'Open Frequency from your Home Screen.',
  ],
  iosPush: 'That is also where notifications work on iPhone.',
  installed: 'You are using the installed app on this device.',
  accepted: 'Installed. Open Frequency from your home screen.',
  dismissed: 'No problem. Install the app stays in Settings whenever you want it.',
  none: 'This browser has no install button for Frequency right now. If you installed it already, open it from your home screen. If not, look for Install app or Add to Home screen in the browser menu.',
} as const

export type InstallResult = 'idle' | 'working' | 'accepted' | 'dismissed'

// Server snapshot is null (render nothing), so the server render and hydration agree and the
// browser is read only in the browser. Re-read whenever the head script captures or clears the
// prompt, and on every render, so the state after the tap is what renders.
export function useInstallControl() {
  const availability = useSyncExternalStore(subscribeInstall, readInstallAvailability, () => null)
  const [result, setResult] = useState<InstallResult>('idle')

  // Straight from the click: promptInstallFromTap calls prompt() before its first await.
  function install() {
    setResult('working')
    void promptInstallFromTap().then((outcome) => {
      setResult(outcome === 'accepted' ? 'accepted' : outcome === 'dismissed' ? 'dismissed' : 'idle')
    })
  }

  return { availability, result, install }
}

export function IosInstallSteps({ withPush = false }: { withPush?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-muted">{INSTALL_COPY.iosLead}</p>
      <ol className="space-y-1.5 text-body-sm text-text">
        {INSTALL_COPY.iosSteps.map((step, i) => (
          <li key={step} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-2xs font-bold text-primary-strong">
              {i + 1}
            </span>
            <span className="flex items-center gap-1.5">
              {step}
              {i === 0 && <Share className="h-4 w-4 text-muted" aria-hidden />}
              {i === 1 && <SquarePlus className="h-4 w-4 text-muted" aria-hidden />}
            </span>
          </li>
        ))}
      </ol>
      {withPush && <p className="text-meta text-muted">{INSTALL_COPY.iosPush}</p>}
    </div>
  )
}

export function InstallBody({
  availability,
  result,
  install,
  withPush = false,
}: {
  availability: InstallAvailability
  result: InstallResult
  install: () => void
  /** On iPhone, say that the Home Screen is also where notifications work. */
  withPush?: boolean
}) {
  if (result === 'accepted') {
    return (
      <p className="flex items-center gap-1.5 text-body-sm text-success">
        <Check className="h-4 w-4" /> {INSTALL_COPY.accepted}
      </p>
    )
  }
  if (result === 'dismissed') return <p className="text-body-sm text-muted">{INSTALL_COPY.dismissed}</p>
  if (availability === 'installed') {
    return (
      <p className="flex items-center gap-1.5 text-body-sm text-success">
        <Check className="h-4 w-4" /> {INSTALL_COPY.installed}
      </p>
    )
  }
  if (availability === 'ios-steps') return <IosInstallSteps withPush={withPush} />
  if (availability === 'none' && result !== 'working') {
    return <p className="text-body-sm text-muted">{INSTALL_COPY.none}</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-muted">{INSTALL_COPY.prompt}</p>
      <Button type="button" size="sm" onClick={install} loading={result === 'working'}>
        <Smartphone className="h-4 w-4" />
        {INSTALL_COPY.button}
      </Button>
    </div>
  )
}

export function InstallSettingsCard() {
  const { availability, result, install } = useInstallControl()
  return (
    <section
      aria-label="Install the app on this device"
      className="overflow-hidden rounded-card border border-border bg-surface lift-1"
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3">
        <Smartphone className="h-4 w-4 text-muted" />
        <span className="text-body-sm font-semibold text-text">Install the app on this device</span>
      </div>
      <div className="px-4 py-4">
        {availability && (
          <InstallBody availability={availability} result={result} install={install} withPush />
        )}
      </div>
    </section>
  )
}
