'use client'

// The player's report control (FH-018S). One reason, an optional few words, one tap. One idempotency key
// per form, kept across retries, so a dropped connection can be tapped again without a second report.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { labelClasses, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

const REASONS = [
  { value: 'unsafe', label: 'Someone could get hurt' },
  { value: 'private_property', label: 'It sends people onto private property' },
  { value: 'minor_risk', label: 'It puts a young person at risk' },
  { value: 'wrong_or_broken', label: 'A stop is wrong or broken' },
  { value: 'offensive', label: 'It is offensive' },
  { value: 'other', label: 'Something else' },
] as const

export function ReportTrailForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch('/api/hunts/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, reason, details: details.trim() || undefined, idempotencyKey: key }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      setMessage(typeof json.message === 'string' ? json.message : 'Something went wrong. Try again.')
      if (json.ok === true) setDone(true)
    } catch {
      setMessage('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Report this Trail</Button>
  }

  return (
    <form
      className="space-y-3 rounded-card border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className={labelClasses} htmlFor="report-reason">What is wrong?</label>
      <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} emptyLabel="Pick one" disabled={done} />
      <label className={labelClasses} htmlFor="report-details">Anything we should know? (optional)</label>
      <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} disabled={done} />
      <Button type="submit" disabled={busy || done || !reason}>Send report</Button>
      {message && <p role="status" className="text-body-sm text-muted">{message}</p>}
    </form>
  )
}
