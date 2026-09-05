'use client'

import { useRef, useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2, Send } from 'lucide-react'
import { MergeTagPicker } from './merge-tag-picker'
import { EmojiPicker } from '@/components/feed/emoji-picker'
import { sendTestEmail } from '@/app/(main)/admin/email-studio/actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { Input } from '@/components/ui/field'

// COMPOSE TOOLBAR. The header controls above the block arranger: the subject + preheader fields, a "Send test
// to me" button (delivers ONE copy to the operator's own address, never a list), the merge-tag picker, and
// the live-preview toggle. Subject / preheader changes bubble up to the editor pane, which persists them
// debounced through saveEmailCampaign. Voice canon: plain, no em dashes.

export function ComposeToolbar({
  campaignId,
  subject,
  preheader,
  fromName,
  replyMode,
  onSubject,
  onPreheader,
  onFromName,
  onReplyMode,
  previewOpen,
  onTogglePreview,
  showPreviewToggle = true,
  sendTest = sendTestEmail,
  saveNote = null,
}: {
  campaignId: string
  subject: string
  preheader: string
  /** The friendly From display name recipients see. Blank sends as the default Frequency name. */
  fromName: string
  /** How replies are handled. When paired with onReplyMode, a Broadcast/Conversation toggle shows. */
  replyMode?: 'broadcast' | 'conversation'
  onSubject: (value: string) => void
  onPreheader: (value: string) => void
  onFromName: (value: string) => void
  /** Provide to show the reply-mode toggle (the campaign composer). Omit on surfaces with a fixed mode. */
  onReplyMode?: (value: 'broadcast' | 'conversation') => void
  previewOpen: boolean
  onTogglePreview: () => void
  /** The trio layout shows the preview permanently on the right, so it hides this toggle. */
  showPreviewToggle?: boolean
  /** A field autosave that did not land (scan2 L5-11): the refusal, the value still ON FILE for each field
   *  that did not save, and a retry. Null (or omitted) when everything typed has landed. */
  saveNote?: { message: string; onFile: Array<{ label: string; value: string }>; onRetry: () => void } | null
  /** The test-send action ("Send test to me"). Defaults to the admin Email Studio's sendTestEmail; a per-Space
   *  editor injects its own space-scoped, brand-compiling test-send (sendSpaceTestEmail). */
  sendTest?: (campaignId: string) => Promise<ActionResult<{ to: string }>>
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  // Splice a picked emoji into the SUBJECT at the caret (or over the selection), then restore focus + caret
  // just past it. The subject is a controlled input, so we read the live selection off the ref, hand the new
  // string up through onSubject (which sets state + autosaves), and reposition the caret after the value
  // repaints. Offsets are UTF-16 code units, which is exactly what setSelectionRange expects, so a multi-unit
  // emoji lands the caret correctly. Falls back to appending when the ref is not mounted.
  function insertEmojiIntoSubject(emoji: string) {
    const el = subjectRef.current
    if (!el) {
      onSubject(subject + emoji)
      return
    }
    const start = el.selectionStart ?? subject.length
    const end = el.selectionEnd ?? start
    onSubject(subject.slice(0, start) + emoji + subject.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  function onSendTest() {
    setNote(null)
    startTransition(async () => {
      const res = await sendTest(campaignId)
      if (isError(res)) setNote({ kind: 'error', text: res.error })
      else setNote({ kind: 'ok', text: `Test sent to ${res.data.to}.` })
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">Subject</span>
          <Input
            ref={subjectRef}
            type="text"
            value={subject}
            placeholder="Subject line"
            onChange={(e) => onSubject(e.target.value)}
            className="bg-surface-elevated/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">
            Preheader
          </span>
          <Input
            type="text"
            value={preheader}
            placeholder="The preview line shown beside the subject in the inbox"
            onChange={(e) => onPreheader(e.target.value)}
            className="bg-surface-elevated/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">
            From name
          </span>
          <Input
            type="text"
            value={fromName}
            placeholder="Frequency"
            onChange={(e) => onFromName(e.target.value)}
            className="bg-surface-elevated/50"
          />
          <span className="mt-1 block text-2xs text-muted">
            The name recipients see this email is from. Leave it blank to send as Frequency. The sending address stays the same.
          </span>
        </label>
        {saveNote && (
          <div role="status" className="space-y-0.5 text-2xs">
            <p className="font-medium text-danger">Not saved. {saveNote.message}</p>
            <p className="text-muted">
              Still on file: {saveNote.onFile.map((f) => `${f.label} "${f.value}"`).join(', ')}.{' '}
              <button type="button" onClick={saveNote.onRetry} className="font-semibold text-text underline">
                Try again
              </button>
            </p>
          </div>
        )}
        {onReplyMode && (
          <div className="block sm:col-span-2">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">Replies</span>
            <div className="inline-flex items-center gap-1 rounded-lg bg-surface-elevated p-0.5 text-meta">
              <button
                type="button"
                onClick={() => onReplyMode('broadcast')}
                aria-pressed={replyMode !== 'conversation'}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  replyMode !== 'conversation' ? 'bg-surface text-primary-strong lift-1' : 'text-muted'
                }`}
              >
                Announcement
              </button>
              <button
                type="button"
                onClick={() => onReplyMode('conversation')}
                aria-pressed={replyMode === 'conversation'}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  replyMode === 'conversation' ? 'bg-surface text-primary-strong lift-1' : 'text-muted'
                }`}
              >
                Conversation
              </button>
            </div>
            <span className="mt-1 block text-2xs text-muted">
              {replyMode === 'conversation'
                ? 'Reply-able: each send opens a tracked thread in your inbox, and replies come back to it.'
                : 'A no-reply mass send. Best for newsletters and announcements.'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MergeTagPicker />
        {/* Drop an emoji into the subject line at the caret. */}
        <EmojiPicker onSelect={insertEmojiIntoSubject} />
        <button
          type="button"
          onClick={onSendTest}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Send test to me
        </button>
        {showPreviewToggle && (
          <button
            type="button"
            aria-pressed={previewOpen}
            onClick={onTogglePreview}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
          >
            {previewOpen ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {previewOpen ? 'Hide preview' : 'Show preview'}
          </button>
        )}
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
