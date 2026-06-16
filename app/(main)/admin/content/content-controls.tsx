'use client'

// Shared row controls for the content suite tables: optimistic switches, the
// feature star, and approve/reject buttons. Each control calls its gated server
// action and refreshes the route; errors surface inline and revert the
// optimistic state.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Check, X, Trash2 } from 'lucide-react'
import { isError, type ActionResult } from '@/lib/action-result'
import { DangerModal } from '@/components/admin/danger-modal'
import {
  setJourneyStatusAction,
  setJourneyOfficialAction,
  setJourneyFeaturedAction,
  deleteJourneyPlanAction,
  setPracticeFlagsAction,
  setPracticeStatusAction,
  setPracticeFeaturedAction,
} from './actions'

// --- Primitives ---------------------------------------------------------------

/** Optimistic on/off switch around an ActionResult-returning call. */
function ToggleSwitch({
  on,
  act,
  titleOn,
  titleOff,
}: {
  on: boolean
  act: (next: boolean) => Promise<ActionResult>
  titleOn: string
  titleOff: string
}) {
  const [optimistic, setOptimistic] = useState(on)
  const [pending, start] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !optimistic
    setOptimistic(next)
    start(async () => {
      const r = await act(next)
      if (isError(r)) setOptimistic(!next)
      else router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={optimistic ? titleOn : titleOff}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
        optimistic ? 'bg-success' : 'bg-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/** Feature star — filled when featured. */
function FeatureStar({
  featured,
  act,
}: {
  featured: boolean
  act: (next: boolean) => Promise<ActionResult>
}) {
  const [optimistic, setOptimistic] = useState(featured)
  const [pending, start] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !optimistic
    setOptimistic(next)
    start(async () => {
      const r = await act(next)
      if (isError(r)) setOptimistic(!next)
      else router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={optimistic ? 'Featured. Click to unfeature' : 'Not featured. Click to feature'}
      aria-pressed={optimistic}
      className={`rounded-md p-1 transition-colors disabled:opacity-50 ${
        optimistic ? 'text-signal hover:bg-surface-elevated' : 'text-subtle hover:bg-surface-elevated hover:text-text'
      }`}
    >
      <Star className={`h-4 w-4 ${optimistic ? 'fill-current' : ''}`} />
    </button>
  )
}

/** Approve / reject pair for a review queue row. */
function ReviewButtons({
  act,
}: {
  act: (status: 'approved' | 'rejected') => Promise<ActionResult>
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function run(status: 'approved' | 'rejected') {
    setError(null)
    start(async () => {
      const r = await act(status)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => run('approved')}
        disabled={pending}
        title="Approve"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        type="button"
        onClick={() => run('rejected')}
        disabled={pending}
        title="Reject"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Reject
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}

// --- Journey controls -----------------------------------------------------------

export function JourneyReviewButtons({ id }: { id: string }) {
  return <ReviewButtons act={(status) => setJourneyStatusAction(id, status)} />
}

/** One-click reinstate for a rejected Journey. */
export function JourneyRestoreButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          const r = await setJourneyStatusAction(id, 'approved')
          if (!isError(r)) router.refresh()
        })
      }
      disabled={pending}
      title="Restore to approved"
      className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
    >
      Restore
    </button>
  )
}

export function JourneyFeatureToggle({ id, featured }: { id: string; featured: boolean }) {
  return <FeatureStar featured={featured} act={(next) => setJourneyFeaturedAction(id, next)} />
}

/** Delete a Journey from the library — type-to-confirm (irreversible; deleteJourneyPlanAction
 *  is curator-gated server-side). */
export function JourneyDeleteButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function remove() {
    start(async () => {
      const r = await deleteJourneyPlanAction(id)
      if (!isError(r)) router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        title={`Delete ${title}`}
        aria-label={`Delete ${title}`}
        className="rounded-md p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete journey"
        body={
          <>
            This removes <span className="font-semibold text-text">{title}</span> from the library for
            everyone, along with its steps and adoptions. This cannot be undone.
          </>
        }
        confirmLabel="Delete journey"
        requireTyping={title}
        onConfirm={remove}
      />
    </>
  )
}

/** Official switch + the Quest it files under. Toggling official on attaches the
 *  selected Quest; changing the Quest re-saves; toggling off detaches it. */
export function JourneyOfficialControl({
  id,
  official,
  questId,
  quests,
}: {
  id: string
  official: boolean
  questId: string | null
  quests: { id: string; name: string }[]
}) {
  const [optimisticOfficial, setOptimisticOfficial] = useState(official)
  const [selectedQuest, setSelectedQuest] = useState(questId ?? quests[0]?.id ?? '')
  const [pending, start] = useTransition()
  const router = useRouter()

  function save(nextOfficial: boolean, nextQuest: string) {
    start(async () => {
      const r = await setJourneyOfficialAction(id, nextOfficial, nextOfficial ? nextQuest || null : null)
      if (isError(r)) setOptimisticOfficial(!nextOfficial)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          const next = !optimisticOfficial
          setOptimisticOfficial(next)
          save(next, selectedQuest)
        }}
        disabled={pending}
        title={optimisticOfficial ? 'Official. Click to remove' : 'Not official. Click to mark official'}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
          optimisticOfficial ? 'bg-success' : 'bg-border-strong'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            optimisticOfficial ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {optimisticOfficial && quests.length > 0 && (
        <select
          value={selectedQuest}
          onChange={(e) => {
            setSelectedQuest(e.target.value)
            save(true, e.target.value)
          }}
          disabled={pending}
          title="The Quest this Journey files under"
          className="max-w-32 rounded-md border border-border bg-canvas px-1.5 py-1 text-xs text-text disabled:opacity-50"
        >
          {quests.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      )}
    </span>
  )
}

// --- Practice controls -----------------------------------------------------------

export function PracticeReviewButtons({ id }: { id: string }) {
  return <ReviewButtons act={(status) => setPracticeStatusAction(id, status)} />
}

export function PracticeFeatureToggle({ id, featured }: { id: string; featured: boolean }) {
  return <FeatureStar featured={featured} act={(next) => setPracticeFeaturedAction(id, next)} />
}

export function PracticePublicToggle({ id, isPublic }: { id: string; isPublic: boolean }) {
  return (
    <ToggleSwitch
      on={isPublic}
      act={(next) => setPracticeFlagsAction(id, { is_public: next })}
      titleOn="In the public library. Click to hide"
      titleOff="Hidden. Click to publish to the library"
    />
  )
}

export function PracticeTemplateToggle({ id, isTemplate }: { id: string; isTemplate: boolean }) {
  return (
    <ToggleSwitch
      on={isTemplate}
      act={(next) => setPracticeFlagsAction(id, { is_template: next })}
      titleOn="Starter template. Click to remove"
      titleOff="Not a template. Click to make it a starter template"
    />
  )
}
