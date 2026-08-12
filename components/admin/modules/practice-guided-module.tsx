'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE GUIDED SECTION (docs/EDITING-SYSTEM.md §2, ADR-450 · ADR-994).
//
// ADR-450 gave an entity page in Edit Mode two planes — the inline canvas and the Inspector rail —
// and made the rail's FIRST section "Guided": the Vera flow, run over the live page rather than in
// a separate studio. This is that section for a Practice, and it is the half of the model that was
// never built: creation had a guided Spark, editing had none, so the wizard was a one-way door.
//
// It mounts the same steer panel the Spark uses (components/studio/spark/spark-steer.tsx), so the
// dials an author learned at creation are the dials they come back to. Nothing is re-styled here
// and no second wizard exists.
//
// TWO RULES THIS SURFACE KEEPS:
//   • LOCK is real. The pins render only because there is a redraw to protect against, and the
//     server enforces them by DELETING the pinned paths from the patch (redrawPracticeAction).
//   • THE DIFF IS SHOWN. After a redraw the author sees exactly which fields moved, old value
//     beside new, and can put it back in one tap. Hunting for the change is not a review.
//
// Self-gating: it reads getPracticeAdminData, which returns null unless the viewer holds
// practice.editSettings, so a non-owner gets no chrome. Every action re-checks server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Undo2, Wand2 } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { SparkSteer } from '@/components/studio/spark/spark-steer'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { lockLabel } from '@/lib/studio/kernel/redraw'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import { getPracticeAdminData } from '@/app/(main)/practices/admin-actions'
import {
  redrawPracticeAction,
  updatePracticeAction,
  type PracticeRedrawResult,
} from '@/app/(main)/practices/actions'

export function PracticeGuidedModule() {
  const pathname = usePathname()
  const router = useRouter()
  const id = pathname.match(/^\/practices\/([^/]+)/)?.[1] ?? null

  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)

  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')
  const [locked, setLocked] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PracticeRedrawResult | null>(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    getPracticeAdminData(id)
      .then((d) => {
        if (!active) return
        setAllowed(!!d)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const steer = PRACTICE_MANIFEST.steer
  if (!id || !steer) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!allowed) return null

  const mod = moduleById('practice.guided')
  const Icon = mod?.Icon ?? Wand2

  async function redraw() {
    if (!id) return
    setBusy(true)
    setError(null)
    setResult(null)
    setRestored(false)
    try {
      const res = await redrawPracticeAction(id, { mood, directions, locked })
      if ('error' in res) setError(res.error)
      else {
        setResult(res.data)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function putItBack() {
    if (!id || !result) return
    setBusy(true)
    setError(null)
    try {
      const res = await updatePracticeAction(id, result.before)
      if ('error' in res) setError(res.error)
      else {
        setResult(null)
        setRestored(true)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="@container space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-body-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-subtle" />
          {mod?.label ?? 'Guided'}
        </h3>
        <p className="text-meta text-muted">
          Draft this practice again with Vera. Pin anything you want kept and it survives untouched.
        </p>
      </header>

      <SparkSteer
        steer={steer}
        mood={mood}
        onMood={setMood}
        directions={directions}
        onDirections={setDirections}
        locked={locked}
        onLocked={setLocked}
        lockLabel={(key) => lockLabel(PRACTICE_MANIFEST, key)}
        onRedraw={redraw}
        redrawLabel="Draft it again"
        busy={busy}
      />

      {error && (
        <p className="rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-meta font-medium text-danger">
          {error}
        </p>
      )}

      {restored && !result && (
        <p className="rounded-control border border-border bg-surface px-3 py-2 text-meta text-muted">
          Put back. Your earlier wording is live again.
        </p>
      )}

      {result && <RedrawDiff result={result} busy={busy} onUndo={putItBack} />}
    </div>
  )
}

/** What moved, old beside new. The strongest thing an editing surface can do after an AI rewrite
 *  is show the change rather than leave the author to find it. */
function RedrawDiff({
  result,
  busy,
  onUndo,
}: {
  result: PracticeRedrawResult
  busy: boolean
  onUndo: () => void
}) {
  const n = result.changes.length

  return (
    <section className="rounded-control border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-meta font-bold text-text">
          {n === 1 ? '1 field changed' : `${n} fields changed`}
        </h4>
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-meta font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Put it back
        </button>
      </div>

      {result.kept.length > 0 && (
        <p className="mt-1.5 text-meta text-muted">
          Kept as is: {result.kept.join(', ')}.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {result.changes.map((change) => (
          <li key={change.path}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{change.label}</p>
            <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-meta text-subtle line-through">
              {change.before || 'Not set'}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-success/40 pl-2 text-body-sm text-text">
              {change.after || 'Not set'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
