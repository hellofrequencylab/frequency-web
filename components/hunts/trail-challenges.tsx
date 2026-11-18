'use client'

// The Challenges list in the Trail editor (FH-042S, ADR-1977): a Mystery question at a stop, a fork
// where players pick one stop, and stand-in sets where either stop counts. Its own list beside the
// stops, saved by its own action (app/(main)/hunts/challenge-actions.ts), which hashes a typed answer
// and sends back only whether one is set. The fields come from the manifest's `challenges` repeat.
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldControl, StudioField, StudioNote } from '@/components/studio/spark'
import { MYSTERY_TRIES, type ChallengeView } from '@/lib/hunts/challenges'
import type { Stop } from '@/lib/hunts/draft'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import type { FieldDef } from '@/lib/studio/kernel/manifest'

/** A challenge as the editor holds it: the view, plus an answer typed since the last save. */
export type EditableChallenge = ChallengeView & { answer?: string }

const REPEAT = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'challenges')
const FIELDS: FieldDef[] = (REPEAT?.fields ?? []).map((f) => ({ ...f, section: REPEAT?.section ?? 'challenges' }))
const MYSTERY_ONLY = new Set(['question', 'answer', 'hint'])
const scalar = (v: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : v)

function valueOf(c: EditableChallenge, path: string): string {
  if (path === 'stop') return String(c.stop)
  if (path === 'mystery') return String(c.mystery)
  if (path === 'answer') return c.answer ?? ''
  const v = (c as Record<string, unknown>)[path]
  return typeof v === 'string' ? v : ''
}

function withValue(c: EditableChallenge, path: string, value: string): EditableChallenge {
  if (path === 'stop') return { ...c, stop: Number(value) }
  if (path === 'mystery') return { ...c, mystery: value === 'true' }
  return { ...c, [path]: value }
}

export function TrailChallenges({ stops, challenges, onChange, onSave, dirty, saving, disabled }: {
  stops: readonly Stop[]
  challenges: readonly EditableChallenge[]
  onChange: (next: EditableChallenge[]) => void
  onSave: () => void
  dirty: boolean
  saving: boolean
  disabled: boolean
}) {
  const stopOptions = { 'trail-stops': stops.map((s, i) => ({ value: String(i), label: `Stop ${i + 1}${s.place.trim() ? `: ${s.place.trim()}` : ''}` })) }
  const free = stops.findIndex((_, i) => !challenges.some((c) => c.stop === i))
  const add = () => onChange([...challenges, { stop: free, mystery: false, question: '', hint: '', fork: '', standIn: '', answerSet: false }])
  const set = (i: number, path: string, value: string) => onChange(challenges.map((c, j) => (j === i ? withValue(c, path, value) : c)))
  const remove = (i: number) => onChange(challenges.filter((_, j) => j !== i))

  return (
    <section aria-labelledby="trail-challenges" className="space-y-3">
      <h2 id="trail-challenges" className="text-body font-semibold text-text">Challenges</h2>
      <p className="text-body-sm text-muted">
        Optional. Ask a question at a stop, give players a fork where they pick one stop, or pair two stops so either one counts.
        Stops in one fork or one pair sit next to each other in the trail. A question stop needs a pair, so a player who runs out of tries can still go on.
      </p>
      {challenges.map((c, i) => (
        <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body font-semibold text-text">Stop {c.stop + 1}</p>
            <Button variant="ghost" size="xs" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove the challenge at stop ${c.stop + 1}`}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          {FIELDS.filter((def) => c.mystery || !MYSTERY_ONLY.has(def.path)).map((def) =>
            def.kind === 'toggle' ? (
              <FieldControl key={def.path} id={`challenge-${i}-${def.path}`} def={def} value={valueOf(c, def.path)} onChange={(v) => set(i, def.path, scalar(v))} disabled={disabled} />
            ) : (
              <StudioField key={def.path} label={def.label}>
                <FieldControl
                  id={`challenge-${i}-${def.path}`}
                  def={def}
                  loaded={stopOptions}
                  value={valueOf(c, def.path)}
                  onChange={(v) => set(i, def.path, scalar(v))}
                  placeholder={def.path === 'answer' && c.answerSet ? 'An answer is set' : undefined}
                  disabled={disabled}
                />
              </StudioField>
            ),
          )}
          {c.mystery && <p className="text-body-sm text-muted">Players get {MYSTERY_TRIES} tries. Spelling case and extra spaces do not matter.</p>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={add} disabled={disabled || free === -1}>
          <Plus className="h-4 w-4" aria-hidden />
          Add a challenge
        </Button>
        {dirty && (
          <Button size="sm" onClick={onSave} loading={saving} disabled={disabled}>
            Save challenges
          </Button>
        )}
      </div>
      {dirty && <StudioNote>Save your challenges before you publish.</StudioNote>}
    </section>
  )
}
