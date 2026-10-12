'use client'

// "New conversation" for a Space Conversations console (ADR-812): a space manager starts a ticketed 1:1
// with one of their contacts, or with someone new (a new address becomes a contact on send, owner ruling
// 2026-10-12). Sends as the space, opens a tracked thread, and the reply comes back to it. The send action
// is injected (bound to the space slug server-side) so this component only passes the payload.
//
// The panel is a bottom sheet on a phone and a centred card at sm+ (Dialog `align="bottom"`). It used to
// ask for `align="sheet"` with no card of its own, so on a desk the fields floated edge to edge over the
// dimmed page with no surface behind them (owner, 2026-10-12: "this conversations pop up is ridiculous").
// Dialog owns the chrome; this component owns the card, which is why the surface, radius and shadow are
// here and not there.

import { useId, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Inbox, PenLine, Send, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { isError, type ActionResult } from '@/lib/action-result'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'

type StartAction = (input: { email: string; subject: string; body: string }) => Promise<ActionResult<{ ref: string }>>

export function SpaceConversationCompose({
  startAction,
  senderName,
  description = 'It opens a tracked thread in this inbox, and their reply lands in the same place.',
}: {
  startAction: StartAction
  /** Who the message goes out as (the Space's name). Shown as the eyebrow over the title. */
  senderName?: string
  /** Override the explainer line (the platform workspace reuses this dialog with its own copy). */
  description?: string
}) {
  const router = useRouter()
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const ready = !!email.trim() && !!subject.trim() && !!body.trim()

  function reset() {
    setDone(false)
    setError(null)
    setEmail('')
    setSubject('')
    setBody('')
  }

  function submit() {
    if (pending) return
    if (!email.trim() || !email.includes('@')) return setError('Add a valid recipient email.')
    if (!subject.trim()) return setError('Add a subject line.')
    if (!body.trim()) return setError('Write your message first.')
    setError(null)
    start(async () => {
      const res = await startAction({ email: email.trim(), subject: subject.trim(), body: body.trim() })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setDone(true)
      router.refresh()
    })
  }

  // Cmd/Ctrl+Enter sends from any field, the same chord every mail client teaches.
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setDone(false)
          setError(null)
          setOpen(true)
        }}
      >
        <PenLine className="h-4 w-4" aria-hidden /> New conversation
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} align="bottom" className="max-w-2xl" ariaLabelledBy={headingId}>
        <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-card bg-surface shadow-pop-lg sm:rounded-card">
          {done ? (
            <div className="flex flex-col items-center px-6 pb-8 pt-10 text-center sm:px-10">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
                <CheckCircle2 className="h-7 w-7" aria-hidden />
              </span>
              <h2 id={headingId} className="font-section mt-5 text-page-title font-bold text-text">
                Sent
              </h2>
              <p className="mt-2 max-w-md text-body-sm text-muted">
                The conversation is in your inbox now. Their reply lands in the same thread, so you never have to go
                looking for it.
              </p>
              <div className="mt-7 flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={reset}>
                  Send another
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
                <div className="min-w-0">
                  {senderName ? (
                    <p className="text-meta font-semibold uppercase tracking-wide text-primary">From {senderName}</p>
                  ) : null}
                  <h2 id={headingId} className="font-section mt-1 text-page-title font-bold text-text">
                    New conversation
                  </h2>
                  <p className="mt-1.5 text-body-sm text-muted">{description}</p>
                </div>
                <IconButton type="button" onClick={() => setOpen(false)} label="Close" variant="plain">
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>

              <div className="space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
                <Field label="To" hint="Someone new joins your contacts when you send.">
                  <Input
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="name@example.com"
                    autoFocus
                  />
                </Field>
                <Field label="Subject">
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="What this is about"
                    maxLength={200}
                  />
                </Field>
                <Field label="Message">
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Write it the way you would say it."
                    rows={8}
                    className="resize-y leading-relaxed"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 border-t border-border bg-surface-elevated px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                {error ? (
                  <p role="alert" className="text-meta font-medium text-danger">
                    {error}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-meta text-subtle">
                    <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Replies come back to this inbox. Cmd+Enter sends.
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={submit} disabled={!ready} loading={pending}>
                    <Send className="h-4 w-4" aria-hidden />
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
