'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { StageTimeline } from '@/components/ui/stage-timeline'
import { RailManifestFields } from '@/components/admin/rail/rail-manifest-fields'
import { RailManifestRepeat } from '@/components/admin/rail/rail-manifest-repeat'
import type { RepeatRow } from '@/components/admin/rail/rail-field-value'
import { isError } from '@/lib/action-result'
import { PLAN_LINKS_MAX, parsePlanLinks, planStageDef, planStage, planTargetDef, type SpacePlan } from '@/lib/calendar/plans'
import { planStageTimeline } from '@/lib/calendar/stage-timeline'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import {
  PLAN_FIELDS_AFTER_STAGE,
  PLAN_FIELDS_BEFORE_STAGE,
  PLAN_RAIL,
  planLinkRows,
  planLinksFromRows,
} from './plan-rail-plan'
import type { CrmTask } from '@/lib/crm/tasks'
import {
  acceptVeraChecklist,
  addPlanTodo,
  attachEventToPlan,
  listPlanLinkableEvents,
  listPlanTodos,
  planReadiness,
  reanchorPlanTodos,
  runPlanAgain,
  saveSpacePlan,
  setPlanTodoDone,
  sharePlanWithSpace,
  veraPlanProposal,
} from './plan-actions'
import { describeOffset, offsetFromForm } from '@/lib/calendar/relative-schedule'
import type { VeraPlanProposal } from '@/lib/calendar/vera-plan'

export function PlanDrawer({
  slug,
  plan,
  entryId,
  open,
  onClose,
  onSaved,
  deepSettingsHref,
}: {
  slug: string
  plan: SpacePlan | null
  entryId?: string | null
  open: boolean
  onClose: () => void
  onSaved?: (planId: string, stage: SpacePlan['stage']) => void
  deepSettingsHref?: string
}) {
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(plan?.title ?? '')
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [stage, setStage] = useState(plan?.stage ?? 'plan')
  const [targetKind, setTargetKind] = useState(plan?.targetKind ?? 'event')
  // The manifest's `links` collection, as the repeat control's rows (PROG-CAL2, ADR-1521). It was
  // declared, parsed and written `[]` forever, because nothing in the product could type one.
  const [links, setLinks] = useState<RepeatRow[]>(() => planLinkRows(plan?.links))
  const [todoTitle, setTodoTitle] = useState('')
  // RELATIVE SCHEDULING (ADR-1386 P5). '' means this to-do has a fixed date, or none: the offset is
  // opt-in, because a checklist where every row must be anchored is a worse checklist.
  const [todoOffsetDays, setTodoOffsetDays] = useState('')
  const [todoOffsetDir, setTodoOffsetDir] = useState<'before' | 'after'>('before')
  const [todos, setTodos] = useState<CrmTask[]>([])
  const [gaps, setGaps] = useState<string[]>([])
  const [href, setHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<VeraPlanProposal | null>(null)
  const [guestSpaceId, setGuestSpaceId] = useState('')
  const [linkableEvents, setLinkableEvents] = useState<
    { id: string; title: string; whenLabel: string; planId: string | null }[]
  >([])
  const [linkEventId, setLinkEventId] = useState('')
  const planKey = plan?.id ?? ''
  const [syncedKey, setSyncedKey] = useState(planKey)
  if (planKey !== syncedKey) {
    setSyncedKey(planKey)
    setTitle(plan?.title ?? '')
    setNotes(plan?.notes ?? '')
    setStage(plan?.stage ?? 'plan')
    setTargetKind(plan?.targetKind ?? 'event')
    setLinks(planLinkRows(plan?.links))
    setProposal(null)
    setTodoTitle('')
    setTodoOffsetDays('')
    setTodoOffsetDir('before')
    setTodos([])
    setGaps([])
    setHref(null)
    setError(null)
    setGuestSpaceId('')
    setLinkableEvents([])
    setLinkEventId('')
  }

  useEffect(() => {
    if (!open || !plan) return
    let live = true
    listPlanTodos(slug, plan.id)
      .then((next) => {
        if (live) setTodos(next)
      })
      .catch(() => {
        if (live) setTodos([])
      })
    planReadiness(slug, plan.id, entryId ?? null).then((r) => {
      if (!live) return
      setGaps(r.gaps)
      setHref(r.href)
    })
    listPlanLinkableEvents(slug)
      .then((next) => {
        if (live) setLinkableEvents(next)
      })
      .catch(() => {
        if (live) setLinkableEvents([])
      })
    return () => {
      live = false
    }
  }, [open, plan, slug, entryId])

  if (!plan) return null

  // One place both halves of the to-do list re-read from: the readiness bar counts OPEN to-dos, so
  // ticking one off has to move the bar in the same pass or the drawer would still say what is
  // missing after the person fixed it.
  const refresh = async (planId: string) => {
    setTodos(await listPlanTodos(slug, planId))
    const next = await planReadiness(slug, planId, entryId ?? null)
    setGaps(next.gaps)
    setHref(next.href)
  }

  const toggleTodo = (todoId: string, done: boolean) => {
    if (!plan) return
    setError(null)
    setTodos((cur) => cur.map((t) => (t.id === todoId ? { ...t, status: done ? 'done' : 'open' } : t)))
    start(async () => {
      const res = await setPlanTodoDone(slug, plan.id, todoId, done)
      if (isError(res)) setError(res.error)
      await refresh(plan.id)
    })
  }

  // THE RAIL'S ONE BAG OF VALUES, keyed by manifest path. The drawer keeps a `useState` per field
  // because its Save is explicit rather than an autosave snapshot; this is only the translation
  // between that state and the kernel's field contract, which is why it is exhaustive and dumb.
  const values: Record<string, string> = { title, notes: notes ?? '', targetKind }
  const setField = (path: string, next: string) => {
    if (path === 'title') setTitle(next)
    else if (path === 'notes') setNotes(next)
    else if (path === 'targetKind') setTargetKind(next as typeof targetKind)
  }

  // Three steps in place of the old Stage select, from `PLAN_STAGE_DEFS` by way of the planner:
  // every label and hint is the registry's, never restated here.
  const timeline = planStageTimeline({ stage })
  const step = (key: string) => {
    const next = planStage(key)
    if (next) setStage(next)
  }

  // The same parser the save action runs, so the count below is the server's answer and not a
  // second opinion about what a link is.
  const dropped = links.length - parsePlanLinks(planLinksFromRows(links)).length

  /** What a declared section holds, in the manifest's own words. The drawer invents no copy for a
   *  collection the manifest already describes. */
  const sectionDesc = (key: string) => SPACE_PLAN_MANIFEST.sections.find((sec) => sec.key === key)?.desc ?? ''

  const save = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await saveSpacePlan(slug, plan.id, { title, notes, stage, targetKind, links: planLinksFromRows(links) })
      if (isError(res)) setError(res.error)
      else {
        onSaved?.(plan.id, stage)
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="plan-drawer-title" className="max-w-lg">
      <form onSubmit={save} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
        <div className="space-y-3" data-plan-production-summary>
          <div>
            <p className="text-meta font-semibold uppercase tracking-wide text-muted">Plan</p>
            <h2 id="plan-drawer-title" className="text-lead font-bold text-text">{plan.title}</h2>
            <p className="text-meta text-muted">{planTargetDef(plan.targetKind).label} production record</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-control border border-border bg-surface-elevated p-3 text-body-sm">
            <div><dt className="text-meta text-muted">Stage</dt><dd className="font-semibold text-text">{planStageDef(stage).label}</dd></div>
            <div><dt className="text-meta text-muted">Owner</dt><dd className="font-semibold text-text">{plan.ownerProfileId ? 'Assigned teammate' : 'Unassigned'}</dd></div>
            <div className="col-span-2"><dt className="text-meta text-muted">Readiness</dt><dd className="font-semibold text-text">{gaps.length === 0 ? 'Ready for the next step' : `${gaps.length} ${gaps.length === 1 ? 'item' : 'items'} still needed`}</dd></div>
            <div className="col-span-2"><dt className="text-meta text-muted">Next action</dt><dd className="font-semibold text-text">{href ? 'Open the production Studio' : gaps[0] ?? 'Keep the Plan current'}</dd></div>
          </dl>
          {gaps.length > 0 && (
            <div className="rounded-control bg-info-bg px-3 py-2 text-body-sm text-info">
              <p className="font-medium">Still needed before this can go live</p>
              <ul className="mt-1 list-disc pl-5">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
          {deepSettingsHref && <Link href={deepSettingsHref} className="inline-flex text-body-sm font-semibold text-primary-strong hover:underline">Open deep settings</Link>}
        </div>

        {/* THE FIELDS ARE THE MANIFEST'S (PROG-CAL2, ADR-1521). Title and Notes are declared before
            `stage`, so they render before the stepper; "Production opens" is declared after it and
            renders after. Adding a field to SPACE_PLAN_MANIFEST puts it here, in its declared place,
            with its declared label and control, which is the Studio contract AGENTS.md states. */}
        <RailManifestFields fields={PLAN_FIELDS_BEFORE_STAGE} values={values} onChange={setField} disabled={pending} />
        {/* THE STAGE TIMELINE, the Plan half (ADR-1520). The same stepper the entry drawer walks a
            date through (ADR-1504), rendering the same kit component from the same plan shape, so
            the product teaches one concept one way. A step writes `stage` into the SAME form state
            the old select wrote, so every field the person has typed survives and the change
            persists on Save exactly as before: nothing auto-saves on click. A Plan has three steps
            and no exit — it leaves through `archived_at` — and its production door is the existing
            "Make it a Production" button, never a fourth step. */}
        <div className="grid gap-1">
          <span className={labelClasses}>Stage</span>
          <StageTimeline
            label="Stage"
            steps={timeline.steps}
            onStep={step}
            hint={timeline.hint}
            hintId="plan-stage-hint"
            reasons={timeline.reasons}
            pending={pending}
          />
          <p className="text-meta text-muted">
            Moving the Plan moves every date on it.
          </p>
        </div>
        <RailManifestFields fields={PLAN_FIELDS_AFTER_STAGE} values={values} onChange={setField} disabled={pending} />

        {/* THE LINKS THE ROW PROMISED (PROG-CAL2). One list editor per declared collection, its rows
            and its per-row controls both from the manifest, capped where `parsePlanLinks` caps. */}
        {PLAN_RAIL.repeats.map((def) => (
          <div key={def.arrayPath} className="grid gap-1">
            <RailManifestRepeat
              def={def}
              rows={links}
              onChange={setLinks}
              max={PLAN_LINKS_MAX}
              empty={`Nothing here yet. ${sectionDesc(def.section)}`}
              disabled={pending}
            />
            {/* A control that accepts a value the server then drops in silence is the failure
                ADR-1307 names, and `parsePlanLinks` drops anything that is not a full web address.
                So the drawer runs the SAME parser to say so first, rather than parsing twice. */}
            {dropped > 0 && (
              <p className="text-meta text-muted">
                {dropped === 1 ? 'One link needs' : `${dropped} links need`} a full web address starting
                with https:// before it can be saved.
              </p>
            )}
          </div>
        ))}

        <div className="space-y-2">
          <p className={labelClasses}>To-dos</p>
          <ul className="space-y-1 text-body-sm text-text">
            {todos.map((t) => {
              // An anchored to-do says so. Without this the list shows a bare date and the person
              // has no way to tell which rows will follow the event when it moves.
              const anchor = describeOffset(t.dueOffsetDays)
              return (
                <li key={t.id}>
                  <Checkbox
                    checked={t.status === 'done'}
                    disabled={pending}
                    onChange={(e) => toggleTodo(t.id, e.target.checked)}
                    label={
                      <span className={t.status === 'done' ? 'text-muted line-through' : undefined}>
                        {t.title}
                        {t.dueAt ? ` · ${t.dueAt.slice(0, 10)}` : ''}
                        {anchor ? <span className="text-muted"> {`· ${anchor} the date`}</span> : null}
                      </span>
                    }
                  />
                </li>
              )
            })}
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
                  const res = await addPlanTodo(
                    slug,
                    plan.id,
                    todoTitle,
                    null,
                    offsetFromForm(todoOffsetDays, todoOffsetDir),
                  )
                  if (isError(res)) setError(res.error)
                  else {
                    setTodoTitle('')
                    setTodoOffsetDays('')
                    await refresh(plan.id)
                  }
                })
              }
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <label htmlFor="plan-todo-offset" className={labelClasses}>
                Due, counting from the date
              </label>
              <Input
                id="plan-todo-offset"
                type="number"
                min={0}
                max={400}
                inputMode="numeric"
                className="w-24"
                value={todoOffsetDays}
                onChange={(e) => setTodoOffsetDays(e.target.value)}
                placeholder="Days"
              />
            </div>
            <Select
              aria-label="Before or after the date"
              className="w-32"
              value={todoOffsetDir}
              options={[
                { value: 'before', label: 'days before' },
                { value: 'after', label: 'days after' },
              ]}
              onChange={(e) => setTodoOffsetDir(e.target.value === 'after' ? 'after' : 'before')}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await reanchorPlanTodos(slug, plan.id)
                  if (isError(res)) setError(res.error)
                  await refresh(plan.id)
                })
              }
            >
              Move to-dos to the date
            </Button>
          </div>
          <p className="text-meta text-muted">
            Leave the days blank for a to-do that stays where you put it. Anything with a count moves
            when the date moves.
          </p>
        </div>

        {/* THE REPAIR DOOR (PROG-CAL3). `plan_id` was create-only: `updateEvent` never touched it and
            nothing could put an event back on its Plan, so one wrong link could only be fixed in
            SQL. An event that is already on another Plan is offered too, labelled, because moving
            one is the same repair. */}
        <div className="grid gap-1">
          <label htmlFor="plan-link-event" className={labelClasses}>
            Link an event already on the calendar
          </label>
          <div className="flex gap-2">
            <Select
              id="plan-link-event"
              value={linkEventId}
              options={[
                { value: '', label: 'Pick an event' },
                ...linkableEvents.map((ev) => ({
                  value: ev.id,
                  label:
                    ev.planId && ev.planId !== plan.id
                      ? `${ev.whenLabel} · ${ev.title} (on another Plan)`
                      : `${ev.whenLabel} · ${ev.title}`,
                })),
              ]}
              onChange={(e) => setLinkEventId(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !linkEventId}
              onClick={() =>
                start(async () => {
                  const res = await attachEventToPlan(slug, plan.id, linkEventId)
                  if (isError(res)) setError(res.error)
                  else {
                    setLinkEventId('')
                    const r = await planReadiness(slug, plan.id, entryId ?? null)
                    setGaps(r.gaps)
                    setHref(r.href)
                  }
                })
              }
            >
              Link it
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
                  const res = await acceptVeraChecklist(slug, plan.id, proposal.checklist)
                  if (isError(res)) setError(res.error)
                  setProposal(null)
                  await refresh(plan.id)
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
