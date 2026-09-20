'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, labelClasses } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import type { SpacePlan } from '@/lib/calendar/plans'
import type { PlanPlaybook } from '@/lib/calendar/playbooks'
import { PlanBoard } from './plan-board'
import { PlanDrawer } from './plan-drawer'
import {
  rotatePrivateCalendarFeed,
  savePlaybook,
  saveSpacePlan,
  startPlanFromPlaybook,
} from './plan-actions'

export function CalendarPlansPanel({
  slug,
  spaceId,
  plans,
  playbooks,
  initialPlanId,
}: {
  slug: string
  spaceId: string
  plans: SpacePlan[]
  playbooks: PlanPlaybook[]
  initialPlanId?: string | null
}) {
  const [pending, start] = useTransition()
  const [openPlan, setOpenPlan] = useState<SpacePlan | null>(() => plans.find((plan) => plan.id === initialPlanId) ?? null)
  const [title, setTitle] = useState('')
  const [bookTitle, setBookTitle] = useState('')
  const [bookTasks, setBookTasks] = useState('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-4 pt-2">
      <SectionHeader title="Plans" count={plans.length} />
      <p className="text-body-sm text-muted">
        A Plan is the working record behind dates on their way. Someday Plans with no dates live here too.
      </p>
      <PlanBoard spaceId={spaceId} plans={plans} onOpen={setOpenPlan} />
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="New Plan title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Someday idea"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || !title.trim()}
          onClick={() =>
            start(async () => {
              const res = await saveSpacePlan(slug, null, { title })
              if (isError(res)) setError(res.error)
              else setTitle('')
            })
          }
        >
          Start a Plan
        </Button>
      </div>

      <SectionHeader title="Playbooks" />
      <ul className="space-y-1 text-body-sm">
        {playbooks.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2">
            <span>{b.title}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                start(async () => {
                  const res = await startPlanFromPlaybook(slug, b.id)
                  if (isError(res)) setError(res.error)
                })
              }
            >
              Start from this
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor="playbook-title" className={labelClasses}>
            Playbook title
          </label>
          <Input id="playbook-title" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="playbook-tasks" className={labelClasses}>
            To-dos, one per line
          </label>
          <Textarea id="playbook-tasks" rows={3} value={bookTasks} onChange={(e) => setBookTasks(e.target.value)} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || !bookTitle.trim()}
        onClick={() =>
          start(async () => {
            const res = await savePlaybook(slug, {
              title: bookTitle,
              eventType: 'workshop',
              taskTitles: bookTasks.split('\n').map((t) => t.trim()).filter(Boolean),
              notes: null,
            })
            if (isError(res)) setError(res.error)
            else {
              setBookTitle('')
              setBookTasks('')
            }
          })
        }
      >
        Save playbook
      </Button>

      <SectionHeader title="Private team feed" />
      <p className="text-body-sm text-muted">
        A secret link for your team calendar. It is never on the public Space page. Rotate it if it leaks.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() =>
          start(async () => {
            const res = await rotatePrivateCalendarFeed(slug)
            if (isError(res)) setError(res.error)
            else setFeedUrl(`${window.location.origin}/calendar/private/${res.data.token}`)
          })
        }
      >
        Make a private feed
      </Button>
      {feedUrl && <p className="break-all text-body-sm text-text">{feedUrl}</p>}
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      <PlanDrawer slug={slug} plan={openPlan} open={openPlan !== null} onClose={() => setOpenPlan(null)} />
    </div>
  )
}
