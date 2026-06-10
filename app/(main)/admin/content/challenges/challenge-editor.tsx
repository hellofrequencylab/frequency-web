'use client'

// Inline editor for the active season's challenges + the create form. Each row
// edits locally and saves through the gated action; completion numbers render
// beside the controls so tuning stays grounded.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Plus } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { updateChallengeAction, createChallengeAction } from '../actions'

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
  started: number
  completed: number
  rate: number
}

const DIFFICULTIES = ['easy', 'normal', 'hard', 'legendary'] as const
const CATEGORIES = ['social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special'] as const

const selectCls = `${fieldClasses} w-auto py-1 text-xs`
const numCls = 'rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text text-right'

function EditorRow({ challenge }: { challenge: ChallengeRow }) {
  const [row, setRow] = useState(challenge)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle')
  const router = useRouter()

  function update(patch: Partial<ChallengeRow>) {
    setRow((r) => ({ ...r, ...patch }))
    setDirty(true)
    setStatus('idle')
  }

  function save() {
    start(async () => {
      const r = await updateChallengeAction(row.id, {
        name: row.name,
        description: row.description,
        difficulty: row.difficulty,
        target: row.target,
        zapsReward: row.zaps_reward,
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

export function ChallengeEditor({ challenges }: { challenges: ChallengeRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="divide-y divide-border/50">
        {challenges.map((c) => (
          <EditorRow key={c.id} challenge={c} />
        ))}
      </div>
    </div>
  )
}

export function ChallengeCreateForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('seasonal')
  const [difficulty, setDifficulty] = useState<string>('normal')
  const [target, setTarget] = useState(1)
  const [zapsReward, setZapsReward] = useState(50)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'created' | string>('idle')
  const router = useRouter()

  function submit() {
    setStatus('idle')
    start(async () => {
      const r = await createChallengeAction({ name, description, category, difficulty, target, zapsReward })
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('created')
        setName('')
        setDescription('')
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ch-name">Name</Label>
          <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Show up three weeks straight" />
        </div>
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
          <Button size="sm" onClick={submit} disabled={pending || !name.trim()}>
            <Plus className="h-3.5 w-3.5" /> {pending ? 'Adding…' : 'Add challenge'}
          </Button>
          {status === 'created' && <span className="text-xs text-success">Challenge added.</span>}
          {status !== 'idle' && status !== 'created' && <span className="text-xs text-danger">{status}</span>}
        </div>
      </div>
    </div>
  )
}
