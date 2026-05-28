'use client'

import { useState, useTransition } from 'react'
import { Mail, Bell, Smartphone, Check } from 'lucide-react'
import type { NotificationPreferences, NotificationCategory } from '@/lib/notification-preferences'
import { saveNotificationPreferences } from './actions'

const CATEGORIES: { key: NotificationCategory; label: string; description: string }[] = [
  {
    key:         'dispatches',
    label:       'Dispatches',
    description: 'Broadcast posts from your hosts and the wider community.',
  },
  {
    key:         'events',
    label:       'Events',
    description: 'RSVP changes and reminders before an event starts.',
  },
  {
    key:         'mentions',
    label:       'Mentions',
    description: 'When someone @mentions you in a post or comment.',
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
  { key: 'push',  label: 'Push',   Icon: Smartphone, disabled: true  },
] as const

export function NotificationsForm({ initial }: { initial: NotificationPreferences }) {
  const [prefs, setPrefs] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function toggle(channel: string, category: NotificationCategory) {
    const key = `${channel}_${category}` as keyof NotificationPreferences
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    startTransition(async () => {
      const res = await saveNotificationPreferences(next)
      if (res.ok) setSavedAt(Date.now())
    })
  }

  return (
    <div className="space-y-3">
      {/* Channel header */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</span>
          {CHANNELS.map(({ key, label, Icon, disabled }) => (
            <div key={key} className="flex items-center gap-1.5 w-16 justify-center">
              <Icon className={`w-3.5 h-3.5 ${disabled ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 dark:text-gray-400'}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${disabled ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100/80 dark:divide-gray-800/50">
          {CATEGORIES.map(({ key, label, description }) => (
            <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
              </div>
              {CHANNELS.map(({ key: channel, disabled }) => {
                const prefKey = `${channel}_${key}` as keyof NotificationPreferences
                const checked = prefs[prefKey]
                return (
                  <div key={channel} className="w-16 flex justify-center">
                    <button
                      type="button"
                      onClick={() => !disabled && toggle(channel, key)}
                      disabled={disabled}
                      aria-label={`${channel} ${key}`}
                      title={disabled ? 'Coming soon (P1.4 — PWA web push)' : undefined}
                      className={`
                        relative inline-flex items-center justify-center
                        w-10 h-6 rounded-full transition-colors
                        ${disabled
                          ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50'
                          : checked
                            ? 'bg-indigo-500 dark:bg-indigo-600'
                            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}
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
            </div>
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
        {isPending ? (
          <span>Saving…</span>
        ) : savedAt ? (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : (
          <span>Push notifications are coming with our mobile experience.</span>
        )}
      </div>
    </div>
  )
}
