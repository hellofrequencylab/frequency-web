'use client'

// The apply form for one track (Growth OS Engine 3, GE3-2/GE3-3, ADR-456). Renders
// the track's plain questions, validates required ones, and dispatches the gated
// apply action. On success it shows a calm confirmation in place. Strings are
// CONTENT-VOICE (plain, no em dashes); semantic tokens only.

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { applyToTrack } from '../actions'

export interface ApplyQuestion {
  key: string
  label: string
  hint: string | null
  short: boolean
  required: boolean
}

export function ApplyForm({ track, questions }: { track: string; questions: ApplyQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }))
  }

  function submit() {
    setErr(null)
    start(async () => {
      const res = await applyToTrack({ track, answers })
      if (isError(res)) {
        setErr(res.error)
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-text">That is it. We have your application.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          A real person reads every one. We will be in touch.
        </p>
      </div>
    )
  }

  const missingRequired = questions.some((q) => q.required && !(answers[q.key] ?? '').trim())

  return (
    <div className="space-y-5">
      {questions.map((q) => (
        <div key={q.key}>
          <Label htmlFor={`q-${q.key}`}>
            {q.label}
            {!q.required && <span className="ml-1.5 text-2xs font-normal text-subtle">Optional</span>}
          </Label>
          {q.hint && <p className="mb-1.5 text-xs text-subtle">{q.hint}</p>}
          {q.short ? (
            <Input
              id={`q-${q.key}`}
              value={answers[q.key] ?? ''}
              onChange={(e) => set(q.key, e.target.value)}
              maxLength={200}
            />
          ) : (
            <Textarea
              id={`q-${q.key}`}
              value={answers[q.key] ?? ''}
              onChange={(e) => set(q.key, e.target.value)}
              rows={3}
              maxLength={1500}
            />
          )}
        </div>
      ))}

      {err && <p className="text-sm text-danger">{err}</p>}

      <Button onClick={submit} disabled={pending || missingRequired}>
        {pending ? 'Sending…' : 'Send application'}
      </Button>
    </div>
  )
}
