'use client'

import { useEffect, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { RailManifestFields } from '@/components/admin/rail/rail-manifest-fields'
import { RailManifestRepeat } from '@/components/admin/rail/rail-manifest-repeat'
import type { RepeatRow } from '@/components/admin/rail/rail-field-value'
import { isError } from '@/lib/action-result'
import { PLAN_MAX_LINKS, planTargetDef, type SpacePlan } from '@/lib/calendar/plans'
// The drawer is a rail composed from this declaration (ADR-1468, PROG-CAL2): the eyebrow, the
// section headings and every field come from the manifest, through PLAN_RAIL. No field is declared
// in this file; plan-rail-plan.test.ts fails if one is.
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import { PLAN_RAIL, planStageLabel } from './plan-rail-plan'
import { repeatLabel } from '@/lib/studio/kernel/manifest'
import type { CrmTask } from '@/lib/crm/tasks'
import {
  acceptVeraChecklist,
  addPlanTodo,
  archiveSpacePlan,
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
import { shortDateLabel } from '@/lib/calendar/short-date'
import type { VeraPlanProposal } from '@/lib/calendar/vera-plan'

export function PlanDrawer({
  slug,
  plan,
  entryId,
  open,
  onClose,
  onSaved,
  onArchived,
  deepSettingsHref,
}: {
  slug: string
  plan: SpacePlan | null
  entryId?: string | null
  open: boolean
  onClose: () => void
  onSaved?: (planId: string, stage: SpacePlan['stage']) => void
  /** The Plan was put away (HYG-120): drop it, and its tentative dates, from every view. */
  onArchived?: (planId: string) => void
  deepSettingsHref?: string
}) {
  const [pending, start] = useTransition()
  // The manifest fields' values, keyed by manifest path, and the one repeat's rows. Both are built
  // from the Plan by helpers below so the key-reset block and the initial state cannot drift.
  const [values, setValues] = useState<Record<string, string>>(() => planValues(plan))
  const [links, setLinks] = useState<RepeatRow[]>(() => planLinkRows(plan))
  const [todoTitle, setTodoTitle] = useState('')
  // RELATIVE SCHEDULING (ADR-1386 P5). '' means this to-do has a fixed date, or none: the offset is
  // opt-in, because a checklist where every row must be anchored is a worse checklist.
  const [todoOffsetDays, setTodoOffsetDays] = useState('')
  const [todoOffsetDir, setTodoOffsetDir] = useState<'before' | 'after'>('before')
  const [todos, setTodos] = useState<CrmTask[]>([])
  // READINESS IS NULL UNTIL IT IS KNOWN (LIVE-467). An empty list read as "Ready for the next step"
  // for the whole round trip planReadiness took, and for good once it failed, because the call had
  // no catch. Null is "Checking"; a failed read says so instead of saying ready.
  const [gaps, setGaps] = useState<string[] | null>(null)
  const [readinessFailed, setReadinessFailed] = useState(false)
  const [href, setHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** What the last action did, for the buttons that used to write a row and say nothing. */
  const [notice, setNotice] = useState<string | null>(null)
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
    setValues(planValues(plan))
    setLinks(planLinkRows(plan))
    setProposal(null)
    setTodoTitle('')
    setTodoOffsetDays('')
    setTodoOffsetDir('before')
    setTodos([])
    setGaps(null)
    setReadinessFailed(false)
    setHref(null)
    setError(null)
    setNotice(null)
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
    planReadiness(slug, plan.id, entryId ?? null)
      .then((r) => {
        if (!live) return
        setGaps(r.gaps)
        setReadinessFailed(false)
        setHref(r.href)
      })
      .catch(() => {
        if (!live) return
        setGaps(null)
        setReadinessFailed(true)
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
  const refreshReadiness = async (planId: string) => {
    try {
      const next = await planReadiness(slug, planId, entryId ?? null)
      setGaps(next.gaps)
      setReadinessFailed(false)
      setHref(next.href)
    } catch {
      setGaps(null)
      setReadinessFailed(true)
    }
  }
  const refresh = async (planId: string) => {
    setTodos(await listPlanTodos(slug, planId))
    await refreshReadiness(planId)
  }

  // ADD A TO-DO (LIVE-467). One function for the Add button and for Enter in the to-do inputs. Those
  // inputs sit inside the Save Plan form, so Enter used to submit it and close the drawer with the
  // to-do never added; Enter now adds the to-do and nothing else.
  const addTodo = () => {
    if (!plan || pending || !todoTitle.trim()) return
    setError(null)
    start(async () => {
      const res = await addPlanTodo(slug, plan.id, todoTitle, null, offsetFromForm(todoOffsetDays, todoOffsetDir))
      if (isError(res)) setError(res.error)
      else {
        setTodoTitle('')
        setTodoOffsetDays('')
        await refresh(plan.id)
      }
    })
  }
  const enterAddsTodo = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    addTodo()
  }
  /** Enter in a text field that is not the Plan itself never saves and closes the drawer. */
  const enterDoesNothing = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault()
  }

  const readinessLabel = readinessFailed
    ? 'Could not be checked'
    : gaps === null
      ? 'Checking'
      : gaps.length === 0
        ? 'Ready for the next step'
        : `${gaps.length} ${gaps.length === 1 ? 'item' : 'items'} still needed`

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

  const save = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const stage = (values.stage || plan.stage) as SpacePlan['stage']
      const res = await saveSpacePlan(slug, plan.id, {
        title: values.title ?? '',
        notes: values.notes ?? '',
        stage,
        targetKind: values.targetKind ?? plan.targetKind,
        // The repeat's rows, as the action's PlanLink shape. parsePlanLinks keeps only http(s) urls
        // and caps at PLAN_MAX_LINKS; the control's `max` stops Add at the same cap.
        links: links.map((row) => ({ url: row.url ?? '', label: row.label ?? '' })),
      })
      if (isError(res)) setError(res.error)
      else {
        onSaved?.(plan.id, stage)
        onClose()
      }
    })
  }

  function archive() {
    if (!plan) return
    if (
      !window.confirm(
        'Archive this Plan? Its penciled dates go with it. A date that already became an event keeps the event. There is no restore button yet, so if you change your mind, ask us and we can bring it back.',
      )
    )
      return
    setError(null)
    start(async () => {
      const res = await archiveSpacePlan(slug, plan.id)
      if (isError(res)) setError(res.error)
      else {
        onArchived?.(plan.id)
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="plan-drawer-title" className="max-w-lg">
      <form onSubmit={save} className="space-y-4 rounded-card border border-border bg-surface p-6 lift-3">
        <div className="space-y-3" data-plan-production-summary>
          <div>
            <p className="text-meta font-semibold uppercase tracking-wide text-muted">{SPACE_PLAN_MANIFEST.label}</p>
            <h2 id="plan-drawer-title" className="text-lead font-bold text-text">{plan.title}</h2>
            <p className="text-meta text-muted">{planTargetDef(plan.targetKind).label} production record</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-control border border-border bg-surface-elevated p-3 text-body-sm">
            <div><dt className="text-meta text-muted">Stage</dt><dd className="font-semibold text-text">{planStageLabel(values.stage || plan.stage)}</dd></div>
            <div><dt className="text-meta text-muted">Owner</dt><dd className="font-semibold text-text">{plan.ownerProfileId ? 'Assigned teammate' : 'Unassigned'}</dd></div>
            <div className="col-span-2"><dt className="text-meta text-muted">Readiness</dt><dd className="font-semibold text-text" data-plan-readiness={readinessFailed ? 'failed' : gaps === null ? 'checking' : 'known'}>{readinessLabel}</dd></div>
            <div className="col-span-2"><dt className="text-meta text-muted">Next action</dt><dd className="font-semibold text-text">{href ? 'Open the production Studio' : gaps?.[0] ?? 'Keep the Plan current'}</dd></div>
          </dl>
          {readinessFailed && (
            <p className="text-body-sm text-muted">Readiness could not be checked. Close the Plan and open it again.</p>
          )}
          {gaps && gaps.length > 0 && (
            <div className="rounded-control bg-info-bg px-3 py-2 text-body-sm text-info">
              <p className="font-medium">Still needed before this can go live</p>
              <ul className="mt-1 list-disc pl-5">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
          {deepSettingsHref && <Link href={deepSettingsHref} className="inline-flex text-body-sm font-semibold text-primary-strong hover:underline">Open deep settings</Link>}
        </div>

        {/* THE MANIFEST FORM (PROG-CAL2). Field order, labels, kinds and option lists are
            SPACE_PLAN_MANIFEST's; the ids keep the `plan-` prefix the e2e spec and the workspace
            render test point at. Stage sits beside "Production opens" because both are short kinds
            and RailManifestFields pairs consecutive short fields, not because this file says so. */}
        {PLAN_RAIL.fields.length > 0 && (
          <div className="space-y-3">
            {SPACE_PLAN_MANIFEST.sections?.[0] && (
              <p className={labelClasses}>{SPACE_PLAN_MANIFEST.sections[0].title}</p>
            )}
            <RailManifestFields
              idPrefix="plan-"
              fields={PLAN_RAIL.fields}
              values={values}
              onChange={(path, next) => setValues((v) => ({ ...v, [path]: next }))}
              disabled={pending}
            />
          </div>
        )}
        {PLAN_RAIL.repeats.map((def) => (
          <div key={def.arrayPath} className="space-y-2">
            <p className={labelClasses}>{repeatLabel(def)}</p>
            <RailManifestRepeat def={def} rows={links} onChange={setLinks} max={PLAN_MAX_LINKS} disabled={pending} />
            {/* parsePlanLinks drops anything that is not http(s) without a word, and the repeat has
                no per-row error channel yet; this line is the honest substitute. */}
            <p className="text-meta text-muted">Web addresses starting with http:// or https://.</p>
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
                        {t.dueAt ? ` · ${shortDateLabel(t.dueAt)}` : ''}
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
              onKeyDown={enterAddsTodo}
              placeholder="Add a to-do"
            />
            <Button type="button" size="sm" variant="secondary" disabled={pending || !todoTitle.trim()} onClick={addTodo}>
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
                onKeyDown={enterAddsTodo}
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
                    await refreshReadiness(plan.id)
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
          {/* Both write or read on a round trip, so both wait it out (LIVE-467): unguarded, a second
              tap on Run it again made a second Plan, and Ask Vera asked twice. */}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null)
              setNotice(null)
              start(async () => {
                const res = await runPlanAgain(slug, plan.id)
                if (isError(res)) setError(res.error)
                else setNotice(`New Plan started: "${res.data.title}". Find it on Workflow under Pencil.`)
              })
            }}
          >
            Run it again
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
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
              <p className="mt-2 text-muted">Dates to try: {proposal.suggestedDayKeys.map((d) => shortDateLabel(d)).join(' · ')}</p>
            )}
            {proposal.recap && <p className="mt-2">{proposal.recap}</p>}
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={pending}
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
              onKeyDown={enterDoesNothing}
              placeholder="Space id"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !guestSpaceId.trim()}
              onClick={() => {
                setError(null)
                setNotice(null)
                start(async () => {
                  const res = await sharePlanWithSpace(slug, plan.id, guestSpaceId)
                  if (isError(res)) setError(res.error)
                  else {
                    setGuestSpaceId('')
                    setNotice('Shared. That Space can open this Plan now.')
                  }
                })
              }}
            >
              Share
            </Button>
          </div>
        </div>

        {notice && (
          <p role="status" className="text-body-sm text-text" data-plan-notice>
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The way out for a Plan started by mistake (HYG-120). Reversible in SQL, not yet in the
              UI, and the confirm says so rather than promising a restore button that does not exist. */}
          <Button type="button" variant="dangerOutline" size="sm" disabled={pending} onClick={archive}>
            Archive Plan
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
              Close
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving' : 'Save Plan'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

/** The manifest fields' current values, from the Plan. Null columns read as empty. */
function planValues(plan: SpacePlan | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of PLAN_RAIL.fields) {
    const v = plan ? (plan as unknown as Record<string, unknown>)[f.path] : null
    out[f.path] = typeof v === 'string' ? v : v == null ? '' : String(v)
  }
  return out
}

/** The Plan's links as the repeat control's rows. */
function planLinkRows(plan: SpacePlan | null): RepeatRow[] {
  return (plan?.links ?? []).map((l) => ({ url: l.url, label: l.label }))
}
