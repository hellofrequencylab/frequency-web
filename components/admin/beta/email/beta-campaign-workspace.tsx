'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { CalendarDays, CheckCircle2, Eye, Loader2, Mail, MousePointerClick, Plus, Send } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmailEditorPane } from '@/components/admin/email-studio/editor-pane'
import { SendPanel, type CampaignStatus, type SegmentOption } from '@/components/admin/email-studio/send-panel'
import {
  createBetaEmailDraft,
  listBetaSequenceEmails,
  loadEmailCampaign,
  setCampaignSendDateAction,
  type BetaSequenceEmail,
  type LoadedEmailCampaign,
} from '@/app/(main)/admin/email-studio/actions'
import { isError } from '@/lib/action-result'

// BETA CAMPAIGN WORKSPACE — the Campaign tab, purpose-built for the beta broadcast sequence and nothing else.
//
//   • LEFT column  — the sequence: the beta launch emails as compact cards, numbered 1..N in send order, each
//     showing its number, subject, and an inline, editable TARGET SEND DATE. A "+ New email" button sits at
//     the bottom. Clicking a card selects it AND smooth-scrolls the page down to the editor (an on-page
//     anchor, no reload); the active card is visually selected.
//   • RIGHT column — the campaign stats: Delivered / Opens / Clicks / Delivery rate for the beta program, plus
//     sequence progress (how many of the N are approved / sent).
//   • BELOW        — the editor: a full-width three-region layout (settings LEFT, canvas CENTER, live preview
//     RIGHT) for the active email, reusing the shared email block editor unchanged.
//
// The target send date is campaigns.scheduled_for, written per-email by setCampaignSendDateAction (staff/
// writer-gated, date only — never an arm of a real send). Semantic DAWN tokens only, no hex; voice canon
// (no em dashes).

const EDITOR_ANCHOR = 'beta-email-editor'

export interface BetaCampaignStats {
  delivered: number
  opens: number
  clicks: number
  deliveryRate: number
  suppressed: number
}

/** ISO → the YYYY-MM-DD a native date input wants, in LOCAL time (so the shown day never drifts a timezone). */
function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO → a short, human target date (e.g. "Aug 3, 2026"). */
function formatTargetDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function BetaCampaignWorkspace({
  initialSequence,
  stats,
  segments,
}: {
  initialSequence: BetaSequenceEmail[]
  stats: BetaCampaignStats
  segments: SegmentOption[]
}) {
  const [sequence, setSequence] = useState<BetaSequenceEmail[]>(initialSequence)
  const [selectedId, setSelectedId] = useState<string | null>(initialSequence[0]?.id ?? null)
  const [loaded, setLoaded] = useState<LoadedEmailCampaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reqRef = useRef(0)
  const editorRef = useRef<HTMLElement | null>(null)

  // Load the selected email into the editor whenever the selection changes; a newer selection always wins.
  useEffect(() => {
    const req = ++reqRef.current
    async function run() {
      if (!selectedId) {
        setLoaded(null)
        return
      }
      setLoading(true)
      try {
        const data = await loadEmailCampaign(selectedId)
        if (req === reqRef.current) setLoaded(data)
      } catch {
        if (req === reqRef.current) setLoaded(null)
      } finally {
        if (req === reqRef.current) setLoading(false)
      }
    }
    void run()
  }, [selectedId])

  const refresh = useCallback(async () => {
    const next = await listBetaSequenceEmails()
    setSequence(next)
    return next
  }, [])

  const scrollToEditor = useCallback(() => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Click a card: select it AND scroll the editor into view (on-page anchor, no reload).
  function onSelect(id: string) {
    setSelectedId(id)
    scrollToEditor()
  }

  function onNew() {
    setError(null)
    startTransition(async () => {
      const res = await createBetaEmailDraft()
      if (isError(res)) {
        setError(res.error)
        return
      }
      await refresh()
      setSelectedId(res.data.id)
      // Let the new editor mount, then scroll to it.
      requestAnimationFrame(scrollToEditor)
    })
  }

  // Keep the card label in sync as the operator edits the subject in the editor.
  const onSubjectChange = useCallback((id: string, subject: string) => {
    setSequence((prev) => prev.map((c) => (c.id === id ? { ...c, subject } : c)))
  }, [])

  // Inline target-date edit: a native date control writes ONLY scheduled_for (never arms a send). Optimistic,
  // reconciled on failure.
  function onDateChange(id: string, value: string) {
    const iso = value ? new Date(`${value}T12:00:00`).toISOString() : null
    setSequence((prev) => prev.map((c) => (c.id === id ? { ...c, scheduledFor: iso } : c)))
    setError(null)
    startTransition(async () => {
      const res = await setCampaignSendDateAction(id, iso)
      if (isError(res)) {
        setError(res.error)
        await refresh()
      }
    })
  }

  const total = sequence.length
  const approved = sequence.filter((s) => s.approvalStatus === 'approved').length
  const sent = sequence.filter((s) => s.status === 'sent').length
  const selectedStatus = (sequence.find((s) => s.id === selectedId)?.status ?? 'draft') as CampaignStatus

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {/* TOP — the sequence (left) and the campaign stats (right). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT — the numbered sequence */}
        <section aria-label="Beta email sequence" className="min-w-0">
          <SectionHeader title="Beta email sequence" count={total} />
          {total === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted">
              No beta emails yet. Start one below.
            </p>
          ) : (
            <ol className="space-y-2">
              {sequence.map((email) => {
                const active = email.id === selectedId
                const target = formatTargetDate(email.scheduledFor)
                return (
                  <li key={email.id}>
                    <div
                      className={`flex gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                        active ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:border-border-strong'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold tabular-nums ${
                          active ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted'
                        }`}
                        aria-hidden
                      >
                        {email.seq}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <button
                          type="button"
                          onClick={() => onSelect(email.id)}
                          aria-current={active}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                            {email.subject.trim() || 'Untitled email'}
                          </span>
                          {email.status !== 'draft' && (
                            <span className="shrink-0 text-3xs font-semibold uppercase tracking-wide text-primary-strong">
                              {email.status}
                            </span>
                          )}
                        </button>
                        <label className="flex items-center gap-1.5 text-2xs text-subtle">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="shrink-0">{target ? 'Target' : 'Set target date'}</span>
                          <input
                            type="date"
                            value={toDateInputValue(email.scheduledFor)}
                            onChange={(e) => onDateChange(email.id, e.target.value)}
                            disabled={pending}
                            aria-label={`Target send date for email ${email.seq}, ${email.subject.trim() || 'Untitled email'}`}
                            className="rounded-md border border-border bg-canvas px-1.5 py-0.5 text-2xs text-text disabled:opacity-50"
                          />
                        </label>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {/* "+ New email" sits at the BOTTOM of the list. */}
          <button
            type="button"
            onClick={onNew}
            disabled={pending}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            New email
          </button>
        </section>

        {/* RIGHT — campaign stats */}
        <aside aria-label="Campaign stats" className="min-w-0">
          <SectionHeader title="Campaign stats" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Delivered" value={stats.delivered.toLocaleString()} icon={Send} />
              <StatCard label="Opens" value={stats.opens.toLocaleString()} icon={Eye} />
              <StatCard label="Clicks" value={stats.clicks.toLocaleString()} icon={MousePointerClick} />
              <StatCard
                label="Delivery rate"
                value={`${Math.round(stats.deliveryRate * 100)}%`}
                icon={Mail}
                detail={`${stats.suppressed.toLocaleString()} suppressed`}
              />
            </div>
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Sequence progress
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold tabular-nums leading-none text-text">
                  {approved}
                  <span className="text-sm font-semibold text-muted">/{total}</span>
                </span>
                <span className="text-xs font-medium text-muted">approved</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold tabular-nums leading-none text-text">
                  {sent}
                  <span className="text-sm font-semibold text-muted">/{total}</span>
                </span>
                <span className="text-xs font-medium text-muted">sent</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* BELOW — the editor for the active email (settings LEFT · canvas CENTER · preview RIGHT). */}
      <section id={EDITOR_ANCHOR} ref={editorRef} aria-label="Email editor" className="scroll-mt-24">
        <SectionHeader title="Editor" />
        {selectedId == null ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border">
            <p className="text-sm text-muted">Pick an email above, or start a new one.</p>
          </div>
        ) : loading || !loaded ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border">
            <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
          </div>
        ) : (
          <EmailEditorPane
            key={loaded.id}
            campaign={loaded}
            onSubjectChange={onSubjectChange}
            arrangement="trio"
            sidebar={<SendPanel campaignId={loaded.id} status={selectedStatus} segments={segments} />}
          />
        )}
      </section>
    </div>
  )
}
