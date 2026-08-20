'use client'

// Email Studio (2026) — Phase 4 SEND PANEL. A standalone client control for one campaign:
// pick an audience, preview its size, schedule a future send, and drive the send lifecycle
// (Send / Schedule / Pause / Cancel). Every button calls a gated server action
// (app/(main)/admin/email-studio/send-actions) that re-checks authorization and, for a beta
// campaign, the approval spine. Payments-style safety: a real send resolves the live audience
// count and asks for an explicit confirm first.
//
// Standalone by design: it takes a campaignId + current status/segment as props and imports
// NO Phase-2 workspace files. The coordinator slots it into the workspace. Voice canon: no
// em dashes in any copy.

import { useState, useTransition } from 'react'
import { Send, Clock, Users, Pause, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusChip, Banner, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import {
  audiencePreviewAction,
  scheduleCampaignAction,
  sendNowAction,
  pauseAction,
  cancelAction,
  voicePreflightAction,
} from '@/app/(main)/admin/email-studio/send-actions'

import { Input } from '@/components/ui/field'
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled'

export interface SegmentOption {
  key: string
  label: string
}

/** The built-in audiences, mirrored here so the panel is standalone (the server-only
 *  BUILTIN_SEGMENTS lives behind an admin DB client). Pass richer `segments` to override. */
const DEFAULT_SEGMENTS: SegmentOption[] = [
  { key: 'members', label: 'All members (not unsubscribed)' },
  { key: 'subscribed_members', label: 'Subscribed members only' },
  { key: 'all_contacts', label: 'Entire contact list (members + imported, not unsubscribed)' },
  { key: 'imported_contacts', label: 'Imported contact list only (no members or sign-ups)' },
  { key: 'beta_waitlist', label: 'Beta waitlist (confirmed, has account)' },
]

const STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'info',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
}

export interface SendPanelProps {
  campaignId: string
  /** The campaign's current lifecycle status (`campaigns.status`). */
  status: CampaignStatus
  /** The campaign's stored segment key (the panel's initial selection). */
  segment?: string
  /** Audience options for the picker. Defaults to the built-in audiences. */
  segments?: SegmentOption[]
  /** 'stack' (default): controls stacked in a narrow rail. 'row': audience / preview / schedule / actions
   *  laid out across a full-width bar (the Beta Campaign send box at the foot of the editor). */
  layout?: 'stack' | 'row'
}

export function SendPanel({ campaignId, status, segment, segments = DEFAULT_SEGMENTS, layout = 'stack' }: SendPanelProps) {
  const row = layout === 'row'
  const [current, setCurrent] = useState<CampaignStatus>(status)
  const [selected, setSelected] = useState(segment ?? segments[0]?.key ?? 'members')
  const [scheduleAt, setScheduleAt] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Voice preflight findings (voice-lint, LIVE-066): WARN-level, so they inform the operator and never
  // block. The one hard rule (an em or en dash) surfaces through `error` instead, because the send
  // itself refuses on it.
  const [voiceWarnings, setVoiceWarnings] = useState<string[]>([])
  const [pending, start] = useTransition()

  const isTerminal = current === 'sent' || current === 'cancelled'
  const canSchedule = current === 'draft' || current === 'scheduled' || current === 'paused'
  const canSend = current === 'draft' || current === 'scheduled'
  const canPause = current === 'scheduled' || current === 'sending'
  const canCancel = current === 'scheduled' || current === 'paused'

  function run<T>(fn: () => Promise<{ error: string } | { data: T }>, onOk?: (data: T) => void) {
    setError(null)
    setNote(null)
    start(async () => {
      const r = await fn()
      if (isError(r)) {
        setError(r.error)
        return
      }
      onOk?.(r.data)
    })
  }

  function preview() {
    run(
      () => audiencePreviewAction(campaignId, selected),
      (d) => setCount((d as { count: number }).count),
    )
  }

  /** The voice preflight: refresh the WARN banner and report whether the hard rule fired. */
  async function voicePreflight(): Promise<{ blocked: boolean; warnings: string[] }> {
    const lint = await voicePreflightAction(campaignId)
    if (isError(lint)) {
      setError(lint.error)
      return { blocked: true, warnings: [] }
    }
    setVoiceWarnings(lint.data.warnings)
    if (lint.data.hasEmDash) {
      setError('This email contains an em or en dash. We keep those out of everything we send, so swap each one for a period, comma, or parentheses, then try again.')
      return { blocked: true, warnings: lint.data.warnings }
    }
    return { blocked: false, warnings: lint.data.warnings }
  }

  function schedule() {
    if (!scheduleAt) {
      setError('Pick a date and time to schedule the send.')
      return
    }
    setError(null)
    setNote(null)
    start(async () => {
      // Voice floor first (voice-lint): the hard rule blocks here (the server refuses it anyway);
      // the soft findings land in the warning banner and scheduling proceeds.
      const voice = await voicePreflight()
      if (voice.blocked) return
      const r = await scheduleCampaignAction(campaignId, {
        segment: selected,
        scheduledAt: new Date(scheduleAt).toISOString(),
      })
      if (isError(r)) {
        setError(r.error)
        return
      }
      setCurrent('scheduled')
      setCount(r.data.count)
      setNote(`Scheduled for ${new Date(r.data.scheduledFor).toLocaleString()} to ${r.data.count.toLocaleString()} recipients.`)
    })
  }

  function sendNow() {
    // Payments-style safety: voice preflight, then the live audience, then confirm before the real send.
    setError(null)
    setNote(null)
    start(async () => {
      const voice = await voicePreflight()
      if (voice.blocked) return
      const aud = await audiencePreviewAction(campaignId, selected)
      if (isError(aud)) {
        setError(aud.error)
        return
      }
      const size = aud.data.count
      setCount(size)
      if (size === 0) {
        setError('This audience is empty. Pick a segment with recipients before sending.')
        return
      }
      // Two-step confirm: the count first, then an explicit final go. A mass send cannot be undone,
      // so it takes two deliberate confirms. Voice findings ride the first confirm so the operator
      // decides with them in view (a warning informs; it never blocks).
      const voiceNote = voice.warnings.length
        ? `\n\nVoice check:\n${voice.warnings.map((w) => `- ${w}`).join('\n')}\n\nYou can still send.`
        : ''
      const okToSend = window.confirm(
        `Send this campaign now to ${size.toLocaleString()} recipients? This cannot be undone.${voiceNote}`,
      )
      if (!okToSend) return
      const reallySend = window.confirm(
        `Really send to ${size.toLocaleString()} recipients right now? There is no undo once it goes out.`,
      )
      if (!reallySend) return
      const r = await sendNowAction(campaignId)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setCurrent('sent')
      setNote(`Sent to ${r.data.recipientCount.toLocaleString()} recipients.`)
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 lift-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-body-sm font-bold text-text">Send</h3>
        <StatusChip tone={STATUS_TONE[current]} size="sm">
          {current}
        </StatusChip>
      </div>

      {isTerminal ? (
        <Banner tone={current === 'sent' ? 'info' : 'warning'} title={current === 'sent' ? 'This campaign has been sent.' : 'This campaign was cancelled.'} />
      ) : (
        <div className={row ? 'flex flex-wrap items-end gap-x-6 gap-y-4' : 'space-y-4'}>
          <label className={row ? 'block min-w-[220px] flex-1 space-y-1' : 'block space-y-1'}>
            <span className="text-meta font-medium text-subtle">Audience</span>
            <Select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                setCount(null)
              }}
              disabled={pending}
            >
              {segments.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={preview}>
              <Users className="h-3.5 w-3.5" /> Preview size
              {count != null && `: ${count.toLocaleString()}`}
            </Button>
            {count != null && (
              <span className="text-meta text-muted">
                {count.toLocaleString()} in this audience before the consent and suppression gate.
              </span>
            )}
          </div>

          <div className={row ? 'space-y-1' : 'space-y-1 border-t border-border pt-3'}>
            <span className="text-meta font-medium text-subtle">Schedule (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="!w-auto !px-2 !py-1 text-meta"
                aria-label="Send date and time"
                disabled={pending || !canSchedule}
              />
              <Button size="sm" variant="secondary" disabled={pending || !canSchedule} onClick={schedule}>
                <Clock className="h-3.5 w-3.5" /> Schedule
              </Button>
            </div>
          </div>

          <div className={row ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2 border-t border-border pt-3'}>
            <Button size="sm" disabled={pending || !canSend} onClick={sendNow}>
              <Send className="h-3.5 w-3.5" /> Send now
            </Button>
            {canPause && (
              <Button
                size="sm"
                variant="warningOutline"
                disabled={pending}
                onClick={() => run(() => pauseAction(campaignId), (d) => setCurrent((d as { status: CampaignStatus }).status))}
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="dangerOutline"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm('Cancel this campaign? This cannot be undone.')) return
                  run(() => cancelAction(campaignId), (d) => setCurrent((d as { status: CampaignStatus }).status))
                }}
              >
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
      {voiceWarnings.length > 0 && (
        <Banner tone="warning" title="Voice check">
          <ul className="space-y-1">
            {voiceWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-1">These are suggestions from the house style guide. You can still send.</p>
        </Banner>
      )}
      {note && <Banner tone="info" title={note} />}
    </div>
  )
}
