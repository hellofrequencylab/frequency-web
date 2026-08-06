'use client'

// "Message my group" (ADR-812 Phase 4) — a leader writes one message and it fans out to every member
// below them, AS THEMSELVES, into one tracked conversation each (replies land back in /lead/inbox). The
// button opens a sheet (mobile) / centered dialog (desktop) via the shared Dialog primitive. It shows the
// reach ("this goes to N people") up front and the send tally afterward. The consent gate still runs
// per member, so the actual sent count can be lower than the reach.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { isError } from '@/lib/action-result'
import { sendLeaderBroadcast } from '@/app/(main)/lead/inbox/actions'
import { Textarea } from '@/components/ui/field'

export function LeaderBroadcast({ reach }: { reach: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; skipped: number; total: number } | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (pending) return
    if (!subject.trim()) return setError('Add a subject line.')
    if (!body.trim()) return setError('Write your message first.')
    setError(null)
    start(async () => {
      const res = await sendLeaderBroadcast({ subject: subject.trim(), body: body.trim() })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setResult(res.data)
      setSubject('')
      setBody('')
      router.refresh()
    })
  }

  const field =
    'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-body-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null)
          setError(null)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Send className="h-4 w-4" /> Message my group
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} align="sheet" ariaLabel="Message my group">
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-body font-semibold text-text">Message my group</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-muted">
              <Users className="h-3.5 w-3.5" />
              Goes to {reach} {reach === 1 ? 'person' : 'people'}, from you. Each reply comes back to your inbox.
            </p>
          </div>

          {result ? (
            <div className="rounded-lg bg-success-bg px-3 py-3 text-body-sm text-success">
              Sent to {result.sent} {result.sent === 1 ? 'person' : 'people'}.
              {result.skipped > 0 && (
                <span className="text-muted"> {result.skipped} skipped (they turned email off or have no address).</span>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-meta font-semibold text-text hover:bg-surface-elevated"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                aria-label="Subject"
                className={field}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write to your group..."
                aria-label="Message"
                rows={6}
                className="resize-none leading-relaxed"
              />
              {error && (
                <p role="alert" className="text-meta text-danger">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs text-muted">Members who opted out of email are skipped.</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-meta font-semibold text-muted hover:bg-surface-elevated disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !subject.trim() || !body.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send to {reach}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
