'use client'

// Inline editor for the active season's challenges + the create form. Each row
// edits locally and saves through the gated action; completion numbers render
// beside the controls so tuning stays grounded.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Plus, Mountain } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { updateChallengeAction, createChallengeAction, type ExpressionJourneyOption } from '../actions'

export interface ChallengeRow {
  id: string
  season: number
  slug: string
  name: string
  description: string
  category: string
  difficulty: string
  target: number
  zaps_reward: number
  sort_order: number
  /** Set when this is an Expression Challenge — the Journey it caps. */
  journey_id: string | null
  started: number
  completed: number
  rate: number
}

const DIFFICULTIES = ['easy', 'normal', 'hard', 'legendary'] as const
const CATEGORIES = ['social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special'] as const

const selectCls = `${fieldClasses} w-auto py-1 text-xs`
const numCls = 'rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text text-right'

function EditorRow({ challenge, journeys }: { challenge: ChallengeRow; journeys: ExpressionJourneyOption[] }) {
  const [row, setRow] = useState(challenge)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle')
  const router = useRouter()

  const isExpression = challenge.journey_id != null

  function update(patch: Partial<ChallengeRow>) {
    setRow((r) => ({ ...r, ...patch }))
    setDirty(true)
    setStatus('idle')
  }

  function save() {
    start(async () => {
      const journeyChanged = isExpression && !!row.journey_id && row.journey_id !== challenge.journey_id
      const r = await updateChallengeAction(row.id, {
        name: row.name,
        description: row.description,
        difficulty: row.difficulty,
        target: row.target,
        zapsReward: row.zaps_reward,
        // Only send journeyId when an Expression row's Journey actually changed, so editing
        // copy/reward never re-validates (and never re-runs) the Journey link.
        ...(journeyChanged ? { journeyId: row.journey_id! } : {}),
      })
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('saved')
        setDirty(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2 px-4 py-3">
      {isExpression && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Mountain className="h-3 w-3" /> Expression Challenge
          </span>
          <label className="flex items-center gap-1">
            <span className="text-xs text-subtle">caps</span>
            <select
              value={row.journey_id ?? ''}
              onChange={(e) => update({ journey_id: e.target.value })}
              aria-label="Journey this Expression Challenge caps"
              className={selectCls}
            >
              {/* If the linked Journey isn't in the current official set, keep its id selectable. */}
              {!journeys.some((j) => j.id === row.journey_id) && row.journey_id && (
                <option value={row.journey_id}>Current Journey</option>
              )}
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={row.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Challenge name"
          className="min-w-48 flex-1 rounded-md border border-border bg-canvas px-2 py-1 text-sm font-medium text-text"
        />
        <select
          value={row.difficulty}
          onChange={(e) => update({ difficulty: e.target.value })}
          aria-label="Difficulty"
          className={selectCls}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1" title="Count to hit">
          <span className="text-xs text-subtle">target</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={row.target}
            onChange={(e) => update({ target: Number(e.target.value) })}
            className={`w-16 ${numCls}`}
          />
        </label>
        <label className="flex items-center gap-1" title="Zaps paid on completion">
          <Zap className="h-3 w-3 text-primary" />
          <input
            type="number"
            min={0}
            max={1000}
            value={row.zaps_reward}
            onChange={(e) => update({ zaps_reward: Number(e.target.value) })}
            className={`w-16 ${numCls}`}
          />
        </label>
      </div>
      <textarea
        value={row.description}
        onChange={(e) => update({ description: e.target.value })}
        rows={2}
        aria-label="Challenge description"
        className="w-full rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text"
      />
      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-subtle">
          {row.completed}/{row.started} completed{row.started > 0 ? ` (${row.rate}%)` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status === 'saved' && <span className="text-xs text-success">Saved.</span>}
          {status !== 'idle' && status !== 'saved' && <span className="text-xs text-danger">{status}</span>}
          <Button size="sm" variant="secondary" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ChallengeEditor({
  challenges,
  journeys,
}: {
  challenges: ChallengeRow[]
  journeys: ExpressionJourneyOption[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="divide-y divide-border/50">
        {challenges.map((c) => (
          <EditorRow key={c.id} challenge={c} journeys={journeys} />
        ))}
      </div>
    </div>
  )
}

type ChallengeKind = 'season' | 'expression'

// Sensible defaults per kind. An Expression Challenge always pays 50 Zaps for a single
// deliberate act (target 1, hard); a season-wide challenge is the open-ended default.
const EXPRESSION_DEFAULTS = { difficulty: 'hard', target: 1, zapsReward: 50 }
const SEASON_DEFAULTS = { difficulty: 'normal', target: 1, zapsReward: 50 }

export function ChallengeCreateForm({ journeys }: { journeys: ExpressionJourneyOption[] }) {
  const [kind, setKind] = useState<ChallengeKind>('season')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('seasonal')
  const [journeyId, setJourneyId] = useState<string>('')
  const [difficulty, setDifficulty] = useState<string>(SEASON_DEFAULTS.difficulty)
  const [target, setTarget] = useState(SEASON_DEFAULTS.target)
  const [zapsReward, setZapsReward] = useState(SEASON_DEFAULTS.zapsReward)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'created' | string>('idle')
  const router = useRouter()

  const isExpression = kind === 'expression'

  function pickKind(next: ChallengeKind) {
    setKind(next)
    setStatus('idle')
    // Reset reward shape to the kind's defaults so the operator starts from a sensible place.
    const d = next === 'expression' ? EXPRESSION_DEFAULTS : SEASON_DEFAULTS
    setDifficulty(d.difficulty)
    setTarget(d.target)
    setZapsReward(d.zapsReward)
  }

  function submit() {
    setStatus('idle')
    start(async () => {
      const r = await createChallengeAction({
        name,
        description,
        category,
        difficulty,
        target,
        zapsReward,
        kind,
        ...(isExpression ? { journeyId } : {}),
      })
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('created')
        setName('')
        setDescription('')
        setJourneyId('')
        router.refresh()
      }
    })
  }

  const submitDisabled = pending || !name.trim() || (isExpression && !journeyId)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <fieldset className="mb-4">
        <legend className="sr-only">Challenge type</legend>
        <div className="inline-flex rounded-lg border border-border bg-canvas p-0.5">
          {(
            [
              { value: 'season', label: 'Season-wide challenge' },
              { value: 'expression', label: 'Expression Challenge' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={kind === opt.value}
              onClick={() => pickKind(opt.value)}
              className={
                kind === opt.value
                  ? 'rounded-md bg-surface px-3 py-2 text-sm font-medium text-text shadow-sm'
                  : 'rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-text'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">
          {isExpression
            ? 'The capstone for one Journey. Members complete it to finish that Journey.'
            : 'Lands on the season board for everyone. Criteria wiring stays with engineering.'}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ch-name">Name</Label>
          <Input
            id="ch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isExpression ? 'Share your Expression at a Circle' : 'Show up three weeks straight'}
          />
        </div>
        {isExpression ? (
          <div className="space-y-1">
            <Label htmlFor="ch-journey">Journey to cap</Label>
            <select
              id="ch-journey"
              value={journeyId}
              onChange={(e) => setJourneyId(e.target.value)}
              className={fieldClasses}
            >
              <option value="">Pick a Journey…</option>
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="ch-category">Category</Label>
            <select id="ch-category" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClasses}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="ch-desc">Description</Label>
          <Textarea
            id="ch-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the member does, in one or two plain sentences."
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
          <div className="space-y-1">
            <Label htmlFor="ch-difficulty">Difficulty</Label>
            <select id="ch-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={fieldClasses}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ch-target">Target</Label>
            <Input
              id="ch-target"
              type="number"
              min={1}
              max={10000}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ch-zaps">Zap reward</Label>
            <Input
              id="ch-zaps"
              type="number"
              min={0}
              max={1000}
              value={zapsReward}
              onChange={(e) => setZapsReward(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <Button size="sm" onClick={submit} disabled={submitDisabled}>
            <Plus className="h-3.5 w-3.5" />{' '}
            {pending ? 'Adding…' : isExpression ? 'Add Expression Challenge' : 'Add challenge'}
          </Button>
          {status === 'created' && <span className="text-xs text-success">Challenge added.</span>}
          {status !== 'idle' && status !== 'created' && <span className="text-xs text-danger">{status}</span>}
        </div>
      </div>
    </div>
  )
}
