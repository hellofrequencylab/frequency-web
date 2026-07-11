'use client'

import { useState, useTransition } from 'react'
import { MessageSquare, Check } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { sendSmsCode, verifySmsCode, saveSmsPreferences, type SmsPreferences } from './sms-actions'

// The SMS section of the notifications settings (ADR-256). Two stages:
//   1. Opt in — capture a phone, get a code, verify it (records express consent).
//   2. Tune   — once opted in, toggle the two SMS categories + set quiet hours.
// Mirrors the email/in-app grid's look. Honest copy: when texts are not turned on yet
// the opt-in returns a plain "not yet" message (the A2P legal track is the gate).

export interface SmsFormState {
  /** True when the member has a live opted_in row (verified + consented). */
  optedIn: boolean
  /** The opted-in number, masked for display (e.g. "+1 ••• ••• 0123"), or null. */
  maskedPhone: string | null
  preferences: SmsPreferences
}

const SMS_CATEGORIES: { key: 'sms_dispatches' | 'sms_events'; label: string; description: string }[] = [
  { key: 'sms_dispatches', label: 'Broadcasts', description: 'Text the group updates from your hosts.' },
  { key: 'sms_events', label: 'Events', description: 'RSVP confirmations and reminders before an event.' },
]

export function SmsForm({
  initial,
  smsProvisioned,
}: {
  initial: SmsFormState
  smsProvisioned: boolean
}) {
  const [optedIn, setOptedIn] = useState(initial.optedIn)
  const [maskedPhone, setMaskedPhone] = useState(initial.maskedPhone)
  const [prefs, setPrefs] = useState<SmsPreferences>(initial.preferences)

  // Opt-in flow state.
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSendCode() {
    setError(null)
    startTransition(async () => {
      const res = await sendSmsCode(phone)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setCodeSent(true)
      setSentTo(res.data.phone)
    })
  }

  function onVerify() {
    setError(null)
    startTransition(async () => {
      const res = await verifySmsCode(code)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setOptedIn(true)
      setMaskedPhone(sentTo ? maskNumber(sentTo) : null)
      setCodeSent(false)
      setCode('')
      setPrefs((p) => ({ ...p, sms_enabled: true }))
    })
  }

  function savePrefs(next: SmsPreferences) {
    setPrefs(next)
    startTransition(async () => {
      const res = await saveSmsPreferences(next)
      if (!isError(res)) setSavedAt(Date.now())
    })
  }

  function toggleCategory(key: 'sms_dispatches' | 'sms_events') {
    savePrefs({ ...prefs, [key]: !prefs[key] })
  }

  function setQuietHour(which: 'sms_quiet_start_hour' | 'sms_quiet_end_hour', value: number) {
    savePrefs({ ...prefs, [which]: value })
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-elevated">
        <MessageSquare className="w-4 h-4 text-muted" />
        <span className="text-sm font-semibold text-text">Text messages</span>
        {!smsProvisioned && (
          <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
            Coming soon
          </span>
        )}
      </div>

      {!smsProvisioned ? (
        // SMS is not turned on for this community yet (isSmsProvisioned() is false).
        // Show the channel so members know it is planned, but never a live opt-in or
        // toggle that would silently do nothing. The interactive form returns once the
        // owner completes provisioning.
        <div className="px-4 py-4">
          <p className="text-sm text-muted">
            Text messages are coming soon. When they turn on, you can opt in here to get
            event reminders and group updates by text.
          </p>
        </div>
      ) : (
      <div className="px-4 py-4 space-y-4">
        {!optedIn ? (
          <>
            <p className="text-sm text-muted">
              Get event reminders and group updates by text. Standard message and data rates may
              apply. Consent is not a condition of anything. You can reply STOP any time.
            </p>

            {!codeSent ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your mobile number"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={onSendCode}
                  disabled={isPending || !phone.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isPending ? 'Sending…' : 'Send code'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  We texted a code to {sentTo ? maskNumber(sentTo) : 'your number'}. Enter it below.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6-digit code"
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={onVerify}
                    disabled={isPending || !code.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isPending ? 'Verifying…' : 'Verify'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false)
                    setCode('')
                    setError(null)
                  }}
                  className="text-xs font-medium text-muted underline"
                >
                  Use a different number
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text">
                Texting <span className="font-semibold">{maskedPhone ?? 'your number'}</span>
              </p>
              <span className="flex items-center gap-1 text-xs font-medium text-success">
                <Check className="w-3 h-3" /> Verified
              </span>
            </div>

            {/* Category toggles */}
            <div className="divide-y divide-border rounded-xl border border-border">
              {SMS_CATEGORIES.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{label}</p>
                    <p className="text-xs text-muted mt-0.5">{description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCategory(key)}
                    aria-label={`Text ${label}`}
                    aria-pressed={prefs[key]}
                    className={`relative inline-flex h-6 w-10 items-center justify-center rounded-full transition-colors ${
                      prefs[key] ? 'bg-primary' : 'bg-border hover:bg-border-strong'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        prefs[key] ? 'translate-x-2' : '-translate-x-2'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Quiet hours */}
            <div className="rounded-xl border border-border px-3 py-3">
              <p className="text-sm font-medium text-text">Quiet hours</p>
              <p className="text-xs text-muted mt-0.5">
                We only text between these hours, your local time. The widest window is 8am to 9pm.
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm text-text">
                <HourSelect
                  value={prefs.sms_quiet_start_hour}
                  onChange={(v) => setQuietHour('sms_quiet_start_hour', v)}
                />
                <span className="text-muted">to</span>
                <HourSelect
                  value={prefs.sms_quiet_end_hour}
                  onChange={(v) => setQuietHour('sms_quiet_end_hour', v)}
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
        {!error && savedAt && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <Check className="w-3 h-3" /> Saved
          </p>
        )}
      </div>
      )}
    </div>
  )
}

function HourSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {formatHour(h)}
        </option>
      ))}
    </select>
  )
}

function formatHour(h: number): string {
  if (h === 0) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

function maskNumber(e164: string): string {
  // Show only the last 4 digits: "+1 ••• ••• 0123"
  const last4 = e164.replace(/\D/g, '').slice(-4)
  return `••• ••• ${last4}`
}
