'use client'

// Inline editor for the active season's challenges + the create form. Each row
// edits locally and saves through the gated action; completion numbers render
// beside the controls so tuning stays grounded.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Plus, Mountain, ChevronUp, ChevronDown, Trash2, Eye, EyeOff, Pencil } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import {
  updateChallengeAction,
  createChallengeAction,
  deleteChallengeAction,
  moveChallengeAction,
  type ExpressionJourneyOption,
} from '../actions'

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
  is_active: boolean
  /** Set when this is an Expression Challenge — the Journey it caps. */
  journey_id: string | null
  started: number
  completed: number
  rate: number
}

const DIFFICULTIES = ['easy', 'normal', 'hard', 'legendary'] as const
const CATEGORIES = ['social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special'] as const

// ── The popup edit form for one challenge (shown in the shared Studio window) ──
function ChallengeEditForm({
  challenge,
  journeys,
  onClose,
}: {
  challenge: ChallengeRow
  journeys: ExpressionJourneyOption[]
  onClose: () => void
}) {
  const [row, setRow] = useState(challenge)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const isExpression = challenge.journey_id != null

  function update(patch: Partial<ChallengeRow>) {
    setRow((r) => ({ ...r, ...patch }))
    setDirty(true)
    setError(null)
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
        // Category only applies to a season-wide challenge (Expression is always 'special').
        ...(isExpression ? {} : { category: row.category }),
        // Only send journeyId when an Expression row's Journey actually changed.
        ...(journeyChanged ? { journeyId: row.journey_id! } : {}),
      })
      if (isError(r)) setError(r.error)
      else {
        setDirty(false)
        router.refresh()
        onClose()
      }
    })
  }

  return (
    <StudioWindow
      open
      onClose={onClose}
      eyebrow={isExpression ? 'Studio · Expression Challenge' : 'Studio · Challenge'}
      footer={
        <StudioFooter
          left={
            error ? (
              <span className="text-xs text-danger">{error}</span>
            ) : (
              <span className="text-xs text-subtle">
                {row.completed}/{row.started} completed{row.started > 0 ? ` · ${row.rate}%` : ''}
              </span>
            )
          }
        >
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </StudioFooter>
      }
    >
      <div className="space-y-3">
        {isExpression && (
          <div className="space-y-1">
            <Label htmlFor="edit-ch-journey">Caps which Journey</Label>
            <select
              id="edit-ch-journey"
              value={row.journey_id ?? ''}
              onChange={(e) => update({ journey_id: e.target.value })}
              className={fieldClasses}
            >
              {!journeys.some((j) => j.id === row.journey_id) && row.journey_id && (
                <option value={row.journey_id}>Current Journey</option>
              )}
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="edit-ch-name">Name</Label>
          <Input id="edit-ch-name" value={row.name} onChange={(e) => update({ name: e.target.value })} />
        </div>

        {!isExpression && (
          <div className="space-y-1">
            <Label htmlFor="edit-ch-cat">Category</Label>
            <select
              id="edit-ch-cat"
              value={row.category}
              onChange={(e) => update({ category: e.target.value })}
              className={fieldClasses}
            >
              {CATEGORIES.filter((c) => c !== 'special').map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="edit-ch-desc">Description</Label>
          <Textarea id="edit-ch-desc" rows={3} value={row.description} onChange={(e) => update({ description: e.target.value })} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="edit-ch-diff">Difficulty</Label>
            <select id="edit-ch-diff" value={row.difficulty} onChange={(e) => update({ difficulty: e.target.value })} className={fieldClasses}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-ch-target">Target</Label>
            <Input id="edit-ch-target" type="number" min={1} max={10000} value={row.target} onChange={(e) => update({ target: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-ch-zaps">Zap reward</Label>
            <Input id="edit-ch-zaps" type="number" min={0} max={1000} value={row.zaps_reward} onChange={(e) => update({ zaps_reward: Number(e.target.value) })} />
          </div>
        </div>
      </div>
    </StudioWindow>
  )
}

// ── One challenge in the list: a compact summary + quick controls + the Edit popup ──
function ChallengeListItem({
  challenge,
  journeys,
  index,
  total,
}: {
  challenge: ChallengeRow
  journeys: ExpressionJourneyOption[]
  index: number
  total: number
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [active, setActive] = useState(challenge.is_active)
  const [acting, act] = useTransition()
  const router = useRouter()
  const isExpression = challenge.journey_id != null

  function toggleActive() {
    act(async () => {
      const next = !active
      const r = await updateChallengeAction(challenge.id, { isActive: next })
      if (!isError(r)) {
        setActive(next)
        router.refresh()
      }
    })
  }
  function move(dir: 'up' | 'down') {
    act(async () => {
      const r = await moveChallengeAction(challenge.id, dir)
      if (!isError(r)) router.refresh()
    })
  }
  function remove() {
    act(async () => {
      const r = await deleteChallengeAction(challenge.id)
      if (!isError(r)) router.refresh()
    })
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${active ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{challenge.name}</span>
          {isExpression ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
              <Mountain className="h-3 w-3" /> Expression
            </span>
          ) : (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium capitalize text-muted">
              {challenge.category}
            </span>
          )}
          <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium capitalize text-subtle">
            {challenge.difficulty}
          </span>
          {!active && <span className="rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-medium text-warning">Paused</span>}
        </div>
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-subtle">
          target {challenge.target} · <Zap className="h-3 w-3 text-primary" /> {challenge.zaps_reward} ·{' '}
          {challenge.completed}/{challenge.started} done{challenge.started > 0 ? ` (${challenge.rate}%)` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={toggleActive}
          disabled={acting}
          title={active ? 'Active — click to pause' : 'Paused — click to activate'}
          className={`rounded-md border border-border p-1.5 transition-colors disabled:opacity-50 ${
            active ? 'text-success hover:bg-success/10' : 'text-muted hover:bg-surface-elevated'
          }`}
        >
          {active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => move('up')}
          disabled={acting || index === 0}
          aria-label="Move up"
          className="rounded-md border border-border p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => move('down')}
          disabled={acting || index === total - 1}
          aria-label="Move down"
          className="rounded-md border border-border p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={acting}
          aria-label={`Delete ${challenge.name}`}
          title="Delete"
          className="rounded-md border border-border p-1.5 text-subtle transition-colors hover:border-danger/40 hover:bg-danger-bg hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <ChallengeEditForm challenge={challenge} journeys={journeys} onClose={() => setEditing(false)} />
      )}

      <DangerModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete challenge"
        body={
          <>
            This removes <span className="font-semibold text-text">{challenge.name}</span> from the season
            board for everyone, along with members&apos; progress on it. This cannot be undone.
          </>
        }
        confirmLabel="Delete challenge"
        requireTyping={challenge.name}
        onConfirm={remove}
      />
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
        {challenges.map((c, i) => (
          <ChallengeListItem key={c.id} challenge={c} journeys={journeys} index={i} total={challenges.length} />
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

export function ChallengeCreateForm({ journeys, onCreated }: { journeys: ExpressionJourneyOption[]; onCreated?: () => void }) {
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
        onCreated?.()
      }
    })
  }

  const submitDisabled = pending || !name.trim() || (isExpression && !journeyId)

  return (
    <div>
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

// "Add challenge" — launches the create form in the shared Studio popup (parity with every other
// Add surface), instead of an always-on inline form. Closes on a successful create.
export function ChallengeCreateLauncher({ journeys }: { journeys: ExpressionJourneyOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" /> Add challenge
      </button>
      {open && (
        <StudioWindow open onClose={() => setOpen(false)} eyebrow="Studio · Challenge">
          <ChallengeCreateForm journeys={journeys} onCreated={() => setOpen(false)} />
        </StudioWindow>
      )}
    </>
  )
}
