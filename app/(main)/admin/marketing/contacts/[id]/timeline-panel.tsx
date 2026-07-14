'use client'

// The admin contact card's interaction timeline (ADR-372 Phase 1). One client island that owns three
// Phase 1 additions on the staff/operator console:
//   • the "Show automated events" toggle — filters the timeline by source (never deletes). Default ON
//     here (the staff console shows the full machine-captured history); the member-facing personal card
//     defaults it OFF. Persisted per-viewer in localStorage so the choice sticks between visits.
//   • the "Log a touch" composer — hand-log a call / meeting / note straight onto the timeline.
//   • guidance — a one-line "what this is" + an EmptyState prompt, per the admin-surface directive.
// It receives the FULL timeline (built server-side with automated events included) and re-filters on the
// client with the shared pure filterTimeline, so the toggle is instant and the log is a server action.

import { useMemo, useState, useTransition } from 'react'
import {
  Activity,
  CalendarDays,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  StickyNote,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { filterTimeline, type TimelineEntry } from '@/lib/crm/timeline'
import type { InteractionChannel } from '@/lib/crm/interactions'
import { logManualTouch, type ManualTouchKind } from './timeline-actions'

const CHANNEL_ICON: Record<InteractionChannel, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  in_person: Users,
  event: CalendarDays,
  note: StickyNote,
  system: Activity,
  in_app: MessageSquare,
}

function fmtDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
      {children}
    </span>
  )
}

const STORAGE_KEY = 'crm.timeline.showAutomated'

export function TimelinePanel({
  contactId,
  entries,
}: {
  contactId: string
  /** The full timeline (automated events included), built server-side. */
  entries: TimelineEntry[]
}) {
  // Default ON for the staff console; persisted (localStorage) so the operator's choice sticks between
  // visits. Read once via a lazy initializer (guarded for SSR) so there is no setState-in-effect.
  const [showAutomated, setShowAutomated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      return saved == null ? true : saved === '1'
    } catch {
      return true
    }
  })
  function toggle() {
    setShowAutomated((v) => {
      const next = !v
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore a blocked storage write
      }
      return next
    })
  }

  const visible = useMemo(() => filterTimeline(entries, showAutomated), [entries, showAutomated])
  const hiddenCount = entries.length - visible.length

  return (
    <section className="mt-8">
      <SectionHeader
        title="Timeline"
        count={visible.length}
        action={
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={showAutomated}
              onChange={toggle}
              className="h-3.5 w-3.5 rounded border-border-strong text-primary focus:ring-primary/40"
            />
            Show automated events
          </label>
        }
      />
      <p className="mb-3 text-xs text-subtle">
        Every touch with this person, newest first. Turn off automated events to focus on real calls,
        meetings, messages, and notes. This only hides them from view, it never deletes anything.
      </p>

      <LogTouch contactId={contactId} />

      {visible.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={entries.length === 0 ? 'No interactions yet' : 'Only automated events so far'}
          description={
            entries.length === 0
              ? 'Log a call, meeting, or note above. Emails, messages, and captures also land here as they happen.'
              : 'Turn on "Show automated events" to see the emails, opens, and system updates on file.'
          }
        />
      ) : (
        <ol className="relative mt-3 space-y-3 border-l border-border pl-5">
          {visible.map((e) => {
            const Icon = CHANNEL_ICON[e.channel] ?? Activity
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-primary-strong">
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-text">{e.title}</span>
                  <Chip>{e.channel.replace('_', ' ')}</Chip>
                  <span className="text-xs text-subtle">{fmtDate(e.at)}</span>
                </div>
                {e.detail && <p className="mt-0.5 text-sm text-muted">{e.detail}</p>}
              </li>
            )
          })}
        </ol>
      )}

      {!showAutomated && hiddenCount > 0 && (
        <p className="mt-3 text-xs text-subtle">
          {hiddenCount} automated {hiddenCount === 1 ? 'event is' : 'events are'} hidden. Turn on
          &ldquo;Show automated events&rdquo; to see them.
        </p>
      )}
    </section>
  )
}

const KINDS: { value: ManualTouchKind; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
]

/** Hand-log a call / meeting / note onto the timeline. Writes natively (source 'manual'). */
function LogTouch({ contactId }: { contactId: string }) {
  const [kind, setKind] = useState<ManualTouchKind>('call')
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function submit() {
    setMsg(null)
    start(async () => {
      const res = await logManualTouch(contactId, kind, note.trim() || undefined)
      if (res.ok) {
        setNote('')
        setMsg({ ok: true, text: 'Logged.' })
      } else {
        setMsg({ ok: false, text: 'Could not log that touch.' })
      }
    })
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
      <p className="text-sm font-semibold text-text">Log a touch</p>
      <p className="mt-0.5 text-xs text-subtle">
        Record a call, meeting, or note you had with this person so the history stays complete.
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ManualTouchKind)}
          className="rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-text focus:outline-none"
          aria-label="Touch type"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'note' ? 'What happened…' : 'What happened… (optional)'}
          className="min-w-[12rem] flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || (kind === 'note' && !note.trim())}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Log
        </button>
        {msg && <span className={`self-center text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
