'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UsersRound, Plus, Route, ArrowRight } from 'lucide-react'
import {
  createSpaceCircleAction,
  startSpaceCircleRunAction,
  endSpaceCircleRunAction,
  transferSpaceCircleAction,
  listTransferTargetsAction,
  offerSpaceCircleAction,
  cancelSpaceCircleOfferAction,
  attachCircleToSpaceAction,
  listAttachableCirclesAction,
} from '@/app/(main)/spaces/[slug]/manage/circles/actions'
import { isError } from '@/lib/action-result'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/field'

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
  /** An unanswered handoff. One pending offer per circle is enforced by a unique partial index
   *  (migration 20261230000000), so while this is set the circle cannot be offered to anyone
   *  else — and until now the only person who could clear it was the recipient. */
  pendingOffer?: { id: string; toProfileId: string } | null
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
  viewerProfileId,
  circles,
  journeys,
}: {
  spaceSlug: string
  /** The signed-in steward, so "move it to me" can name a destination. */
  viewerProfileId: string
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
  /** Which circle's move control is open, plus the destinations it can offer (loaded on open). */
  const [moveFor, setMoveFor] = useState<string | null>(null)
  const [targets, setTargets] = useState<{ id: string; name: string; slug: string }[]>([])
  const [pickedTarget, setPickedTarget] = useState<string>('')
  /** Handing off to another person: the handle typed, and the matches found. */
  const [handoffQuery, setHandoffQuery] = useState('')
  const [handoffHits, setHandoffHits] = useState<{ id: string; handle: string; display_name: string }[]>([])
  /** Attaching one of the steward's own circles (ADR-857): panel open, choices, choice. */
  const [attaching, setAttaching] = useState(false)
  const [attachable, setAttachable] = useState<{ id: string; name: string; slug: string }[] | null>(null)
  const [pickedCircle, setPickedCircle] = useState<string>('')

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

  /** Open the attach panel and lazy-load the circles the caller could bring in (ADR-857). */
  function openAttach() {
    setAttaching(true)
    setError(null)
    if (attachable !== null) return
    start(async () => {
      const res = await listAttachableCirclesAction(spaceSlug)
      setAttachable(isError(res) ? [] : res.data)
    })
  }

  function attach() {
    if (!pickedCircle) return
    setError(null)
    start(async () => {
      const res = await attachCircleToSpaceAction(spaceSlug, pickedCircle)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setAttaching(false)
      setPickedCircle('')
      setAttachable(null)
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

  function endRun(runId: string, state: 'completed' | 'cancelled', circleName: string) {
    const verb = state === 'completed' ? 'Finish' : 'Cancel'
    if (!window.confirm(`${verb} the Run for ${circleName}? Members keep the progress they earned.`)) {
      return
    }
    setError(null)
    start(async () => {
      const res = await endSpaceCircleRunAction(spaceSlug, { runId, state })
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function openMove(circleId: string) {
    setMoveFor(moveFor === circleId ? null : circleId)
    setPickedTarget('')
    setError(null)
    if (moveFor === circleId) return
    // Destinations are resolved server-side against the caller's own spaces, so the picker can
    // only offer moves the gate will accept.
    start(async () => {
      const res = await listTransferTargetsAction(spaceSlug)
      setTargets(isError(res) ? [] : res.data)
    })
  }

  /** Take back an unanswered handoff. Without this the circle was stuck: the unique partial index
   *  refuses a second pending offer, and the error text told the operator to "cancel that first"
   *  with nothing to cancel it with. */
  function cancelOffer(offerId: string, circleName: string) {
    if (!window.confirm(`Take back the handoff for ${circleName}? They will no longer be able to accept it.`)) return
    setError(null)
    start(async () => {
      const res = await cancelSpaceCircleOfferAction(spaceSlug, offerId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function searchPeople(q: string) {
    setHandoffQuery(q)
    if (!q.trim()) {
      setHandoffHits([])
      return
    }
    fetch(`/api/search-handles?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((j) => setHandoffHits(j.profiles ?? []))
      .catch(() => setHandoffHits([]))
  }

  function handOff(circleId: string, circleName: string, toProfileId: string, toName: string) {
    if (!window.confirm(`Offer ${circleName} to ${toName}? It stays yours until they accept.`)) return
    setError(null)
    start(async () => {
      const res = await offerSpaceCircleAction(spaceSlug, { circleId, toProfileId })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setMoveFor(null)
      setHandoffQuery('')
      setHandoffHits([])
      router.refresh()
    })
  }

  function move(circleId: string, circleName: string) {
    if (!pickedTarget) {
      setError('Pick where it should go.')
      return
    }
    const target =
      pickedTarget === 'me'
        ? ({ kind: 'person', profileId: viewerProfileId } as const)
        : ({ kind: 'space', spaceId: pickedTarget } as const)
    const where = pickedTarget === 'me' ? 'you' : targets.find((t) => t.id === pickedTarget)?.name
    if (!window.confirm(`Move ${circleName} to ${where}? Its members and any Run go with it.`)) return

    setError(null)
    start(async () => {
      const res = await transferSpaceCircleAction(spaceSlug, { circleId, target })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setMoveFor(null)
      setPickedTarget('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Make a circle under this Space. It starts as a draft, like every other new circle. */}
      <div className="rounded-card border border-border bg-surface-elevated/40 p-3">
        {adding ? (
          <div className="space-y-2">
            <label htmlFor="new-circle-name" className="block text-meta font-semibold text-text">
              Name this circle
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="new-circle-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tuesday morning group"
                disabled={pending}
                className="min-w-0 flex-1 py-1.5"
              />
              <button
                type="button"
                onClick={create}
                disabled={pending || !newName.trim()}
                className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
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
                className="rounded-control px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
            <p className="text-2xs text-muted">
              It starts as a draft, so you can shape it before anyone sees it.
            </p>
          </div>
        ) : attaching ? (
          <div className="space-y-2">
            <label htmlFor="attach-circle-pick" className="block text-meta font-semibold text-text">
              Attach one of your circles
            </label>
            {attachable === null ? (
              <p className="text-2xs text-muted">Finding your circles…</p>
            ) : attachable.length === 0 ? (
              <p className="text-2xs text-muted">
                Every circle you host already lives here. Start one below, or ask its host to move it.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  id="attach-circle-pick"
                  value={pickedCircle}
                  onChange={(e) => setPickedCircle(e.target.value)}
                  disabled={pending}
                  emptyLabel="Pick a circle…"
                  wrapperClassName="min-w-0 flex-1"
                >
                  {attachable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={attach}
                  disabled={pending || !pickedCircle}
                  className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                >
                  Attach
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs text-muted">
                The circle keeps its host and members. Its events join this space&apos;s calendar.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAttaching(false)
                  setPickedCircle('')
                  setError(null)
                }}
                disabled={pending}
                className="rounded-control px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-text"
            >
              <Plus className="h-4 w-4" /> New circle
            </button>
            <button
              type="button"
              onClick={openAttach}
              className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-text"
            >
              <ArrowRight className="h-4 w-4" /> Attach a circle you host
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-meta text-danger">{error}</p>}

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
            <li key={c.id} className="rounded-card border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/circles/${c.slug}`}
                    className="text-body-sm font-semibold text-text hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-2xs text-muted">
                    {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                    {c.status !== 'active' && ` · ${c.status}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {c.pendingOffer ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-signal-bg px-2 py-0.5 text-2xs font-semibold text-signal-strong">
                        Handoff waiting
                      </span>
                      <button
                        type="button"
                        onClick={() => cancelOffer(c.pendingOffer!.id, c.name)}
                        disabled={pending}
                        className="rounded-control border border-border px-2 py-1 text-2xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
                      >
                        Take it back
                      </button>
                    </>
                  ) : null}
                  {c.run ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
                        <Route className="h-3 w-3" />
                        Running {c.run.journeyTitle}
                      </span>
                      <button
                        type="button"
                        onClick={() => endRun(c.run!.id, 'completed', c.name)}
                        disabled={pending}
                        className="rounded-control border border-border px-2 py-1 text-2xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
                      >
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => endRun(c.run!.id, 'cancelled', c.name)}
                        disabled={pending}
                        className="rounded-control px-2 py-1 text-2xs font-medium text-muted transition-colors hover:text-danger disabled:opacity-40"
                      >
                        Cancel Run
                      </button>
                    </>
                  ) : journeys.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRunFor(runFor === c.id ? null : c.id)
                        setPickedPlan('')
                        setError(null)
                      }}
                      disabled={pending}
                      className="rounded-control border border-border px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
                    >
                      Start a Run
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => openMove(c.id)}
                    disabled={pending}
                    aria-label={`Move ${c.name}`}
                    className="rounded-control px-2 py-1 text-2xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                  >
                    Move
                  </button>
                </div>
              </div>

              {/* Move it: to another space this steward runs, or to them as their own circle. */}
              {moveFor === c.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <label htmlFor={`move-${c.id}`} className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                    Where it should live
                  </label>
                  <Select
                    id={`move-${c.id}`}
                    value={pickedTarget}
                    onChange={(e) => setPickedTarget(e.target.value)}
                    disabled={pending}
                    emptyLabel="Pick a destination"
                  >
                    <option value="me">Me, as my own circle</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => move(c.id, c.name)}
                      disabled={pending || !pickedTarget}
                      className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                    >
                      Move it
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveFor(null)}
                      disabled={pending}
                      className="rounded-control px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-2xs text-muted">
                    Members and any Run travel with it. You can move a circle into a space you help
                    run, or take it as your own.
                  </p>

                  {/* Handing it to someone ELSE is an offer, not a move: it stays yours until they
                      accept, because a circle carries members (ADR-845). */}
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <label htmlFor={`handoff-${c.id}`} className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                      Or hand it to someone
                    </label>
                    <Input
                      id={`handoff-${c.id}`}
                      type="text"
                      value={handoffQuery}
                      onChange={(e) => searchPeople(e.target.value)}
                      placeholder="Search by name or @handle"
                      disabled={pending}
                      className="py-1.5"
                    />
                    {handoffHits.length > 0 && (
                      <div className="overflow-hidden rounded-card border border-border bg-surface">
                        {handoffHits.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handOff(c.id, c.name, p.id, p.display_name)}
                            disabled={pending}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
                          >
                            <span className="min-w-0 truncate text-meta font-semibold text-text">
                              {p.display_name}
                            </span>
                            <span className="shrink-0 text-2xs text-muted">@{p.handle}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-2xs text-muted">
                      They get an offer on the circle. It stays yours until they accept.
                    </p>
                  </div>
                </div>
              )}

              {/* The picker: only the Journeys this Space offers. The server re-checks it. */}
              {runFor === c.id && !c.run && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <label htmlFor={`plan-${c.id}`} className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                    Which Journey
                  </label>
                  <Select
                    id={`plan-${c.id}`}
                    value={pickedPlan}
                    onChange={(e) => setPickedPlan(e.target.value)}
                    disabled={pending}
                    emptyLabel="Pick a Journey"
                  >
                    {journeys.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.emoji ? `${j.emoji} ` : ''}
                        {j.title}
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startRun(c.id)}
                      disabled={pending || !pickedPlan}
                      className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                    >
                      Start the Run
                    </button>
                    <Link
                      href={`/spaces/${spaceSlug}/journeys`}
                      className="inline-flex items-center gap-1 text-2xs text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      Manage Journeys <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <p className="text-2xs text-muted">
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
