'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2, Send } from 'lucide-react'
import { MergeTagPicker } from './merge-tag-picker'
import { sendTestEmail } from '@/app/(main)/admin/email-studio/actions'
import { isError } from '@/lib/action-result'

// COMPOSE TOOLBAR. The header controls above the block arranger: the subject + preheader fields, a "Send test
// to me" button (delivers ONE copy to the operator's own address, never a list), the merge-tag picker, and
// the live-preview toggle. Subject / preheader changes bubble up to the editor pane, which persists them
// debounced through saveEmailCampaign. Voice canon: plain, no em dashes.

export function ComposeToolbar({
  campaignId,
  subject,
  preheader,
  onSubject,
  onPreheader,
  previewOpen,
  onTogglePreview,
}: {
  campaignId: string
  subject: string
  preheader: string
  onSubject: (value: string) => void
  onPreheader: (value: string) => void
  previewOpen: boolean
  onTogglePreview: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function onSendTest() {
    setNote(null)
    startTransition(async () => {
      const res = await sendTestEmail(campaignId)
      if (isError(res)) setNote({ kind: 'error', text: res.error })
      else setNote({ kind: 'ok', text: `Test sent to ${res.data.to}.` })
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Subject</span>
          <input
            type="text"
            value={subject}
            placeholder="Subject line"
            onChange={(e) => onSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
            Preheader
          </span>
          <input
            type="text"
            value={preheader}
            placeholder="The preview line shown beside the subject in the inbox"
            onChange={(e) => onPreheader(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MergeTagPicker />
        <button
          type="button"
          onClick={onSendTest}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Send test to me
        </button>
        <button
          type="button"
          aria-pressed={previewOpen}
          onClick={onTogglePreview}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
        >
          {previewOpen ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          {previewOpen ? 'Hide preview' : 'Show preview'}
        </button>
      </div>

      {note && (
        <p
          role="status"
          className={`text-2xs font-medium ${note.kind === 'ok' ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}
