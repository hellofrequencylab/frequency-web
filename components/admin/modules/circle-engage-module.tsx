'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Trophy, X } from 'lucide-react'
import { labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import {
  getCircleEngageData,
  adoptCircleChallenge,
  dropCircleChallenge,
  type CircleEngageData,
} from '@/app/(main)/circles/admin-actions'
import { ProgressTrack } from '@/components/ui/progress-track'

// In-place "Engage" module (ADMIN-RAIL.md Phase 7, the 'engage' spine cell). Renders in the page
// admin dock on /circles/[slug]; the server returns null unless the caller holds circle.assignTask.
// Manages the shared season challenges the circle takes on together: adopt a global challenge, see
// the circle's collective progress on each, and drop one. Reuses the existing challenge layer + the
// adopt/drop actions (each re-checks the capability server-side).

const fieldLabel = labelClasses

export function CircleEngageModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleEngageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reload() {
    if (!slug) return
    getCircleEngageData(slug)
      .then((d) => setData(d))
      .catch(() => {})
  }

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleEngageData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  function handleAdopt() {
    if (!data || !pick || pending) return
    startTransition(async () => {
      const res = await adoptCircleChallenge(data!.circleId, data!.slug, pick)
      if ('error' in res) {
        setError(res.error)
      } else {
        setError(null)
        setPick('')
        reload()
      }
    })
  }

  function handleDrop(challengeId: string) {
    if (!data || pending) return
    startTransition(async () => {
      const res = await dropCircleChallenge(data!.circleId, data!.slug, challengeId)
      if ('error' in res) {
        setError(res.error)
      } else {
        setError(null)
        reload()
      }
    })
  }

  return (
    <div className="@container space-y-6">
      <section>
        {/* Adopt a shared challenge. */}
        {data.adoptable.length > 0 && (
          <div className="space-y-1.5">
            {/* A <label htmlFor>, not the bare <span> this used to be: the select sits in a
                sibling row, so the heading was not naming it. */}
            <label htmlFor="circle-adopt-challenge" className={fieldLabel}>
              Take on a challenge together
            </label>
            <div className="flex items-center gap-2">
              <Select
                id="circle-adopt-challenge"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                disabled={pending}
                emptyLabel="Pick a challenge…"
                wrapperClassName="min-w-0 flex-1"
              >
                {data.adoptable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                onClick={handleAdopt}
                disabled={pending || !pick}
                className="inline-flex shrink-0 items-center rounded-control bg-primary px-3 py-2 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                Adopt
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-meta font-medium text-danger">{error}</p>}

        {/* Adopted challenges with collective progress. */}
        <div className="mt-5 space-y-2">
          {data.adopted.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-surface-elevated/40 p-4 text-center">
              <Trophy className="mx-auto mb-2 h-5 w-5 text-subtle" />
              <p className="text-body-sm font-medium text-text">No shared challenges yet</p>
              <p className="mt-1 text-meta text-muted">
                Adopt one above to give the circle a goal to chase together.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.adopted.map((c) => {
                const pct =
                  c.memberCount > 0 ? Math.min(100, Math.round((c.membersCompleted / c.memberCount) * 100)) : 0
                return (
                  <li key={c.id} className="rounded-card border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-body-sm font-semibold text-text">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDrop(c.id)}
                        disabled={pending}
                        aria-label={`Drop ${c.name}`}
                        className="shrink-0 rounded-control p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-meta text-muted">
                      <span>
                        {c.membersCompleted} of {c.memberCount} done
                        {c.membersInProgress > 0 && (
                          <span className="text-subtle"> · {c.membersInProgress} in progress</span>
                        )}
                      </span>
                    </div>
                    <ProgressTrack value={pct} label="Challenge completion" size="lg" animate className="mt-1.5" />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
