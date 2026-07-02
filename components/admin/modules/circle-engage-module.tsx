'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Trophy, X } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import {
  getCircleEngageData,
  adoptCircleChallenge,
  dropCircleChallenge,
  type CircleEngageData,
} from '@/app/(main)/circles/admin-actions'

// In-place "Engage" module (ADMIN-RAIL.md Phase 7, the 'engage' spine cell). Renders in the page
// admin dock on /circles/[slug]; the server returns null unless the caller holds circle.assignTask.
// Manages the shared season challenges the circle takes on together: adopt a global challenge, see
// the circle's collective progress on each, and drop one. Reuses the existing challenge layer + the
// adopt/drop actions (each re-checks the capability server-side).

const input = fieldClasses
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
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('circle.engage')
  const Icon = mod?.Icon ?? Trophy

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
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Engage'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        {/* Adopt a shared challenge. */}
        {data.adoptable.length > 0 && (
          <div className="space-y-1.5">
            <span className={fieldLabel}>Take on a challenge together</span>
            <div className="flex items-center gap-2">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                disabled={pending}
                className={`${input} min-w-0 flex-1 px-2`}
              >
                <option value="">Pick a challenge…</option>
                {data.adoptable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAdopt}
                disabled={pending || !pick}
                className="inline-flex shrink-0 items-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                Adopt
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

        {/* Adopted challenges with collective progress. */}
        <div className="mt-5 space-y-2">
          {data.adopted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-elevated/40 p-4 text-center">
              <Trophy className="mx-auto mb-2 h-5 w-5 text-subtle" />
              <p className="text-sm font-medium text-text">No shared challenges yet</p>
              <p className="mt-1 text-xs text-muted">
                Adopt one above to give the circle a goal to chase together.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.adopted.map((c) => {
                const pct =
                  c.memberCount > 0 ? Math.min(100, Math.round((c.membersCompleted / c.memberCount) * 100)) : 0
                return (
                  <li key={c.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-text">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDrop(c.id)}
                        disabled={pending}
                        aria-label={`Drop ${c.name}`}
                        className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>
                        {c.membersCompleted} of {c.memberCount} done
                        {c.membersInProgress > 0 && (
                          <span className="text-subtle"> · {c.membersInProgress} in progress</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
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
