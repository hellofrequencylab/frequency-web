'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adoptCircleChallenge, dropCircleChallenge } from '@/app/(main)/circles/admin-actions'
import type { CircleChallenge } from '@/lib/circles/challenges'

// The CircleQuest "Challenges" block: the global season challenges this circle has
// taken on TOGETHER, each with the circle's collective progress ("N of M done"),
// plus a host control to adopt another or drop one. Collaborative, never a ranking.

interface Adoptable {
  id: string
  name: string
  category: string | null
  difficulty: string | null
  target: number
}

export function CircleChallenges({
  circleId,
  slug,
  adopted,
  adoptable,
}: {
  circleId: string
  slug: string
  adopted: CircleChallenge[]
  adoptable: Adoptable[]
}) {
  const [pick, setPick] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    start(async () => {
      const res = await fn()
      if ('error' in res) {
        setErr(res.error)
      } else {
        setErr(null)
        setPick('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <h4 className="text-2xs font-semibold uppercase tracking-wide text-subtle">Challenges</h4>

      {adopted.length === 0 ? (
        <p className="text-sm text-subtle">No challenges adopted yet</p>
      ) : (
        <ul className="space-y-2">
          {adopted.map((c) => {
            const done = c.membersCompleted
            const total = c.memberCount
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <li key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{c.name}</p>
                    <p className="text-2xs text-subtle">
                      {done} of {total} {total === 1 ? 'member' : 'members'} completed
                      {c.membersInProgress > 0 ? ` · ${c.membersInProgress} in progress` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => run(() => dropCircleChallenge(circleId, slug, c.id))}
                    disabled={pending}
                    className="shrink-0 text-2xs text-subtle hover:text-danger disabled:opacity-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {/* Collective progress bar — shared goal, not a competition. */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adoptable.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
          >
            <option value="">Adopt a challenge…</option>
            {adoptable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => run(() => adoptCircleChallenge(circleId, slug, pick))}
            disabled={pending || !pick}
            className="rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {pending ? 'Adopting…' : 'Adopt'}
          </button>
        </div>
      )}

      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}
