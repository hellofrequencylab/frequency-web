'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Mail, MessageSquare, Radio, Smartphone, Megaphone, CheckCircle2, AlertCircle, CalendarPlus } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/field'
import type { ActionResult } from '@/lib/action-result'
import type {
  BroadcastChannelKey,
  BroadcastChannelOption,
  BroadcastChannelResult,
  BroadcastSegment,
  BroadcastSendInput,
} from './broadcast-types'

// THE MULTI-CHANNEL BROADCAST COMPOSER (ADR-827 ruling 3 / CRM Everywhere plan 5.5). One
// compose box, four channel chips (Email / Direct Message / Dispatch / Text), a segment
// row for WHO, a live recipient count, one send, per-channel results inline. The chip
// row copies the proven Event Dispatch pattern (components/events/event-dispatch-compose);
// every unavailable channel is a disabled chip with a reason, never a silent no-op.
//
// SCOPE-AGNOSTIC BY CONSTRUCTION: the mounting surface supplies the segments, the channel
// availability, and ONE bound server action (e.g. sendEventBroadcast.bind(null, slug)).
// The action owns authorization, audience re-resolution, consent gates, and logging; this
// component only collects intent and reports outcomes. Kit fields + semantic tokens only;
// copy is plain, no em dashes (docs/CONTENT-VOICE.md).

const MAX_SUBJECT = 200
const MAX_BODY = 5000

const CHANNEL_META: Record<BroadcastChannelKey, { label: string; Icon: typeof Mail }> = {
  email: { label: 'Email', Icon: Mail },
  dm: { label: 'Direct Message', Icon: MessageSquare },
  dispatch: { label: 'Dispatch', Icon: Radio },
  sms: { label: 'Text', Icon: Smartphone },
}

/** The locked state (ADR-836): the mounting surface resolved the viewer's access tier and
 *  free-form messaging is off, so the compose fields and channel row are replaced by ONE
 *  action (invite the list to an upcoming event the viewer hosts) plus one quiet upsell
 *  line. Presentation only: the server action re-checks the tier and the target. */
export interface BroadcastLockedState {
  /** The plain explanation line (e.g. the post-event lock message). */
  message: string
  /** The one quiet upsell sentence, rendered as a link. No dark patterns. */
  upsell: { text: string; href: string }
  reinvite: {
    /** Upcoming events the viewer hosts/cohosts, soonest first (server-resolved). */
    targets: { id: string; title: string; startsAt: string | null }[]
    /** The scope-bound re-invite action (validation + fan-out live server-side). */
    send: (targetEventId: string) => Promise<ActionResult<{ results: BroadcastChannelResult[] }>>
    /** Copy when the viewer has no upcoming event to invite the list to. */
    emptyNote: string
  }
}

/** Wall-clock date chip for a re-invite option (event times store wall-clock as UTC parts). */
function targetDateLabel(startsAt: string | null): string {
  if (!startsAt) return ''
  const t = Date.parse(startsAt)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function chipClasses(on: boolean): string {
  return `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-50 ${
    on
      ? 'bg-primary-bg text-primary-strong'
      : 'border border-border text-muted hover:border-border-strong hover:text-text'
  }`
}

export function BroadcastComposer({
  heading = 'Message everyone',
  segments,
  channels,
  send,
  bodyPlaceholder = 'What do you want everyone to know?',
  locked,
}: {
  /** The card's small heading line. */
  heading?: string
  /** Audience segments, in display order; the first is selected by default. */
  segments: BroadcastSegment[]
  /** Channel availability for this surface, in display order. */
  channels: BroadcastChannelOption[]
  /** The scope-bound server action (authorization + fan-out live server-side). */
  send: (input: BroadcastSendInput) => Promise<ActionResult<{ results: BroadcastChannelResult[] }>>
  bodyPlaceholder?: string
  /** When set, free-form messaging is off for this viewer: the compose fields and channel
   *  row are replaced by the one re-invite action + the quiet upsell line (ADR-836). */
  locked?: BroadcastLockedState
}) {
  const firstEnabled = channels.find((c) => c.enabled)?.key
  const [picked, setPicked] = useState<Set<BroadcastChannelKey>>(
    () => new Set(firstEnabled ? [firstEnabled] : []),
  )
  const [pickedSegments, setPickedSegments] = useState<Set<string>>(
    () => new Set(segments.length > 0 ? [segments[0].key] : []),
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<BroadcastChannelResult[]>([])
  const [pending, startTransition] = useTransition()
  const [reinviteTarget, setReinviteTarget] = useState<string>(
    () => locked?.reinvite.targets[0]?.id ?? '',
  )

  // The whole list, deduped across segments: the locked state still SHOWS the audience
  // (tracked and visible), it just cannot free-form message it.
  const listCount = useMemo(() => {
    const ids = new Set<string>()
    for (const s of segments) for (const id of s.profileIds) ids.add(id)
    return ids.size
  }, [segments])

  // The live recipient count: the UNION of the selected segments, deduped by member id
  // (a ticket holder who also RSVP'd counts once). Display only; the server re-resolves.
  const { count, summaryLabel } = useMemo(() => {
    const ids = new Set<string>()
    const labels: string[] = []
    for (const s of segments) {
      if (!pickedSegments.has(s.key)) continue
      labels.push(s.label)
      for (const id of s.profileIds) ids.add(id)
    }
    return { count: ids.size, summaryLabel: labels.join(' + ') }
  }, [segments, pickedSegments])

  const emailOn = picked.has('email')
  const canSubmit =
    !pending &&
    picked.size > 0 &&
    count > 0 &&
    !!body.trim() &&
    (!emailOn || !!subject.trim())

  function toggleChannel(key: BroadcastChannelKey) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSegment(key: string) {
    setPickedSegments((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      setError('')
      setResults([])
      const res = await send({
        channels: [...picked],
        segments: [...pickedSegments],
        subject: subject.trim(),
        body: body.trim(),
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setResults(res.data.results)
      // Keep the draft when any channel came back short, so nothing is lost.
      if (res.data.results.every((r) => r.ok)) {
        setSubject('')
        setBody('')
      }
    })
  }

  function submitReinvite() {
    if (!locked || !reinviteTarget || pending) return
    const sendReinvite = locked.reinvite.send
    startTransition(async () => {
      setError('')
      setResults([])
      const res = await sendReinvite(reinviteTarget)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setResults(res.data.results)
    })
  }

  const activeNotes = channels.filter((c) => c.enabled && c.note && picked.has(c.key))

  // ── The locked state (ADR-836): one action instead of the channel row ──────────────────
  if (locked) {
    const targets = locked.reinvite.targets
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-1 flex items-center gap-1.5 text-meta font-semibold text-muted">
          <Megaphone className="h-3.5 w-3.5 text-primary" aria-hidden />
          {heading}
        </p>
        <p className="text-2xs text-muted">
          {listCount > 0 ? `${listCount} ${listCount === 1 ? 'person' : 'people'} on this list.` : 'No one is on this list yet.'}
        </p>
        <p className="mt-2 text-meta text-muted">{locked.message}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {targets.length > 0 ? (
            <>
              <label htmlFor="reinvite-target" className="sr-only">
                Invite this list to
              </label>
              <select
                id="reinvite-target"
                value={reinviteTarget}
                onChange={(e) => setReinviteTarget(e.target.value)}
                disabled={pending}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-meta text-text"
              >
                {targets.map((t) => {
                  const when = targetDateLabel(t.startsAt)
                  return (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {when ? ` · ${when}` : ''}
                    </option>
                  )
                })}
              </select>
              <button
                type="button"
                onClick={submitReinvite}
                disabled={pending || !reinviteTarget || listCount === 0}
                className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                  {pending ? 'Inviting…' : 'Invite to your next event'}
                </span>
              </button>
            </>
          ) : (
            <p className="text-2xs text-muted">{locked.reinvite.emptyNote}</p>
          )}
        </div>

        {/* The one quiet upsell line (voice canon: one plain sentence, one link). */}
        <p className="mt-2 text-2xs text-muted">
          <Link href={locked.upsell.href} className="font-medium text-primary hover:underline">
            {locked.upsell.text}
          </Link>
        </p>

        {error && <p className="mt-2 text-2xs font-medium text-danger">{error}</p>}
        {results.length > 0 && (
          <ul className="mt-3 space-y-1">
            {results.map((r) => (
              <li key={r.channel} className="flex items-start gap-1.5 text-2xs">
                {r.ok ? (
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
                )}
                <span className={r.ok ? 'text-muted' : 'font-medium text-danger'}>
                  <span className="font-semibold text-text">Invitation.</span> {r.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-1.5 text-meta font-semibold text-muted">
        <Megaphone className="h-3.5 w-3.5 text-primary" aria-hidden />
        {heading}
      </p>

      {/* WHO: segment chips (multi-select; the summary line unions + dedupes). */}
      {segments.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {segments.map((s) => {
            const on = pickedSegments.has(s.key)
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSegment(s.key)}
                disabled={pending}
                aria-pressed={on}
                className={chipClasses(on)}
              >
                {s.label}
                <span className={on ? 'font-semibold' : 'text-subtle'}>{s.profileIds.length}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* The recipient summary line. */}
      <p className="mb-3 text-2xs text-muted" aria-live="polite">
        {count > 0 && summaryLabel
          ? `${summaryLabel}: ${count} ${count === 1 ? 'person' : 'people'}`
          : 'No one is in this audience yet.'}
      </p>

      {emailOn && (
        <Input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, MAX_SUBJECT))}
          placeholder="Subject"
          aria-label="Email subject"
          disabled={pending}
          className="mb-2"
        />
      )}

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
        }}
        placeholder={bodyPlaceholder}
        rows={4}
        disabled={pending}
        className="resize-none"
        aria-label="Message"
      />

      {/* HOW: the channel chip row. Disabled channels stay visible with their reason. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {channels.map((c) => {
          const { label, Icon } = CHANNEL_META[c.key]
          if (!c.enabled) {
            return (
              <span
                key={c.key}
                aria-disabled="true"
                title={c.note || `${label} is unavailable here.`}
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-2xs font-medium text-muted"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
                <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-muted">
                  {c.note || 'Unavailable'}
                </span>
              </span>
            )
          }
          const on = picked.has(c.key)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleChannel(c.key)}
              disabled={pending}
              aria-pressed={on}
              title={c.note}
              className={chipClasses(on)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="ml-auto shrink-0 rounded-lg bg-primary px-4 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {/* Per-channel expectation lines while composing (only for selected channels). */}
      {activeNotes.map((c) => (
        <p key={c.key} className="mt-2 text-2xs text-muted">
          {CHANNEL_META[c.key].label}: {c.note}
        </p>
      ))}

      {error && <p className="mt-2 text-2xs font-medium text-danger">{error}</p>}

      {/* Per-channel results after a send. */}
      {results.length > 0 && (
        <ul className="mt-3 space-y-1">
          {results.map((r) => (
            <li key={r.channel} className="flex items-start gap-1.5 text-2xs">
              {r.ok ? (
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
              )}
              <span className={r.ok ? 'text-muted' : 'font-medium text-danger'}>
                <span className="font-semibold text-text">{CHANNEL_META[r.channel].label}.</span>{' '}
                {r.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
