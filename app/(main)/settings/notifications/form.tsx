'use client'

import { useState, useTransition } from 'react'
import { Mail, Bell, Smartphone, Check, ShieldCheck } from 'lucide-react'
import type {
  NotificationSettings,
  NotificationCategory,
  NotificationFrequency,
} from '@/lib/notification-preferences'
import { NOTIFICATION_FREQUENCIES } from '@/lib/notification-preferences'
import { saveNotificationPreferences } from './actions'
import { isError } from '@/lib/action-result'

const CATEGORIES: { key: NotificationCategory; label: string; description: string }[] = [
  {
    key:         'dispatches',
    label:       'Broadcasts',
    description: 'Broadcast posts from your hosts and the wider community.',
  },
  {
    key:         'events',
    label:       'Events',
    description: 'RSVP changes and reminders before an event starts.',
  },
  {
    key:         'comments',
    label:       'Replies',
    description: 'Replies and mentions on posts and comments you wrote.',
  },
  {
    key:         'mentions',
    label:       'Mentions',
    description: 'When someone @mentions you anywhere else.',
  },
  {
    key:         'lifecycle',
    label:       'Onboarding nudges',
    description: 'Day 1 / Day 3 / Day 7 check-ins after you join a circle.',
  },
]

const CHANNELS = [
  { key: 'email', label: 'Email',  Icon: Mail,       disabled: false },
  { key: 'inapp', label: 'In-app', Icon: Bell,       disabled: false },
  { key: 'push',  label: 'Push',   Icon: Smartphone, disabled: false },
] as const

const FREQUENCY_LABELS: Record<NotificationFrequency, string> = {
  realtime:      'Realtime',
  daily_digest:  'Daily digest',
  weekly_digest: 'Weekly digest',
}

export function NotificationsForm({ initial }: { initial: NotificationSettings }) {
  const [settings, setSettings] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Persist a whole next-state, reverting on failure so the UI never shows a wrong value.
  function persist(next: NotificationSettings, prev: NotificationSettings) {
    setSettings(next)
    setSaveError(null)
    startTransition(async () => {
      const res = await saveNotificationPreferences(next)
      if (isError(res)) {
        setSettings(prev)
        setSaveError(res.error || 'Could not save. Try again.')
      } else {
        setSavedAt(Date.now())
      }
    })
  }

  function toggle(channel: string, category: NotificationCategory) {
    const key = `${channel}_${category}` as keyof NotificationSettings
    persist({ ...settings, [key]: !settings[key] }, settings)
  }

  function setFrequency(category: NotificationCategory, freq: NotificationFrequency) {
    const key = `freq_${category}` as keyof NotificationSettings
    persist({ ...settings, [key]: freq }, settings)
  }

  function toggleFollowerReminders() {
    persist({ ...settings, space_event_reminders: !settings.space_event_reminders }, settings)
  }

  return (
    <div className="space-y-3">
      {/* Guidance: topics vs frequency, in plain terms. */}
      <div className="rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-sm text-muted">
        <p className="text-text font-medium">Choose what you hear about, and how often.</p>
        <p className="mt-1">
          Each row is a topic. The switches pick the channels. Frequency sets the pace: realtime
          sends each one as it happens, a digest holds them and sends one roundup. Digests apply to
          email.
        </p>
      </div>

      {/* Channel header + rows */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 border-b border-border bg-surface-elevated">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Topic</span>
          {CHANNELS.map(({ key, label, Icon, disabled }) => (
            <div key={key} className="flex items-center gap-1.5 w-16 justify-center">
              <Icon className={`w-3.5 h-3.5 ${disabled ? 'text-subtle' : 'text-muted'}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${disabled ? 'text-subtle' : 'text-muted'}`}>
                {label}
              </span>
            </div>
          ))}
          <span className="text-xs font-semibold text-muted uppercase tracking-wide w-28 text-center">
            Frequency
          </span>
        </div>

        <div className="divide-y divide-border">
          {CATEGORIES.map(({ key, label, description }) => (
            <div key={key} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{label}</p>
                <p className="text-xs text-muted mt-0.5">{description}</p>
              </div>
              {CHANNELS.map(({ key: channel, disabled }) => {
                const prefKey = `${channel}_${key}` as keyof NotificationSettings
                const checked = settings[prefKey] === true
                return (
                  <div key={channel} className="w-16 flex justify-center">
                    <button
                      type="button"
                      onClick={() => !disabled && toggle(channel, key)}
                      disabled={disabled}
                      role="switch"
                      aria-checked={checked}
                      aria-label={`${channel} ${key}`}
                      title={disabled ? 'Not yet available' : undefined}
                      className={`
                        relative inline-flex items-center justify-center
                        w-10 h-6 rounded-full transition-colors
                        ${disabled
                          ? 'bg-surface-elevated cursor-not-allowed opacity-50'
                          : checked
                            ? 'bg-primary'
                            : 'bg-border hover:bg-border-strong'}
                      `}
                    >
                      <span
                        className={`
                          inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform
                          ${checked ? 'translate-x-2' : '-translate-x-2'}
                        `}
                      />
                    </button>
                  </div>
                )
              })}
              {/* Per-category frequency */}
              <div className="w-28 flex justify-center">
                <select
                  value={(settings[`freq_${key}` as keyof NotificationSettings] as NotificationFrequency) ?? 'realtime'}
                  onChange={(e) => setFrequency(key, e.target.value as NotificationFrequency)}
                  aria-label={`${key} frequency`}
                  className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {NOTIFICATION_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Events from Spaces you follow: a separate, opt-in email. Off by default. */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Events from Spaces you follow</p>
          <p className="text-xs text-muted mt-0.5">
            Remind me about upcoming events from Spaces I follow that I have not RSVP&apos;d to. Public
            events only, by email. Off unless you turn it on.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFollowerReminders}
          role="switch"
          aria-checked={settings.space_event_reminders === true}
          aria-label="Remind me about events from Spaces I follow"
          className={`
            relative inline-flex items-center justify-center shrink-0
            w-10 h-6 rounded-full transition-colors
            ${settings.space_event_reminders === true ? 'bg-primary' : 'bg-border hover:bg-border-strong'}
          `}
        >
          <span
            className={`
              inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform
              ${settings.space_event_reminders === true ? 'translate-x-2' : '-translate-x-2'}
            `}
          />
        </button>
      </div>

      {/* Transactional carve-out: always-on, stated plainly. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-muted">
        <ShieldCheck className="w-4 h-4 mt-0.5 text-success shrink-0" />
        <p>
          Account and security email always sends: sign-in codes, receipts, password resets, and
          legal notices. You can&apos;t switch those off here, and we never use them for marketing.
        </p>
      </div>

      {/* Footer status */}
      <div className="flex items-center gap-2 text-xs text-muted px-1">
        {isPending ? (
          <span>Saving…</span>
        ) : saveError ? (
          <span className="text-danger">{saveError}</span>
        ) : savedAt ? (
          <span className="flex items-center gap-1.5 text-success">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : (
          <span>Push notifications require granting your browser permission on first toggle.</span>
        )}
      </div>
    </div>
  )
}
