'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/field'
import { MAX_GUEST_PLUS_ONES, type GuestSeatQuestion, type GuestSeatState } from '@/lib/events/guest-seat'
import { releaseGuestSeat, updateGuestSeat } from './seat-actions'

// The submits the seat page waits for (PROG-GD2). Nothing here runs on mount: every server action
// is behind a tap, and the release is behind two. The member RSVP control
// (components/events/rsvp-controls.tsx) is the twin: the same plus-ones stepper, the same six
// question types, saved through the seat's token instead of a session.

type Props = {
  token: string
  slug: string
  state: GuestSeatState
  plusOnes: number
  questions: GuestSeatQuestion[]
}

export function GuestSeatForm({ token, slug, state, plusOnes: initialPlusOnes, questions }: Props) {
  const [plusOnes, setPlusOnes] = useState(initialPlusOnes)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.answer])),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [released, setReleased] = useState(false)
  const [pending, startTransition] = useTransition()

  const eventHref = `/events/${encodeURIComponent(slug)}`
  // Only a confirmed seat brings anyone (the member rule, setRsvpPlusOnes).
  const canBring = state === 'going'
  const hasSomethingToChange = canBring || questions.length > 0

  if (released) {
    return (
      <div className="space-y-4">
        <p className="text-body text-text">
          Your spot is released. If someone was waiting, they have it now, and the host has the
          right count.
        </p>
        <p className="text-body-sm text-muted">
          Plans change again? Sign in with the same email you used and take a spot from the event
          page. This link has done its job and will not open again.
        </p>
        <Button asChild variant="secondary">
          <Link href={eventHref}>View event</Link>
        </Button>
      </div>
    )
  }

  if (state === 'not_going') {
    return (
      <Button asChild variant="secondary">
        <Link href={eventHref}>View event</Link>
      </Button>
    )
  }

  const save = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateGuestSeat({
        token,
        slug,
        plusOnes: canBring ? plusOnes : null,
        answers: questions.length > 0 ? answers : null,
      })
      if (res.ok) setSaved(true)
      else setError(res.error)
    })
  }

  const release = () => {
    setError(null)
    startTransition(async () => {
      const res = await releaseGuestSeat({ token, slug })
      if (res.ok) setReleased(true)
      else {
        setError(res.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="space-y-8">
      {hasSomethingToChange && (
        <section className="space-y-5">
          {canBring && (
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-text">Bringing anyone?</p>
              <p className="text-body-sm text-muted">
                Plus-ones help the host plan. Up to {MAX_GUEST_PLUS_ONES}, and you can change it until the
                gathering starts.
              </p>
              <div className="inline-flex items-center gap-2 rounded-card border border-border bg-surface p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlusOnes((n) => Math.max(0, n - 1))}
                  disabled={pending || plusOnes <= 0}
                  aria-label="One fewer plus-one"
                >
                  -
                </Button>
                <span className="min-w-[4.5rem] text-center text-body-sm font-semibold text-text" aria-live="polite">
                  {plusOnes === 0 ? 'Just me' : `+${plusOnes}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlusOnes((n) => Math.min(MAX_GUEST_PLUS_ONES, n + 1))}
                  disabled={pending || plusOnes >= MAX_GUEST_PLUS_ONES}
                  aria-label="One more plus-one"
                >
                  +
                </Button>
              </div>
            </div>
          )}

          {questions.length > 0 && (
            <div className="space-y-4 rounded-card border border-border bg-surface p-4">
              <p className="text-body-sm font-semibold text-text">A few questions from the host</p>
              {questions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(v) => {
                    setSaved(false)
                    setAnswers((a) => ({ ...a, [q.id]: v }))
                  }}
                  disabled={pending}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={save} loading={pending && !confirming} disabled={pending}>
              Save changes
            </Button>
            {saved && <span className="text-body-sm text-muted" role="status">Saved.</span>}
          </div>
        </section>
      )}

      <section className="space-y-3 border-t border-border pt-6">
        <p className="text-body-sm font-semibold text-text">Can&apos;t make it?</p>
        <p className="text-body-sm text-muted">
          {state === 'going'
            ? 'Give the spot back and the next person on the waitlist moves in. The host gets an accurate count.'
            : state === 'waitlist'
              ? 'Leave the waitlist and you will not be moved in if a spot opens.'
              : 'Withdraw the request and the host will not see it in their queue.'}
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="danger" onClick={release} loading={pending} disabled={pending}>
              {state === 'going' ? 'Yes, give it back' : state === 'waitlist' ? 'Yes, leave the waitlist' : 'Yes, withdraw'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button type="button" variant="dangerOutline" onClick={() => setConfirming(true)} disabled={pending}>
            {state === 'going' ? 'Release my spot' : state === 'waitlist' ? 'Leave the waitlist' : 'Withdraw my request'}
          </Button>
        )}
      </section>

      {error && (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// One question, by type. The same six the member questionnaire renders.
function QuestionField({
  question: q,
  value,
  onChange,
  disabled,
}: {
  question: GuestSeatQuestion
  value: string
  onChange: (next: string) => void
  disabled: boolean
}) {
  const id = `seat-q-${q.id}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-body-sm font-medium text-text">
        {q.prompt}
        {q.required && <span className="ml-1 text-meta text-danger">required</span>}
      </label>
      {q.type === 'long_text' ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled} />
      ) : q.type === 'number' ? (
        <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      ) : q.type === 'boolean' ? (
        <div className="inline-flex items-center gap-1 rounded-card border border-border bg-surface p-1">
          {(['yes', 'no'] as const).map((opt) => {
            const selected = value === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                aria-pressed={selected}
                disabled={disabled}
                className={`rounded-control-nested px-3 py-1.5 text-body-sm font-semibold capitalize transition-colors ${
                  selected ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      ) : q.type === 'dropdown' ? (
        <Select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          emptyLabel="Choose one"
          options={q.options}
          disabled={disabled}
        />
      ) : q.type === 'multi_select' ? (
        <MultiSelect options={q.options} value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )}
    </div>
  )
}

// Comma-joined, the way the member control stores a multi-select answer.
function MultiSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[]
  value: string
  onChange: (next: string) => void
  disabled: boolean
}) {
  const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
    onChange(next.join(', '))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={on}
            disabled={disabled}
            className={`rounded-pill px-3 py-1 text-body-sm font-medium transition-colors ${
              on ? 'bg-primary-bg text-primary-strong' : 'border border-border text-muted hover:text-text'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
