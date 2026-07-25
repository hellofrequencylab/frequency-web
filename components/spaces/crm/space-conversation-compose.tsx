'use client'

// "New conversation" for a Space Conversations console (ADR-812): a space manager starts a ticketed 1:1
// with one of their own members/contacts. Sends as the space, opens a tracked thread, and the reply comes
// back to it. Uses the shared Dialog primitive (full-screen sheet on mobile). The send action is injected
// (bound to the space slug server-side) so this component only passes the payload.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PenLine, Send } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { isError, type ActionResult } from '@/lib/action-result'

type StartAction = (input: { email: string; subject: string; body: string }) => Promise<ActionResult<{ ref: string }>>

export function SpaceConversationCompose({
  startAction,
  description = 'Message one of your contacts as your space. It opens a tracked thread, and their reply comes back here.',
}: {
  startAction: StartAction
  /** Override the explainer line (the platform workspace reuses this dialog with its own copy). */
  description?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

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
      setEmail('')
      setSubject('')
      setBody('')
      router.refresh()
    })
  }

  const field =
    'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDone(false)
          setError(null)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <PenLine className="h-4 w-4" /> New conversation
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} align="sheet" ariaLabel="New conversation">
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold text-text">New conversation</h2>
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          </div>

          {done ? (
            <div className="rounded-lg bg-success-bg px-3 py-3 text-sm text-success">
              Sent. The conversation is now in your inbox.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-surface-elevated"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Recipient email" aria-label="Recipient email" className={field} />
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={field} />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                aria-label="Message"
                rows={6}
                className={`${field} resize-none leading-relaxed`}
              />
              {error && (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface-elevated disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || !email.trim() || !subject.trim() || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
