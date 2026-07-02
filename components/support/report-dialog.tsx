'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Bug, HelpCircle, MessageSquare, Lightbulb, X, ImagePlus, Loader2, Check,
  ExternalLink, ChevronDown, ChevronUp, Trash2, Sparkles,
} from 'lucide-react'
import { createSupportTicket, askHelp } from '@/app/(main)/support/actions'
import { isError } from '@/lib/action-result'
import { gatherSupportContext, contextLines } from '@/lib/support/context'
import { TYPE_LABELS, type SupportContext, type TicketType } from '@/lib/support/types'
import type { HelpCitation } from '@/lib/ai/help-rag'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'

const TYPE_META: { key: TicketType; icon: typeof Bug }[] = [
  { key: 'bug', icon: Bug },
  { key: 'question', icon: HelpCircle },
  { key: 'feedback', icon: MessageSquare },
  { key: 'idea', icon: Lightbulb },
]

// The report dialog (ADR-159) — one surface for bugs, questions, feedback and ideas.
// It auto-captures the page + activity context on open, lets the member paste or
// attach a screenshot, and files a ticket. Reachable from a global "Report" button
// and from the Vera chat box.
export function ReportDialog({
  open,
  onClose,
  defaultType = 'bug',
}: {
  open: boolean
  onClose: () => void
  defaultType?: TicketType
}) {
  const [type, setType] = useState<TicketType>(defaultType)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  // The launcher remounts this dialog (changing key) on each open, so the form state
  // and a fresh context capture initialize cleanly — no reset-on-open effect needed.
  const [context] = useState<SupportContext>(() => gatherSupportContext())
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; ref: number } | null>(null)
  const [pending, start] = useTransition()
  const [asking, startAsk] = useTransition()
  const [vera, setVera] = useState<{ answer: string | null; citations: HelpCitation[]; deflected: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Trap + restore focus while open (mirrors ui/Dialog). ESC + scroll-lock stay in the
  // effect below; the hook adds only the focus concerns this hand-rolled dialog missed.
  useDialogFocusTrap(open, panelRef)

  // "Ask Vera before you file" — try the help center first; if it answers, the member can
  // close without filing a ticket (the support-deflection / intake side of the loop).
  function askVera() {
    if (!subject.trim() || asking) return
    setError(null)
    startAsk(async () => {
      const r = await askHelp(`${subject}\n${body}`.trim())
      if (isError(r)) { setError(r.error); return }
      setVera(r.data)
    })
  }

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Revoke the preview object URL when it changes/unmounts.
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url) }, [shot])

  function attach(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setShot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  }

  // Paste a screenshot straight from the clipboard (Cmd/Ctrl+Shift+4 → paste).
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (item) attach(item.getAsFile())
  }

  function submit() {
    if (!subject.trim()) { setError('Add a short summary of the issue.'); return }
    const fd = new FormData()
    fd.set('type', type)
    fd.set('subject', subject)
    fd.set('body', body)
    fd.set('pageUrl', context.url ?? '')
    fd.set('context', JSON.stringify(context))
    if (shot) fd.set('screenshot', shot.file, shot.file.name || 'screenshot.png')
    setError(null)
    start(async () => {
      const r = await createSupportTicket(fd)
      if ('error' in r) { setError(r.error); return }
      setDone(r.data)
    })
  }

  if (!open) return null

  const lines = contextLines(context)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Report an issue"
        tabIndex={-1}
        onPaste={onPaste}
        className="relative flex w-full flex-col overflow-y-auto border-border bg-canvas p-4 shadow-2xl outline-none motion-safe:animate-[slideUp_0.25s_ease-out] sm:max-h-[92vh] sm:max-w-lg sm:rounded-3xl sm:border"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-base font-bold text-text">{done ? 'Report sent' : 'Send a report'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success-bg/40 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                <Check className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Thanks. We’re on it.</p>
                <p className="text-xs text-muted">Your report is logged as ticket #{done.ref}. We’ll reply in your support history.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/support/${done.id}`} onClick={onClose} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
                View ticket <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Link href="/support" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-text">
                All my tickets
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Found a bug or stuck on something? Tell us what happened. We capture the page details
              automatically, and you can drop in a screenshot.
            </p>

            {/* Type selector */}
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {TYPE_META.map(({ key, icon: Icon }) => {
                const active = type === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-2xs font-semibold transition-colors ${
                      active ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {TYPE_LABELS[key]}
                  </button>
                )
              })}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-subtle">Summary</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={type === 'bug' ? 'e.g. Capture button does nothing on the feed' : 'A short summary'}
                maxLength={160}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-subtle">What happened?</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="What you were doing, what you expected, and what happened instead."
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
              />
            </label>

            {/* Screenshot */}
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-subtle">Screenshot <span className="font-normal text-subtle">· optional, paste or attach</span></span>
              {shot ? (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.url} alt="Attached screenshot" className="max-h-48 w-full object-contain bg-surface-elevated" />
                  <button type="button" onClick={() => setShot(null)} aria-label="Remove screenshot" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-4 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                >
                  <ImagePlus className="h-4 w-4" /> Paste a screenshot, or tap to attach
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => attach(e.target.files?.[0])}
              />
            </div>

            {/* Captured context — collapsed by default */}
            {lines.length > 0 && (
              <div className="mt-3 rounded-xl border border-border bg-surface-elevated/40">
                <button type="button" onClick={() => setShowContext((v) => !v)} aria-expanded={showContext} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-muted">
                  <span>Page details we’ll include</span>
                  {showContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showContext && (
                  <dl className="space-y-1 border-t border-border px-3 py-2 text-2xs">
                    {lines.map((l) => (
                      <div key={l.label} className="flex gap-2">
                        <dt className="w-20 shrink-0 font-semibold text-subtle">{l.label}</dt>
                        <dd className="min-w-0 flex-1 truncate text-muted" title={l.value}>{l.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}

            {/* Ask-Vera answer — try the help center before filing. */}
            {vera && (
              <div className="mt-3 rounded-2xl border border-signal/40 bg-signal-bg/20 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-signal-strong">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-2xs font-bold uppercase tracking-wide">Vera</span>
                </div>
                <p className="text-sm leading-relaxed text-text">
                  {vera.answer ?? "I couldn’t find a sure answer in the help center. Go ahead and send it to the team."}
                </p>
                {vera.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vera.citations.map((c) => (
                      <Link key={c.href} href={c.href} onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-0.5 text-2xs font-semibold text-signal-strong hover:underline">
                        {c.heading || c.slug} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ))}
                  </div>
                )}
                {vera.answer && (
                  <button type="button" onClick={onClose} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-success-bg/50 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success-bg/70">
                    <Check className="h-3.5 w-3.5" /> That solved it, close
                  </button>
                )}
              </div>
            )}

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={askVera}
                disabled={asking || !subject.trim()}
                title="Check the help center before filing"
                className="inline-flex items-center gap-1.5 rounded-xl border border-signal/50 bg-signal-bg/30 px-3 py-2 text-sm font-semibold text-signal-strong transition-colors hover:bg-signal-bg/50 disabled:opacity-50"
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Ask Vera first
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !subject.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? 'Sending…' : vera ? 'Send to the team' : 'Send report'}
              </button>
              <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-text">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
