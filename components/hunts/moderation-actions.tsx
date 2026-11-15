'use client'

// The operator's pause, resume and close controls for one Trail in the queue (FH-018S). The server
// decides who may (decide: pause_resume, end), so showing these controls grants nothing. One idempotency
// key per action, kept across retries. Close is final, so it asks for one more tap.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'

type Action = 'pause' | 'resume' | 'close'

export function ModerationActions({ huntId, state }: { huntId: string; state: 'published' | 'paused' }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [keys] = useState<Record<Action, string>>(() => ({ pause: crypto.randomUUID(), resume: crypto.randomUUID(), close: crypto.randomUUID() }))

  async function act(action: Action) {
    setBusy(true)
    try {
      const res = await fetch('/api/hunts/moderation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ huntId, action, note: note.trim() || undefined, idempotencyKey: keys[action] }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      setMessage(typeof json.message === 'string' ? json.message : 'You can not change this Trail.')
      setConfirmClose(false)
      if (json.ok === true) router.refresh()
    } catch {
      setMessage('Something went wrong. Tap again to retry.')
    } finally {
      setBusy(false)
    }
  }

  const id = `moderation-note-${huntId}`
  return (
    <div className="mt-3 space-y-2">
      <label className={labelClasses} htmlFor={id}>Note for the record (optional)</label>
      <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
      <div className="flex flex-wrap gap-2">
        {state === 'published' ? <Button type="button" disabled={busy} onClick={() => void act('pause')}>Pause this Trail</Button> : null}
        {state === 'paused' ? <Button type="button" disabled={busy} onClick={() => void act('resume')}>Run it again</Button> : null}
        {confirmClose ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void act('close')}>Close for good</Button>
        ) : (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmClose(true)}>Close this Trail</Button>
        )}
      </div>
      {message && <p role="status" className="text-body-sm text-muted">{message}</p>}
    </div>
  )
}
