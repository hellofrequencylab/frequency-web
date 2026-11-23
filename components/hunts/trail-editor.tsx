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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Lock, Map, Trash2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldControl, SparkShell, StudioField, StudioNote } from '@/components/studio/spark'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import {
  MAX_BENEFITS,
  MAX_STOPS,
  MIN_STOPS,
  benefitCodeFrom,
  emptyStop,
  previewTrail,
  publishChecklist,
  remapRegions,
  stopKey,
  type Stop,
  type StopVenue,
  type TrailDraft,
} from '@/lib/hunts/draft'
import type { TrailEditorState } from '@/lib/hunts/store'
import { publishTrailAction, routeTestedAction, saveTrailAction } from '@/app/(main)/hunts/actions'
import { saveChallengesAction } from '@/app/(main)/hunts/challenge-actions'
import type { previewReleaseAction, releaseEditionAction } from '@/app/(main)/hunts/edition-actions'
import type { ReleasePreview } from '@/lib/hunts/edition-store'
import { EDITION_GRACE_DAYS } from '@/lib/hunts/editions'
import { remapChallenges } from '@/lib/hunts/challenges'
import { TrailChallenges, type EditableChallenge } from './trail-challenges'
import { TrailShape } from './trail-shape'
import { EDITOR_STEPS, TRAIL_STEPS, stepNumber, type EditorStep } from './trail-steps'
import { FinaleEventField } from './finale-event-field'

// The stop fields, from the manifest's repeat. The kernel keeps a repeat field's `section` on the
// group, so each def gets it back here before the control renders it.
const STOPS_REPEAT = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'stops')
const STOP_FIELDS: FieldDef[] = (STOPS_REPEAT?.fields ?? []).map((f) => ({ ...f, section: STOPS_REPEAT?.section ?? 'stops' }))
const VISIBILITY_FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'visibility')
// FH-020Y: the per-stop partner venue, from the manifest's venues repeat.
const VENUES_REPEAT = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'venues')
const VENUE_DEF = VENUES_REPEAT?.fields.find((f) => f.path === 'venueSpaceId')
const VENUE_FIELD: FieldDef | undefined = VENUE_DEF && { ...VENUE_DEF, section: VENUES_REPEAT?.section ?? 'stops' }
// The pass benefit fields (FH-036S), from the manifest's repeat like the stops.
const BENEFITS_REPEAT = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'benefits')
const BENEFIT_FIELDS: FieldDef[] = (BENEFITS_REPEAT?.fields ?? []).map((f) => ({ ...f, section: BENEFITS_REPEAT?.section ?? 'publishing' }))
const BENEFIT_PLACEHOLDER: Record<string, string> = { label: 'e.g. Tasting flight at the last stop', code: 'e.g. tasting-flight' }

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

/** The live Trail's other screens (FH-032S): route health for organisers, the venue report for venue staff. */
type ManageLinks = { health: string; report: string }

/** FH-044S: the edition actions the page hands in, for a Trail that already has a live edition. */
export type EditionActions = { release: typeof releaseEditionAction; preview: typeof previewReleaseAction }

export function TrailEditor({ initial, manage = null, edition = null, finaleEvents = [] }: { initial: TrailEditorState; manage?: ManageLinks | null; edition?: EditionActions | null; finaleEvents?: readonly { value: string; label: string }[] }) {
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
  const [challenges, setChallenges] = useState<EditableChallenge[]>(initial.challenges)
  const [challengesDirty, setChallengesDirty] = useState(false)
  const [savingChallenges, setSavingChallenges] = useState(false)
  // FH-044S: a Trail with a live edition releases its open draft as the next edition.
  const releasing = initial.releasesEdition && edition !== null
  const [editionLabel, setEditionLabel] = useState('')
  const [releasePreview, setReleasePreview] = useState<ReleasePreview | null>(null)

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
  // A challenge names its stop by position, so moving or removing a stop moves its challenge with it.
  const reorderChallenges = (order: number[]) => {
    if (challenges.length === 0) return
    setChallenges((cs) => remapChallenges(cs, order))
    setChallengesDirty(true)
  }
  // FH-020Y: a stop's partner venue is named by position too, and moves with its stop in the same edit.
  const withVenues = (d: TrailDraft, venues: StopVenue[]): TrailDraft => {
    const { venues: _old, ...rest } = d
    void _old
    return venues.length > 0 ? { ...rest, venues } : rest
  }
  // FH-030S: a Passport region names its stops by position, so it follows them the same way.
  const moved = (d: TrailDraft, order: number[]): TrailDraft => {
    const next = withVenues(d, remapChallenges(d.venues ?? [], order))
    return d.regions ? { ...next, regions: remapRegions(d.regions, order) } : next
  }
  const setStopVenue = (i: number, venueSpaceId: string) =>
    edit((d) => {
      const others = (d.venues ?? []).filter((v) => v.stop !== i)
      return withVenues(d, venueSpaceId ? [...others, { stop: i, venueSpaceId }].sort((a, b) => a.stop - b.stop) : others)
    })
  const removeStop = (i: number) => {
    const order = draft.stops.map((_, j) => j).filter((j) => j !== i)
    reorderChallenges(order)
    edit((d) => moved({ ...d, stops: d.stops.filter((_, j) => j !== i) }, order))
  }
  const moveStop = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= draft.stops.length) return
    const order = draft.stops.map((_, k) => k)
    ;[order[i], order[j]] = [order[j], order[i]]
    reorderChallenges(order)
    edit((d) => {
      const stops = [...d.stops]
      ;[stops[i], stops[j]] = [stops[j], stops[i]]
      return moved({ ...d, stops }, order)
    })
  }

  // ── Challenges (FH-042S) ─────────────────────────────────────────────────────────────────
  // Their own list and their own save: a typed answer goes to the server once and comes back only as
  // "an answer is set". A save moves the revision like any edit, so the route test runs again.
  const changeChallenges = (next: EditableChallenge[]) => {
    setChallenges(next)
    setChallengesDirty(true)
  }
  const saveChallenges = async () => {
    setSavingChallenges(true)
    const res = await saveChallengesAction({ huntId: initial.huntId, baseRevision: revisionRef.current, challenges })
    setSavingChallenges(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    if ('conflict' in res.data) {
      frozen.current = true
      setConflict(res.data.currentRevision)
      return
    }
    revisionRef.current = res.data.revision
    setRevision(res.data.revision)
    setChallenges(res.data.challenges)
    setChallengesDirty(false)
    setPublished(false)
    setError(null)
  }

  // ── Pass benefits (FH-036S) ──────────────────────────────────────────────────────────────
  // The short code follows the name until the resident types their own, so nobody has to invent one.
  const benefits = draft.benefits ?? []
  const setBenefit = (i: number, path: string, value: string) =>
    edit((d) => ({
      ...d,
      benefits: (d.benefits ?? []).map((b, j) => {
        if (j !== i) return b
        if (path === 'code') return { ...b, code: value.toLowerCase() }
        return { label: value, code: b.code === benefitCodeFrom(b.label) ? benefitCodeFrom(value) : b.code }
      }),
    }))
  const addBenefit = () => edit((d) => ((d.benefits ?? []).length >= MAX_BENEFITS ? d : { ...d, benefits: [...(d.benefits ?? []), { label: '', code: '' }] }))
  const removeBenefit = (i: number) => edit((d) => ({ ...d, benefits: (d.benefits ?? []).filter((_, j) => j !== i) }))

  // ── Preview (in memory, writes nothing) ──────────────────────────────────────────────────
  const [credited, setCredited] = useState<string[]>([])
  const evaluation = useMemo(() => previewTrail(draft, credited, new Date(), challenges), [draft, credited, challenges])
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
  const checklist = useMemo(
    // FH-030S: stops with no partner venue sit at the Space that runs the Trail, as publish binds them,
    // so a Passport whose stops all share that one venue shows the same blocker here as at publish.
    () => publishChecklist({ ...draft, permissionConfirmed: permission }, revision, { venue: initial.hasVenue, challenges, route: { ownerVenue: initial.hasVenue ? 'this-space' : null } }),
    [draft, permission, revision, initial.hasVenue, challenges],
  )

  // FH-044S: before the release tap, show where each printed code goes and who is left on the old edition.
  // Read from the saved draft, so it waits for the autosave and reads again after each saved revision.
  useEffect(() => {
    if (!releasing || !edition || published || step !== 'publish' || !settled) return
    let live = true
    void edition.preview({ huntId: initial.huntId }).then((res) => {
      if (live) setReleasePreview('data' in res ? res.data : null)
    })
    return () => {
      live = false
    }
  }, [releasing, edition, published, step, settled, revision, initial.huntId])

  const release = async () => {
    if (!edition) return
    setPublishing(true)
    setError(null)
    const res = await edition.release({ huntId: initial.huntId, baseRevision: revision, label: editionLabel, visibility, permissionConfirmed: permission })
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
    setJustPublished(visibility === 'public' ? 'public' : 'unlisted')
    // The release bound codes on the server. Reload so the next edit starts from them.
    router.refresh()
  }

  const publish = async () => {
    if (releasing) return release()
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
        <Button size="lg" className="flex-1" onClick={publish} disabled={!checklist.ok || published || conflict !== null || !settled || challengesDirty} loading={publishing}>
          {published ? 'Published' : releasing ? `Release edition ${releasePreview?.versionNo ?? initial.versionNo}` : 'Publish'}
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
              {VENUE_FIELD && initial.partnerVenues.length > 0 && (
                <StudioField label={VENUE_FIELD.label}>
                  <FieldControl
                    id={`stop-${i}-venue`}
                    def={VENUE_FIELD}
                    loaded={{ 'hunt-partner-venues': initial.partnerVenues.map((v) => ({ value: v.spaceId, label: v.name })) }}
                    value={draft.venues?.find((v) => v.stop === i)?.venueSpaceId ?? ''}
                    onChange={(v) => setStopVenue(i, scalar(v))}
                    disabled={conflict !== null}
                  />
                </StudioField>
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
        <div className="space-y-3">
          <TrailShape draft={draft} onEdit={edit} disabled={conflict !== null} />
          <ol className="space-y-1 text-body-sm text-muted">
            {draft.stops.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.place.trim() || `Stop ${i + 1}`}
                {challenges.length > 0 || draft.finishCount !== undefined ? '' : i < draft.stops.length - 1 ? ' opens the next' : ' finishes the trail'}
              </li>
            ))}
          </ol>
          <TrailChallenges
            stops={draft.stops}
            challenges={challenges}
            onChange={changeChallenges}
            onSave={() => void saveChallenges()}
            dirty={challengesDirty}
            saving={savingChallenges}
            disabled={conflict !== null || !settled}
          />
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
                {state === 'locked' && <p className="mt-1 text-body-sm text-muted">{challenges.length > 0 ? 'Opens after an earlier stop.' : `Opens after stop ${i}.`}</p>}
                {state === 'closed' && <p className="mt-1 text-body-sm text-muted">Closed. A player took the other way.</p>}
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
          {published && manage && (
            <div className="flex flex-wrap gap-2">
              <Link href={manage.health} prefetch={false} className={buttonClasses('secondary', 'md')}>Route health</Link>
              <Link href={manage.report} prefetch={false} className={buttonClasses('secondary', 'md')}>Venue report</Link>
            </div>
          )}
          {releasing && !published && (
            <section className="space-y-3 rounded-card border border-border bg-surface p-4" aria-label="This release">
              <p className="text-body font-semibold text-text">This is a new edition</p>
              <p className="text-body-sm text-muted">
                The live edition keeps running until you release this one. Players already partway through keep their edition and have {EDITION_GRACE_DAYS} days to finish it.
              </p>
              {releasePreview ? (
                <>
                  <ul className="space-y-1 text-body-sm">
                    {releasePreview.crosswalk.map((row, i) => (
                      <li key={i} className="text-text">
                        {row.to ? `${row.from}: its code moves to ${row.to}.` : `${row.from}: dropped. Its code stops counting for new players.`}
                      </li>
                    ))}
                  </ul>
                  <p className="text-body-sm text-text">
                    {releasePreview.carried === 1 ? '1 printed code moves with its stop.' : `${releasePreview.carried} printed codes move with their stops.`}
                    {releasePreview.retired.length > 0 && ` Retired: ${releasePreview.retired.join(', ')}. Take those down after ${EDITION_GRACE_DAYS} days.`}
                  </p>
                  <p className="text-body-sm text-text">
                    {releasePreview.pinnedRuns === 0
                      ? 'Nobody is partway through right now.'
                      : `${releasePreview.pinnedRuns === 1 ? '1 player is' : `${releasePreview.pinnedRuns} players are`} partway through. They finish on the current edition.`}
                  </p>
                </>
              ) : (
                <p className="text-body-sm text-subtle">Reading where each printed code goes.</p>
              )}
              <StudioField label="Edition name (optional)">
                <Input aria-label="Edition name" value={editionLabel} maxLength={80} placeholder={`Edition ${initial.versionNo}`} onChange={(e) => setEditionLabel(e.target.value)} disabled={conflict !== null} />
              </StudioField>
            </section>
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
          {initial.passBenefits && BENEFITS_REPEAT && (
            <section className="space-y-3 rounded-card border border-border bg-surface p-4" aria-label={BENEFITS_REPEAT.label}>
              <p className="text-body font-semibold text-text">{BENEFITS_REPEAT.label}</p>
              <p className="text-body-sm text-muted">Selling a pass for this trail? List what it includes. A ticket or a store item can only carry what is listed here. Skip this if the trail is free.</p>
              {benefits.map((b, i) => (
                <div key={i} className="space-y-2 border-t border-border pt-3">
                  {BENEFIT_FIELDS.map((def) => (
                    <StudioField key={def.path} label={def.label}>
                      <FieldControl
                        def={def}
                        value={def.path === 'code' ? b.code : b.label}
                        onChange={(v) => setBenefit(i, def.path, scalar(v))}
                        placeholder={BENEFIT_PLACEHOLDER[def.path]}
                        disabled={conflict !== null}
                      />
                    </StudioField>
                  ))}
                  <Button variant="ghost" size="xs" onClick={() => removeBenefit(i)} disabled={conflict !== null}>
                    Remove {b.label.trim() || `benefit ${i + 1}`}
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addBenefit} disabled={benefits.length >= MAX_BENEFITS || conflict !== null}>
                Add a benefit
              </Button>
              <p className="text-body-sm text-subtle">Changing this list is an edit, so the trail asks for one more preview walk and a fresh publish.</p>
            </section>
          )}
          <FinaleEventField options={finaleEvents} value={draft.finaleEventId} onChange={(finaleEventId) => edit((d) => ({ ...d, finaleEventId }))} disabled={conflict !== null} />
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
