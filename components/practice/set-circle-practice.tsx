'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCirclePracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

// Host control: pick the circle's current practice from the library.
export function SetCirclePractice({
  circleId,
  library,
  current,
}: {
  circleId: string
  library: { id: string; title: string }[]
  current?: string
}) {
  const [val, setVal] = useState(current ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-subtle">Set practice:</span>
      <select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="">Choose a practice…</option>
        {library.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <button
        disabled={pending || !val || val === current}
        onClick={() =>
          start(async () => {
            const res = await setCirclePracticeAction(circleId, val)
            if (isError(res)) setErr(res.error)
            else {
              setErr(null)
              router.refresh()
            }
          })
        }
        className="rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-60 transition-colors"
      >
        {pending ? 'Setting…' : 'Set'}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  )
}
