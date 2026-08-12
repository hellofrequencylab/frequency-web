'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE GUIDED SECTION (docs/EDITING-SYSTEM.md §2, ADR-450 · ADR-994 · ADR-996).
//
// ADR-450 gave an entity page in Edit Mode two planes, and made the Inspector rail's FIRST
// section "Guided": the Vera flow, run over the live page rather than in a separate studio.
// ADR-994 built that for the Practice alone, deliberately, so a second entity could prove the
// shape before it was copied. This is the shape, proven: ONE surface, four entities.
//
// It mounts the same steer panel the Spark uses (components/studio/spark/spark-steer.tsx), so
// the dials an author learned at creation are the dials they come back to. Nothing is re-styled
// per entity and no second wizard exists anywhere.
//
// THREE RULES THIS SURFACE KEEPS:
//   • LOCK IS REAL. The pins render straight off the entity's manifest (`steer.lock`), and the
//     server enforces them by DELETING the pinned paths from the patch before anything is
//     compared or written. An entity that declares no lock renders no pins, which is honest
//     rather than decorative.
//   • THE DIFF IS SHOWN. After a redraw the author sees exactly which fields moved, old value
//     beside new, and can put it back in one tap. Hunting for the change is not a review.
//   • THE DIALS SURVIVE. The mood, the directions, and the pins are read back from the last
//     redraw (loadStudioSteerAction, ADR-996), so a second pass opens where the first left off
//     instead of asking the author to re-pick everything.
//
// Self-gating: `resolve` is the entity's own read-gated getter, which returns null for anyone
// who cannot edit, so a non-owner gets no chrome. Every action re-checks server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Undo2, Wand2 } from 'lucide-react'
import type { ActionResult } from '@/lib/action-result'
import { moduleById } from '@/lib/admin/modules/registry'
import { SparkSteer } from '@/components/studio/spark/spark-steer'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'
import { lockLabel, type FieldChange } from '@/lib/studio/kernel/redraw'
import { DEFAULT_SEED_MOOD, type SeedMood } from '@/lib/studio/kernel/moods'
import { loadStudioSteerAction } from '@/lib/studio/steer-actions'
import { RailModuleLoading } from './rail-module-loading'

/** What every entity's redraw hands back: what moved, what the pins held, and the values to
 *  restore. `before` is opaque here on purpose: only the entity's own restore action reads it. */
export interface GuidedRedraw<Before> {
  changes: FieldChange[]
  kept: string[]
  before: Before
}

export interface GuidedModuleProps<Before> {
  /** The catalog row this section renders as (its label and icon come from there). */
  moduleId: string
  /** The entity's manifest. Supplies the steer dials and the pin labels. */
  manifest: EntityManifest
  /** One line under the heading, in the entity's own words. */
  blurb: string
  /** Pull the route key (a slug or an id) out of the pathname. */
  routeKey: (pathname: string) => string | null
  /** The entity's read-gated getter: the entity id when the viewer may edit it, else null. */
  resolve: (routeKey: string) => Promise<string | null>
  redraw: (
    entityId: string,
    input: { mood: string; directions: string; locked: string[] },
  ) => Promise<ActionResult<GuidedRedraw<Before>>>
  restore: (entityId: string, before: Before) => Promise<ActionResult>
  /** The button. Defaults to the Spark's own wording. */
  redrawLabel?: string
}

export function GuidedModule<Before>({
  moduleId,
  manifest,
  blurb,
  routeKey,
  resolve,
  redraw,
  restore,
  redrawLabel = 'Draft it again',
}: GuidedModuleProps<Before>) {
  const pathname = usePathname()
  const router = useRouter()
  const key = routeKey(pathname)

  const [entityId, setEntityId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [mood, setMood] = useState<SeedMood>(DEFAULT_SEED_MOOD)
  const [directions, setDirections] = useState('')
  const [locked, setLocked] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GuidedRedraw<Before> | null>(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!key) return
    let active = true
    resolve(key)
      .then(async (id) => {
        if (!active) return
        setEntityId(id)
        if (id) {
          // The dials as this author last left them (ADR-996). Absent (or the table not applied
          // yet) simply means the defaults, which is exactly the pre-persistence behaviour.
          const saved = await loadStudioSteerAction(manifest.entity, id)
          if (active && saved) {
            setMood(saved.mood)
            setDirections(saved.directions)
            setLocked(saved.locked)
          }
        }
        if (active) setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [key, manifest.entity, resolve])

  const steer = manifest.steer
  if (!key || !steer) return null
  if (loading) return <RailModuleLoading />
  if (!entityId) return null

  const mod = moduleById(moduleId)
  const Icon = mod?.Icon ?? Wand2

  async function runRedraw() {
    if (!entityId) return
    setBusy(true)
    setError(null)
    setResult(null)
    setRestored(false)
    try {
      const res = await redraw(entityId, { mood, directions, locked })
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
    if (!entityId || !result) return
    setBusy(true)
    setError(null)
    try {
      const res = await restore(entityId, result.before)
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
        <p className="text-meta text-muted">{blurb}</p>
      </header>

      <SparkSteer
        steer={steer}
        mood={mood}
        onMood={setMood}
        directions={directions}
        onDirections={setDirections}
        locked={locked}
        onLocked={setLocked}
        lockLabel={(k) => lockLabel(manifest, k)}
        onRedraw={runRedraw}
        redrawLabel={redrawLabel}
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
function RedrawDiff<Before>({
  result,
  busy,
  onUndo,
}: {
  result: GuidedRedraw<Before>
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
          className="ml-auto inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1 text-meta font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Put it back
        </button>
      </div>

      {result.kept.length > 0 && (
        <p className="mt-1.5 text-meta text-muted">Kept as is: {result.kept.join(', ')}.</p>
      )}

      <ul className="mt-3 space-y-3">
        {result.changes.map((change) => (
          <li key={change.path}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">{change.label}</p>
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
