'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UsersRound, Plus, Route, ArrowRight } from 'lucide-react'
import {
  createSpaceCircleAction,
  startSpaceCircleRunAction,
} from '@/app/(main)/spaces/[slug]/circles/actions'
import { isError } from '@/lib/action-result'
import { EmptyState } from '@/components/ui/empty-state'

// The Space's Circles, each with the Journey it is running (ADR-842). Two jobs: make a new Circle
// under this Space, and start a Run of one of the Space's Journeys for a Circle that is not
// already running one.
//
// The server owns every rule (lib/journeys/run-gate + the actions): this component only expresses
// intent and renders whatever the server says back. Copy says "Run", never "cohort" (NAMING.md).

export interface SpaceCircleRow {
  id: string
  slug: string
  name: string
  about: string | null
  status: string
  memberCount: number
  run: { id: string; planId: string; journeyTitle: string; journeySlug: string | null; startedAt: string } | null
}

export interface OfferedJourney {
  id: string
  slug: string
  title: string
  summary: string | null
  emoji: string | null
}

export function SpaceCirclesManager({
  spaceSlug,
  circles,
  journeys,
}: {
  spaceSlug: string
  circles: SpaceCircleRow[]
  journeys: OfferedJourney[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  /** Which circle's Journey picker is open, and what it has selected. */
  const [runFor, setRunFor] = useState<string | null>(null)
  const [pickedPlan, setPickedPlan] = useState<string>('')

  function create() {
    setError(null)
    start(async () => {
      const res = await createSpaceCircleAction(spaceSlug, newName)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNewName('')
      setAdding(false)
      router.refresh()
    })
  }

  function startRun(circleId: string) {
    const plan = journeys.find((j) => j.id === pickedPlan)
    if (!plan) {
      setError('Pick a Journey first.')
      return
    }
    setError(null)
    start(async () => {
      const res = await startSpaceCircleRunAction(spaceSlug, {
        circleId,
        planId: plan.id,
        journeyTitle: plan.title,
      })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setRunFor(null)
      setPickedPlan('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Make a circle under this Space. It starts as a draft, like every other new circle. */}
      <div className="rounded-xl border border-border bg-surface-elevated/40 p-3">
        {adding ? (
          <div className="space-y-2">
            <label htmlFor="new-circle-name" className="block text-xs font-semibold text-text">
              Name this circle
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="new-circle-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tuesday morning group"
                disabled={pending}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-subtle outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={create}
                disabled={pending || !newName.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setNewName('')
                  setError(null)
                }}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
            <p className="text-2xs text-subtle">
              It starts as a draft, so you can shape it before anyone sees it.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-text"
          >
            <Plus className="h-4 w-4" /> New circle
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {circles.length === 0 ? (
        journeys.length > 0 && (
          <EmptyState
            icon={UsersRound}
            title="No circles yet"
            description="Make a circle for this space, then start a Run so its members move through one of your Journeys together."
          />
        )
      ) : (
        <ul className="space-y-2">
          {circles.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/circles/${c.slug}`}
                    className="text-sm font-semibold text-text hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-2xs text-subtle">
                    {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                    {c.status !== 'active' && ` · ${c.status}`}
                  </p>
                </div>

                {c.run ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
                    <Route className="h-3 w-3" />
                    Running {c.run.journeyTitle}
                  </span>
                ) : journeys.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRunFor(runFor === c.id ? null : c.id)
                      setPickedPlan('')
                      setError(null)
                    }}
                    disabled={pending}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
                  >
                    Start a Run
                  </button>
                ) : null}
              </div>

              {/* The picker: only the Journeys this Space offers. The server re-checks it. */}
              {runFor === c.id && !c.run && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <label htmlFor={`plan-${c.id}`} className="block text-2xs font-semibold uppercase tracking-wide text-subtle">
                    Which Journey
                  </label>
                  <select
                    id={`plan-${c.id}`}
                    value={pickedPlan}
                    onChange={(e) => setPickedPlan(e.target.value)}
                    disabled={pending}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none disabled:opacity-60"
                  >
                    <option value="">Pick a Journey</option>
                    {journeys.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.emoji ? `${j.emoji} ` : ''}
                        {j.title}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startRun(c.id)}
                      disabled={pending || !pickedPlan}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                    >
                      Start the Run
                    </button>
                    <Link
                      href={`/spaces/${spaceSlug}/journeys`}
                      className="inline-flex items-center gap-1 text-2xs text-subtle underline-offset-2 hover:text-text hover:underline"
                    >
                      Manage Journeys <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <p className="text-2xs text-subtle">
                    Everyone active in this circle is enrolled when the Run starts.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
