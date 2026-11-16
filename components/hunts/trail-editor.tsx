'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE TRAIL EDITOR, steps 2 to 5 (FH-013, docs/hunts/CREATOR-FLOW.md): add stops, choose the shape,
// preview as a player, publish. Composed from the Studio Spark kit (`SparkShell`, `StudioField`,
// `FieldControl`, `StudioNote`) and the ui kit; the stop fields come from the HUNT manifest's
// `stops` repeat, so no field is declared here.
//
// Saves are revision-checked (lib/hunts/draft.ts `saveDraft`): every autosave carries the revision
// this tab last saw, and a tab that is behind gets a conflict, stops writing and offers a reload.
// Preview runs the real evaluator in memory (`previewTrail`); the only thing it records is that the
// route test ran on this revision, once every stop was found in order. The permission confirm
// rides on the publish tap, so confirming it cannot clear the route test.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Lock, Map, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldControl, SparkShell, StudioField, StudioNote } from '@/components/studio/spark'
import { HUNT_MANIFEST, HUNT_OPTIONS } from '@/lib/studio/entities/hunt'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import {
  MAX_CHOICES,
  MAX_MYSTERIES,
  MAX_REGIONS,
  MAX_STOPS,
  MIN_STOPS,
  emptyStop,
  passportCount,
  previewTrail,
  publishChecklist,
  reorderStops,
  stopKey,
  type DraftChoice,
  type DraftMystery,
  type DraftRegion,
  type Stop,
  type StopVenue,
  type TrailDraft,
} from '@/lib/hunts/draft'
import type { TrailEditorState } from '@/lib/hunts/store'
import { publishTrailAction, routeTestedAction, saveTrailAction } from '@/app/(main)/hunts/actions'
import { EDITOR_STEPS, TRAIL_STEPS, stepNumber, type EditorStep } from './trail-steps'

// The stop fields, from the manifest's repeat. The kernel keeps a repeat field's `section` on the
// group, so each def gets it back here before the control renders it.
const STOPS_REPEAT = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'stops')
const STOP_FIELDS: FieldDef[] = (STOPS_REPEAT?.fields ?? []).map((f) => ({ ...f, section: STOPS_REPEAT?.section ?? 'stops' }))
const VISIBILITY_FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'visibility')
// FH-030S: the shape, the Passport's threshold, the partner places and the regions, all from the manifest.
const SHAPE_FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'shape')
const COUNT_FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'finishCount')
const repeatFields = (arrayPath: string): FieldDef[] => {
  const r = HUNT_MANIFEST.repeats?.find((x) => x.arrayPath === arrayPath)
  return (r?.fields ?? []).map((f) => ({ ...f, section: r?.section ?? 'shape' }))
}
const VENUE_FIELDS = repeatFields('venues')
const REGION_FIELDS = repeatFields('regions')
// FH-042S: forks and Mystery stops, from the manifest too.
const CHOICE_FIELDS = repeatFields('choices')
const MYSTERY_FIELDS = repeatFields('mysteries')

const STOP_PLACEHOLDER: Record<string, string> = {
  place: 'e.g. The bench under the big fig tree',
  clue: 'e.g. Where the roots lift the sidewalk, sit and look west.',
  hint: 'e.g. It is across from the bakery.',
}

/** The clue coach asks; it never writes the clue (the same rule as Vera). */
const COACH_QUESTIONS = [
  'What would someone see right before they find it?',
  'What is the one thing a stranger would notice first?',
  'How would you describe the spot to a friend on the phone?',
]

const scalar = (v: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : v)
// A manifest toggle is a boolean on the stop; every other stop field is text.
const STOP_TOGGLES = new Set(STOP_FIELDS.filter((f) => f.kind === 'toggle').map((f) => f.path))
const stopValue = (s: Stop, path: string): string => {
  const value = (s as Record<string, unknown>)[path]
  return STOP_TOGGLES.has(path) ? String(value === true) : (value as string | undefined) ?? ''
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function TrailEditor({ initial }: { initial: TrailEditorState }) {
  const router = useRouter()
  const [draft, setDraft] = useState<TrailDraft>(initial.draft)
  const [revision, setRevision] = useState(initial.revision)
  const [published, setPublished] = useState(initial.published)
  const [visibility, setVisibility] = useState<string>(initial.visibility === 'public' ? 'public' : 'unlisted')
  const [step, setStep] = useState<EditorStep>(initial.published ? 'publish' : 'stops')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [conflict, setConflict] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState(initial.draft.permissionConfirmed)
  const [publishing, setPublishing] = useState(false)
  const [justPublished, setJustPublished] = useState<'unlisted' | 'public' | null>(null)

  // ── Autosave, revision-checked ───────────────────────────────────────────────────────────
  // The latest draft and revision live in refs the effects keep current, so a save that fires from
  // a timer reads what the screen shows now, not what it showed when the timer was set.
  const draftRef = useRef(draft)
  const revisionRef = useRef(revision)
  useEffect(() => {
    draftRef.current = draft
    revisionRef.current = revision
  }, [draft, revision])
  const [dirty, setDirty] = useState(false)
  const [dirtyTick, setDirtyTick] = useState(0)
  const tickRef = useRef(0)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const frozen = useRef(false)

  const runSave = useCallback(async () => {
    if (frozen.current) return
    if (inFlight.current) {
      queued.current = true
      return
    }
    inFlight.current = true
    const tickAtStart = tickRef.current
    setSaveState('saving')
    const res = await saveTrailAction({ huntId: initial.huntId, baseRevision: revisionRef.current, draft: draftRef.current })
    inFlight.current = false
    if ('error' in res) {
      setSaveState('error')
      setError(res.error)
      return
    }
    if ('conflict' in res.data) {
      frozen.current = true
      setConflict(res.data.currentRevision)
      setSaveState('error')
      return
    }
    revisionRef.current = res.data.revision
    setRevision(res.data.revision)
    setSaveState('saved')
    setError(null)
    if (tickRef.current === tickAtStart) setDirty(false)
    if (queued.current) {
      // An edit landed while this save was out: schedule the next one through the same timer.
      queued.current = false
      setDirtyTick((t) => t + 1)
    }
  }, [initial.huntId])

  useEffect(() => {
    if (dirtyTick === 0 || conflict !== null) return
    const t = setTimeout(() => void runSave(), 700)
    return () => clearTimeout(t)
  }, [dirtyTick, conflict, runSave])

  const edit = useCallback((next: (d: TrailDraft) => TrailDraft) => {
    if (frozen.current) return
    // Any edit clears the route test, exactly as the save will (saveDraft), so the screen never
    // shows a test the server is about to forget.
    setDraft((d) => ({ ...next(d), routeTestedAtRevision: null }))
    setPublished(false)
    setDirty(true)
    tickRef.current += 1
    setDirtyTick(tickRef.current)
    setSaveState('idle')
  }, [])

  const settled = !dirty && saveState !== 'saving' && conflict === null

  // ── Stops ────────────────────────────────────────────────────────────────────────────────
  const setStop = (i: number, path: string, value: string) =>
    edit((d) => ({
      ...d,
      stops: d.stops.map((s, j) => (j === i ? { ...s, [path]: STOP_TOGGLES.has(path) ? value === 'true' : value } : s)),
    }))
  const addStop = () => edit((d) => (d.stops.length >= MAX_STOPS ? d : { ...d, stops: [...d.stops, emptyStop()] }))
  const [pasted, setPasted] = useState('')
  const addPasted = () => {
    const lines = pasted.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    edit((d) => {
      const room = MAX_STOPS - d.stops.length
      const added = lines.slice(0, Math.max(0, room)).map((line) => {
        const at = line.indexOf(':')
        const place = at > 0 ? line.slice(0, at).trim() : line
        const clue = at > 0 ? line.slice(at + 1).trim() : ''
        return { ...emptyStop(), place, clue }
      })
      return { ...d, stops: [...d.stops, ...added] }
    })
    setPasted('')
  }
  // Stop keys follow position, so a move or a removal goes through reorderStops: the partner places and
  // regions that name a stop follow it (FH-030S).
  const removeStop = (i: number) => edit((d) => reorderStops(d, d.stops.map((_, j) => j).filter((j) => j !== i)))
  const moveStop = (i: number, dir: -1 | 1) =>
    edit((d) => {
      const j = i + dir
      if (j < 0 || j >= d.stops.length) return d
      const order = d.stops.map((_, k) => k)
      ;[order[i], order[j]] = [order[j], order[i]]
      return reorderStops(d, order)
    })

  // ── Shape, partner places and regions (FH-030S) ──────────────────────────────────────────
  const passport = draft.shape === 'passport'
  const loaded = useMemo(
    () => ({
      [HUNT_OPTIONS.stops]: draft.stops.map((s, i) => ({ value: stopKey(i), label: `Stop ${i + 1}${s.place.trim() ? `: ${s.place.trim()}` : ''}` })),
      [HUNT_OPTIONS.venues]: initial.venueOptions,
    }),
    [draft.stops, initial.venueOptions],
  )
  const setShape = (value: string) => edit((d) => ({ ...d, shape: value === 'passport' ? 'passport' : undefined }))
  const setCount = (value: string) =>
    edit((d) => {
      const n = Number.parseInt(value, 10)
      return { ...d, finishCount: Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_STOPS) : undefined }
    })
  const setVenue = (i: number, path: string, value: string) =>
    edit((d) => ({ ...d, venues: (d.venues ?? []).map((v, j) => (j === i ? ({ ...v, [path]: value || undefined } as StopVenue) : v)) }))
  const addVenue = () =>
    edit((d) => {
      const free = d.stops.map((_, i) => stopKey(i)).find((k) => !(d.venues ?? []).some((v) => v.stop === k))
      const first = initial.venueOptions[0]?.value
      return free && first ? { ...d, venues: [...(d.venues ?? []), { stop: free, venue: first }] } : d
    })
  const removeVenue = (i: number) => edit((d) => ({ ...d, venues: (d.venues ?? []).filter((_, j) => j !== i) }))
  const setRegion = (i: number, path: string, value: string | string[]) =>
    edit((d) => ({
      ...d,
      regions: (d.regions ?? []).map((r, j) =>
        j === i ? ({ ...r, [path]: path === 'enabled' ? value === 'true' : path === 'stops' ? (Array.isArray(value) ? value : [value]) : scalar(value) } as DraftRegion) : r,
      ),
    }))
  const addRegion = () =>
    edit((d) => ((d.regions ?? []).length >= MAX_REGIONS ? d : { ...d, regions: [...(d.regions ?? []), { name: '', enabled: true, stops: [] }] }))
  const removeRegion = (i: number) => edit((d) => ({ ...d, regions: (d.regions ?? []).filter((_, j) => j !== i) }))

  // ── Forks and Mysteries (FH-042S) ───────────────────────────────────────────────────────
  // The Mystery answer is write-only: it rides on the next save, where the server keeps only its hash
  // (app/(main)/hunts/actions.ts). Reloaded, the box is empty and says an answer is set.
  const setChoice = (i: number, path: string, value: string | string[]) =>
    edit((d) => ({
      ...d,
      choices: (d.choices ?? []).map((c, j) => (j === i ? ({ ...c, [path]: path === 'stops' ? (Array.isArray(value) ? value : [value]) : scalar(value) } as DraftChoice) : c)),
    }))
  const addChoice = () => edit((d) => ((d.choices ?? []).length >= MAX_CHOICES ? d : { ...d, choices: [...(d.choices ?? []), { name: '', stops: [] }] }))
  const removeChoice = (i: number) => edit((d) => ({ ...d, choices: (d.choices ?? []).filter((_, j) => j !== i) }))
  const setMystery = (i: number, path: string, value: string) =>
    edit((d) => ({ ...d, mysteries: (d.mysteries ?? []).map((m, j) => (j === i ? ({ ...m, [path]: value } as DraftMystery) : m)) }))
  const addMystery = () =>
    edit((d) => {
      const used = new Set([...(d.choices ?? []).flatMap((c) => c.stops), ...(d.mysteries ?? []).flatMap((m) => [m.stop, m.fallback])])
      const free = d.stops.map((_, i) => stopKey(i)).filter((k) => !used.has(k))
      return (d.mysteries ?? []).length >= MAX_MYSTERIES || free.length < 2 ? d : { ...d, mysteries: [...(d.mysteries ?? []), { stop: free[0], fallback: free[1] }] }
    })
  const removeMystery = (i: number) => edit((d) => ({ ...d, mysteries: (d.mysteries ?? []).filter((_, j) => j !== i) }))

  // ── Preview (in memory, writes nothing) ──────────────────────────────────────────────────
  const [credited, setCredited] = useState<string[]>([])
  const evaluation = useMemo(() => previewTrail(draft, credited), [draft, credited])
  const testedHere = draft.routeTestedAtRevision === revision
  const recordedFor = useRef<number | null>(null)
  useEffect(() => {
    if (step !== 'preview' || !evaluation.finished || testedHere || !settled || recordedFor.current === revision) return
    recordedFor.current = revision
    void routeTestedAction({ huntId: initial.huntId, revision }).then((res) => {
      if ('error' in res) {
        setError(res.error)
        return
      }
      if ('conflict' in res.data) {
        frozen.current = true
        setConflict(res.data.currentRevision)
        return
      }
      setDraft((d) => ({ ...d, routeTestedAtRevision: revision }))
    })
  }, [step, evaluation.finished, testedHere, settled, revision, initial.huntId])

  // ── Publish ──────────────────────────────────────────────────────────────────────────────
  // The same facts the server checks (FH-030S): the places a stop may name, and the ones set to leave.
  const checklist = useMemo(
    () =>
      publishChecklist({ ...draft, permissionConfirmed: permission }, revision, {
        venue: initial.hasVenue,
        allowedVenues: new Set(initial.venueOptions.map((o) => o.value)),
        ownerSpaceId: initial.ownerSpaceId,
        closedVenues: new Set(initial.closingVenues),
      }),
    [draft, permission, revision, initial.hasVenue, initial.venueOptions, initial.ownerSpaceId, initial.closingVenues],
  )

  const publish = async () => {
    setPublishing(true)
    setError(null)
    const res = await publishTrailAction({ huntId: initial.huntId, baseRevision: revision, visibility, permissionConfirmed: permission })
    setPublishing(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    if ('conflict' in res.data) {
      frozen.current = true
      setConflict(res.data.currentRevision)
      return
    }
    if ('blocked' in res.data) {
      setError(res.data.items.find((i) => !i.ok)?.message ?? 'Something on the checklist is still open.')
      return
    }
    setPublished(true)
    setJustPublished(res.data.visibility)
    setRevision((r) => r + 1)
    // FH-020X: the publish bound a placement to each stop. Keep the ids so the next save carries them
    // and a printed code keeps working in the next version. Not an edit: nothing is marked dirty.
    const placementIds = res.data.placementIds
    setDraft((d) => ({ ...d, permissionConfirmed: permission, stops: d.stops.map((s, i) => (placementIds[i] ? { ...s, placementId: placementIds[i] } : s)) }))
  }

  // ── Navigation ───────────────────────────────────────────────────────────────────────────
  const index = EDITOR_STEPS.indexOf(step)
  const back = index > 0 ? () => setStep(EDITOR_STEPS[index - 1]) : undefined
  const next = index < EDITOR_STEPS.length - 1 ? () => setStep(EDITOR_STEPS[index + 1]) : undefined
  const nextDisabled = step === 'stops' ? draft.stops.length < MIN_STOPS : step === 'preview' ? !testedHere : false

  const saveLine =
    conflict !== null
      ? null
      : saveState === 'saving'
        ? 'Saving'
        : saveState === 'saved'
          ? 'Saved'
          : saveState === 'error'
            ? 'Not saved'
            : null

  const conflictBanner = conflict !== null && (
    <div className="space-y-2">
      <p>Someone saved a newer version of this trail, maybe in another tab. Nothing from this tab was written over it.</p>
      <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
        Reload the latest
      </Button>
    </div>
  )

  const heading: Record<EditorStep, { title: string; description: string }> = {
    stops: { title: 'Add stops', description: 'Three to ten stops, in the order people walk them. A place name, a clue, and a code placed there to prove the visit.' },
    shape: { title: 'Choose the shape', description: 'How the stops connect. You never edit the links yourself.' },
    preview: { title: 'Preview', description: 'Play it as a player would, from the first clue. Nothing here counts for real.' },
    publish: { title: 'Publish', description: 'Run the checklist, choose who can find it, and go live.' },
  }

  const footer =
    step === 'publish' ? (
      <div className="flex gap-3">
        <Button variant="secondary" size="lg" className="flex-1" onClick={back} disabled={publishing}>
          Back
        </Button>
        <Button size="lg" className="flex-1" onClick={publish} disabled={!checklist.ok || published || conflict !== null || !settled} loading={publishing}>
          {published ? 'Published' : 'Publish'}
        </Button>
      </div>
    ) : undefined

  return (
    <SparkShell
      eyebrow={draft.title.trim() || 'Your trail'}
      title={heading[step].title}
      description={heading[step].description}
      step={stepNumber(step)}
      totalSteps={TRAIL_STEPS.length}
      stepLabel={TRAIL_STEPS[stepNumber(step) - 1]}
      onBack={step === 'stops' ? () => router.push('/hunts/edit') : back}
      backLabel={step === 'stops' ? 'Your trails' : 'Back'}
      onNext={step === 'publish' ? undefined : next}
      nextDisabled={nextDisabled || conflict !== null}
      footer={footer}
      error={conflictBanner || error}
      draftScopeKey={null}
    >
      {saveLine && (
        <p className="mb-3 text-meta text-subtle" aria-live="polite">
          {saveLine}
        </p>
      )}

      {step === 'stops' && (
        <div className="space-y-4">
          {draft.stops.length === 0 && (
            <EmptyState
              icon={Map}
              title="Add your first stop."
              description="Where does the trail begin?"
              action={
                <Button onClick={addStop} disabled={conflict !== null}>
                  Add a stop
                </Button>
              }
            />
          )}
          {draft.stops.map((s, i) => (
            <section key={i} className="space-y-3 rounded-card border border-border bg-surface p-4" aria-label={`Stop ${i + 1}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-body font-semibold text-text">Stop {i + 1}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs" onClick={() => moveStop(i, -1)} disabled={i === 0} aria-label={`Move stop ${i + 1} up`}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => moveStop(i, 1)} disabled={i === draft.stops.length - 1} aria-label={`Move stop ${i + 1} down`}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => removeStop(i)} aria-label={`Remove stop ${i + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
              {STOP_FIELDS.map((def) =>
                def.kind === 'toggle' ? (
                  <FieldControl key={def.path} def={def} value={stopValue(s, def.path)} onChange={(v) => setStop(i, def.path, scalar(v))} disabled={conflict !== null} />
                ) : (
                  <StudioField key={def.path} label={def.label}>
                    <FieldControl
                      def={def}
                      value={stopValue(s, def.path)}
                      onChange={(v) => setStop(i, def.path, scalar(v))}
                      placeholder={STOP_PLACEHOLDER[def.path]}
                      disabled={conflict !== null}
                      error={def.path === 'clue' && s.place.trim() && !s.clue.trim() ? 'This stop needs a clue. What would a stranger notice first?' : undefined}
                    />
                  </StudioField>
                ),
              )}
            </section>
          ))}
          <StudioField label="Or paste a list, one stop per line (place, then the clue after a colon)">
            <Textarea
              rows={3}
              aria-label="Paste a list of stops"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'The old pier: Count the lamps and stand under the third.\nThe bakery: Ask what sold out first today.'}
              disabled={conflict !== null}
            />
          </StudioField>
          {pasted.trim() && (
            <Button variant="secondary" size="sm" onClick={addPasted} disabled={conflict !== null}>
              Add these stops
            </Button>
          )}
          {draft.stops.length > 0 && (
            <Button variant="secondary" onClick={addStop} disabled={draft.stops.length >= MAX_STOPS || conflict !== null}>
              {draft.stops.length >= MAX_STOPS ? `That is the most, ${MAX_STOPS} stops` : 'Add a stop'}
            </Button>
          )}
          <StudioNote>
            <strong>Writing a clue.</strong> {COACH_QUESTIONS[draft.stops.length % COACH_QUESTIONS.length]} Print or place a code at each stop so people can prove they were here.
          </StudioNote>
        </div>
      )}

      {step === 'shape' && (
        <div className="space-y-4">
          {SHAPE_FIELD && (
            <StudioField label={SHAPE_FIELD.label}>
              <FieldControl def={{ ...SHAPE_FIELD, required: true }} value={passport ? 'passport' : 'trail'} onChange={(v) => setShape(scalar(v))} disabled={conflict !== null} />
            </StudioField>
          )}
          {passport && COUNT_FIELD && (
            <StudioField label={COUNT_FIELD.label}>
              <FieldControl
                def={COUNT_FIELD}
                value={String(passportCount(draft))}
                onChange={(v) => setCount(scalar(v))}
                hint={`Any ${passportCount(draft)} of the ${draft.stops.length} stops finish it. Two stops at one venue count once.`}
                disabled={conflict !== null}
              />
            </StudioField>
          )}
          <ol className="space-y-1 text-body-sm text-muted">
            {draft.stops.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.place.trim() || `Stop ${i + 1}`}
                {passport ? '' : i < draft.stops.length - 1 ? ' opens the next' : ' finishes the trail'}
              </li>
            ))}
          </ol>

          {passport && (
            <section className="space-y-3" aria-label="Regions">
              <p className="text-body font-semibold text-text">Regions</p>
              <p className="text-body-sm text-muted">Optional. Someone who stays in one region, plus the stops in no region, must be able to finish. Switch a region off and it takes no new visits; visits already counted there still count.</p>
              {(draft.regions ?? []).map((r, i) => (
                <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-body font-semibold text-text">{r.name.trim() || `Region ${i + 1}`}</p>
                    <Button variant="ghost" size="xs" onClick={() => removeRegion(i)} aria-label={`Remove region ${i + 1}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  {REGION_FIELDS.map((def) =>
                    def.kind === 'toggle' ? (
                      <FieldControl key={def.path} def={def} value={String(r.enabled)} onChange={(v) => setRegion(i, def.path, scalar(v))} disabled={conflict !== null} />
                    ) : (
                      <StudioField key={def.path} label={def.label}>
                        <FieldControl def={def} value={def.path === 'stops' ? r.stops : r.name} onChange={(v) => setRegion(i, def.path, v)} loaded={loaded} disabled={conflict !== null} />
                      </StudioField>
                    ),
                  )}
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addRegion} disabled={(draft.regions ?? []).length >= MAX_REGIONS || conflict !== null}>
                <Plus className="h-4 w-4" aria-hidden />
                Add a region
              </Button>
            </section>
          )}

          <section className="space-y-3" aria-label="Forks">
            <p className="text-body font-semibold text-text">Forks</p>
            <p className="text-body-sm text-muted">Optional. A player picks one stop of a fork and the others close for them. Every pick has to lead on to the finish.</p>
            {(draft.choices ?? []).map((c, i) => (
              <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-body font-semibold text-text">{c.name.trim() || `Fork ${i + 1}`}</p>
                  <Button variant="ghost" size="xs" onClick={() => removeChoice(i)} aria-label={`Remove fork ${i + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                {CHOICE_FIELDS.map((def) => (
                  <StudioField key={def.path} label={def.label}>
                    <FieldControl def={def} value={def.path === 'stops' ? c.stops : c.name} onChange={(v) => setChoice(i, def.path, v)} loaded={loaded} disabled={conflict !== null} />
                  </StudioField>
                ))}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addChoice} disabled={(draft.choices ?? []).length >= MAX_CHOICES || conflict !== null}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a fork
            </Button>
          </section>

          <section className="space-y-3" aria-label="Mystery stops">
            <p className="text-body font-semibold text-text">Mystery stops</p>
            <p className="text-body-sm text-muted">Optional. At a Mystery stop a player finds the code, then types the answer to your clue. They get five tries, and the stop&apos;s hint shows after the second. Pick a stand-in stop, a staffed desk say, for anyone who runs out of tries.</p>
            {(draft.mysteries ?? []).map((m, i) => (
              <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
                <div className="flex items-center justify-end">
                  <Button variant="ghost" size="xs" onClick={() => removeMystery(i)} aria-label={`Remove Mystery ${i + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                {MYSTERY_FIELDS.map((def) => (
                  <StudioField key={def.path} label={def.label}>
                    <FieldControl
                      def={def}
                      value={(m as Record<string, string | undefined>)[def.path] ?? ''}
                      onChange={(next) => setMystery(i, def.path, scalar(next))}
                      loaded={loaded}
                      placeholder={def.path === 'answer' && m.answerHash ? 'An answer is set. Type a new one to replace it.' : undefined}
                      hint={def.path === 'answer' ? 'Only a scrambled copy is kept, so nobody can read it back. Spelling counts, capital letters do not.' : undefined}
                      disabled={conflict !== null}
                    />
                  </StudioField>
                ))}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addMystery} disabled={(draft.mysteries ?? []).length >= MAX_MYSTERIES || draft.stops.length < 2 || conflict !== null}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a Mystery stop
            </Button>
          </section>

          {initial.venueOptions.length > 0 && (
            <section className="space-y-3" aria-label="Partner places">
              <p className="text-body font-semibold text-text">Partner places</p>
              <p className="text-body-sm text-muted">Choose the venue a stop&apos;s code sits at: this Hunt&apos;s Space or a partner that has accepted. A substitute place counts the same, and keeps the stop open if the venue closes.</p>
              {(draft.venues ?? []).map((v, i) => (
                <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
                  <div className="flex items-center justify-end">
                    <Button variant="ghost" size="xs" onClick={() => removeVenue(i)} aria-label={`Remove partner place ${i + 1}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  {VENUE_FIELDS.map((def) => (
                    <StudioField key={def.path} label={def.label}>
                      <FieldControl
                        def={def}
                        value={(v as Record<string, string | undefined>)[def.path] ?? ''}
                        onChange={(next) => setVenue(i, def.path, scalar(next))}
                        loaded={loaded}
                        disabled={conflict !== null}
                      />
                    </StudioField>
                  ))}
                  {initial.closingVenues.includes(v.venue) && <StudioNote>This venue is leaving the Hunt. Add a substitute place so the stop stays open.</StudioNote>}
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={addVenue}
                disabled={(draft.venues ?? []).length >= draft.stops.length || conflict !== null}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Set a stop&apos;s place
              </Button>
            </section>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          {!settled && <p className="text-body-sm text-muted">Saving your latest edits before the walk.</p>}
          {draft.stops.map((s, i) => {
            const key = stopKey(i)
            const state = evaluation.status[key]
            return (
              <div key={key} className="rounded-card border border-border bg-surface p-4">
                <p className="flex items-center gap-2 text-body font-semibold text-text">
                  {state === 'credited' ? <Check className="h-4 w-4 text-primary" aria-hidden /> : state === 'eligible' ? <Map className="h-4 w-4 text-primary" aria-hidden /> : <Lock className="h-4 w-4 text-subtle" aria-hidden />}
                  Stop {i + 1}
                  {state === 'credited' && <span className="font-normal text-muted">found</span>}
                </p>
                {state === 'eligible' && (
                  <>
                    <p className="mt-2 text-body text-text">{s.clue.trim() || 'This stop needs a clue.'}</p>
                    {s.hint?.trim() && <p className="mt-1 text-body-sm text-muted">Hint: {s.hint.trim()}</p>}
                    <div className="mt-3">
                      <Button size="sm" onClick={() => setCredited((c) => [...c, key])} disabled={!settled}>
                        I found it
                      </Button>
                    </div>
                  </>
                )}
                {state === 'locked' && <p className="mt-1 text-body-sm text-muted">Opens after stop {i}.</p>}
                {state === 'closed' && (
                  <p className="mt-1 text-body-sm text-muted">
                    {(draft.choices ?? []).some((c) => c.stops.includes(key)) ? 'You took the other path at this fork.' : (draft.mysteries ?? []).some((m) => m.stop === key || m.fallback === key) ? 'Not needed now. Its Mystery or stand-in was already found.' : 'Closed for now. This stop is not taking visits.'}
                  </p>
                )}
              </div>
            )
          })}
          {evaluation.finished ? (
            <StudioNote>
              <strong>You walked it.</strong> {testedHere ? 'The route test is recorded for this version. Any edit asks for another walk.' : 'Recording the route test.'}
            </StudioNote>
          ) : (
            <StudioNote>Walk it once in preview before you publish. Credits here live in this tab only.</StudioNote>
          )}
          {credited.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCredited([])}>
              Start over
            </Button>
          )}
        </div>
      )}

      {step === 'publish' && (
        <div className="space-y-4">
          {justPublished && (
            <div className="rounded-card border border-primary bg-surface p-4 text-body text-text">
              {justPublished === 'public'
                ? 'Thanks. A person will look at this before it goes on the public list. Your link already works.'
                : 'Your trail is live. Share the link.'}
            </div>
          )}
          {published && !justPublished && (
            <StudioNote>
              <strong>This trail is live.</strong> Editing a stop opens a new version; the live one stays as it is until you publish again.
            </StudioNote>
          )}
          <ul className="space-y-2">
            {checklist.items.map((item, i) => (
              <li key={`${item.code}-${item.stop ?? ''}-${i}`} className="flex items-start gap-2 text-body-sm">
                {item.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> : <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
                <span className={item.ok ? 'text-muted' : 'text-text'}>
                  {item.stop !== undefined ? `Stop ${item.stop + 1}: ` : ''}
                  {item.ok ? (item.code === 'route_test' ? 'Walked once in preview.' : item.code === 'permission' ? 'Permission confirmed.' : 'Done.') : item.message}
                  {!item.ok && item.code === 'route_test' && (
                    <>
                      {' '}
                      <button type="button" className="underline underline-offset-4" onClick={() => setStep('preview')}>
                        Open preview
                      </button>
                    </>
                  )}
                  {!item.ok && (item.code === 'graph' || item.code === 'venue_closure' || item.code === 'stop_venue' || item.code === 'mystery_answer') && (
                    <>
                      {' '}
                      <button type="button" className="underline underline-offset-4" onClick={() => setStep('shape')}>
                        Fix the shape
                      </button>
                    </>
                  )}
                  {!item.ok && (item.code === 'stop_text' || item.code === 'stop_placement' || item.code === 'stop_staff_venue' || item.code === 'stops_count') && (
                    <>
                      {' '}
                      <button type="button" className="underline underline-offset-4" onClick={() => setStep('stops')}>
                        Fix the stops
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Checkbox
            label="I have permission to place a code at each of these places."
            checked={permission}
            onChange={(e) => setPermission(e.target.checked)}
            disabled={published || conflict !== null}
          />
          {VISIBILITY_FIELD && (
            <StudioField label={VISIBILITY_FIELD.label}>
              <FieldControl def={{ ...VISIBILITY_FIELD, required: true }} value={visibility} onChange={(v) => setVisibility(scalar(v))} disabled={published || conflict !== null} />
            </StudioField>
          )}
        </div>
      )}
    </SparkShell>
  )
}
