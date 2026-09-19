'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { PLAN_STAGES, PLAN_TARGETS, type SpacePlan } from '@/lib/calendar/plans'
import type { CrmTask } from '@/lib/crm/tasks'
import {
  acceptVeraChecklist,
  addPlanTodo,
  listPlanTodos,
  planReadiness,
  runPlanAgain,
  saveSpacePlan,
  sharePlanWithSpace,
  veraPlanProposal,
} from './plan-actions'
import type { VeraPlanProposal } from '@/lib/calendar/vera-plan'

export function PlanDrawer({
  slug,
  plan,
  entryId,
  open,
  onClose,
}: {
  slug: string
  plan: SpacePlan | null
  entryId?: string | null
  open: boolean
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(plan?.title ?? '')
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [stage, setStage] = useState(plan?.stage ?? 'plan')
  const [targetKind, setTargetKind] = useState(plan?.targetKind ?? 'event')
  const [todoTitle, setTodoTitle] = useState('')
  const [todos, setTodos] = useState<CrmTask[]>([])
  const [gaps, setGaps] = useState<string[]>([])
  const [href, setHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<VeraPlanProposal | null>(null)
  const [guestSpaceId, setGuestSpaceId] = useState('')

  useEffect(() => {
    setTitle(plan?.title ?? '')
    setNotes(plan?.notes ?? '')
    setStage(plan?.stage ?? 'plan')
    setTargetKind(plan?.targetKind ?? 'event')
    setProposal(null)
  }, [plan])

  useEffect(() => {
    if (!open || !plan) return
    listPlanTodos(slug, plan.id).then(setTodos).catch(() => setTodos([]))
    planReadiness(slug, plan.id, entryId ?? null).then((r) => {
      setGaps(r.gaps)
      setHref(r.href)
    })
  }, [open, plan, slug, entryId])

  if (!plan) return null

  const save = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await saveSpacePlan(slug, plan.id, { title, notes, stage, targetKind })
      if (isError(res)) setError(res.error)
      else onClose()
    })
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="plan-drawer-title" className="max-w-lg">
      <form onSubmit={save} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
        <h2 id="plan-drawer-title" className="text-lead font-bold text-text">
          {plan.title}
        </h2>
        <p className="text-meta text-muted">The working record behind the dates on this calendar.</p>

        {gaps.length > 0 && (
          <div className="rounded-control bg-info-bg px-3 py-2 text-body-sm text-info">
            <p className="font-medium">Still needed before this can go live</p>
            <ul className="mt-1 list-disc pl-5">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-1">
          <label htmlFor="plan-title" className={labelClasses}>
            Title
          </label>
          <Input id="plan-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label htmlFor="plan-stage" className={labelClasses}>
              Stage
            </label>
            <Select
              id="plan-stage"
              value={stage}
              options={PLAN_STAGES.map((s) => ({
                value: s,
                label: s === 'plan' ? 'Plan' : s === 'pencil' ? 'Pencil' : 'Production',
              }))}
              onChange={(e) => setStage(e.target.value as typeof stage)}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor="plan-target" className={labelClasses}>
              Production opens
            </label>
            <Select
              id="plan-target"
              value={targetKind}
              options={PLAN_TARGETS.map((s) => ({
                value: s,
                label: s === 'event' ? 'Event' : s === 'journey' ? 'Journey' : s === 'program' ? 'Program' : 'Maintenance',
              }))}
              onChange={(e) => setTargetKind(e.target.value as typeof targetKind)}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <label htmlFor="plan-notes" className={labelClasses}>
            Notes
          </label>
          <Textarea id="plan-notes" rows={5} maxLength={20000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="space-y-2">
          <p className={labelClasses}>To-dos</p>
          <ul className="space-y-1 text-body-sm text-text">
            {todos.map((t) => (
              <li key={t.id}>
                {t.title}
                {t.dueAt ? ` · ${t.dueAt.slice(0, 10)}` : ''}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              aria-label="New to-do"
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
              placeholder="Add a to-do"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !todoTitle.trim()}
              onClick={() =>
                start(async () => {
                  const res = await addPlanTodo(slug, plan.id, todoTitle)
                  if (!isError(res)) {
                    setTodoTitle('')
                    setTodos(await listPlanTodos(slug, plan.id))
                  }
                })
              }
            >
              Add
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {href && (
            <Button asChild size="sm">
              <Link href={href}>Make it a Production</Link>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              start(async () => {
                const res = await runPlanAgain(slug, plan.id)
                if (isError(res)) setError(res.error)
              })
            }
          >
            Run it again
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              start(async () => {
                setProposal(await veraPlanProposal(slug, plan.id))
              })
            }
          >
            Ask Vera
          </Button>
        </div>

        {proposal && (
          <div className="rounded-control border border-border px-3 py-2 text-body-sm">
            <p className="font-medium">Proposal. Nothing here is published.</p>
            <ul className="mt-1 list-disc pl-5">
              {proposal.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {proposal.suggestedDayKeys.length > 0 && (
              <p className="mt-2 text-muted">Dates to try: {proposal.suggestedDayKeys.join(', ')}</p>
            )}
            {proposal.recap && <p className="mt-2">{proposal.recap}</p>}
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() =>
                start(async () => {
                  await acceptVeraChecklist(slug, plan.id, proposal.checklist)
                  setProposal(null)
                  setTodos(await listPlanTodos(slug, plan.id))
                })
              }
            >
              Add these to-dos
            </Button>
          </div>
        )}

        <div className="grid gap-1">
          <label htmlFor="plan-share" className={labelClasses}>
            Share with a co-host Space
          </label>
          <div className="flex gap-2">
            <Input
              id="plan-share"
              value={guestSpaceId}
              onChange={(e) => setGuestSpaceId(e.target.value)}
              placeholder="Space id"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                start(async () => {
                  const res = await sharePlanWithSpace(slug, plan.id, guestSpaceId)
                  if (isError(res)) setError(res.error)
                  else setGuestSpaceId('')
                })
              }
            >
              Share
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Close
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving' : 'Save Plan'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
