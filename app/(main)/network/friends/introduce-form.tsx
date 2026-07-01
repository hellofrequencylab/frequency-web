'use client'

import { useMemo, useState, useTransition } from 'react'
import { HeartHandshake, Check } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createIntroduction } from '@/lib/connections/introductions'

export interface FriendOption {
  id: string
  displayName: string
  handle: string
}

/** "Introduce two friends" affordance — two friend pickers + an optional note, then a
 *  submit that calls createIntroduction. Frames the act warmly and rewards it on the
 *  back end when the two people connect (ADR-186). */
export function IntroduceForm({ friends, rewardGems }: { friends: FriendOption[]; rewardGems: number }) {
  const [personA, setPersonA] = useState('')
  const [personB, setPersonB] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Don't let someone pick the same person twice — filter the second picker.
  const optionsB = useMemo(() => friends.filter((f) => f.id !== personA), [friends, personA])
  const optionsA = useMemo(() => friends.filter((f) => f.id !== personB), [friends, personB])

  const canSubmit = personA && personB && personA !== personB && !isPending

  function submit() {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await createIntroduction(personA, personB, note.trim() || undefined)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setPersonA('')
      setPersonB('')
      setNote('')
      setDone(true)
    })
  }

  if (friends.length < 2) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated px-5 py-4">
        <p className="text-sm font-semibold text-text">Know two people who should meet?</p>
        <p className="mt-1 text-sm text-muted">
          Once you have at least two friends, you can introduce them here and earn Gems when they
          connect.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Know two people who should meet?</p>
          <p className="mt-0.5 text-sm text-muted">
            Introduce them and earn{' '}
            <span className="font-semibold text-text">{rewardGems} Gems</span> when they connect.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
            First friend
          </span>
          <select
            value={personA}
            onChange={(e) => {
              setPersonA(e.target.value)
              setDone(false)
            }}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
          >
            <option value="">Choose someone…</option>
            {optionsA.map((f) => (
              <option key={f.id} value={f.id}>
                {f.displayName} (@{f.handle})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
            Second friend
          </span>
          <select
            value={personB}
            onChange={(e) => {
              setPersonB(e.target.value)
              setDone(false)
            }}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
          >
            <option value="">Choose someone…</option>
            {optionsB.map((f) => (
              <option key={f.id} value={f.id}>
                {f.displayName} (@{f.handle})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">
          Why they’d click <span className="font-normal normal-case text-subtle">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setDone(false)
          }}
          rows={2}
          maxLength={500}
          placeholder="A line on what they have in common. It’ll be shown to them."
          className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
        />
      </label>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="h-4 w-4" />
          Introduction sent. You’ll earn Gems when they connect.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <HeartHandshake className="h-4 w-4" />
          {isPending ? 'Introducing…' : 'Introduce them'}
        </button>
      </div>
    </div>
  )
}
