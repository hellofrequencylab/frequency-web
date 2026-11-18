'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2 } from 'lucide-react'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { isError, type ActionResult } from '@/lib/action-result'
import type { JourneyGuide } from '@/lib/journeys/guides'
import { addJourneyGuideAction, removeJourneyGuideAction } from '@/app/(main)/spaces/[slug]/journeys/guide-actions'

// JOURNEY GUIDES (owner 2026-11-17) on the Space's Journeys manager: name the people who lead each Journey.
// Guides are credited on the Journey page and may host live cohorts (Runs) of it in this Space. They do not
// edit it. With no guides, the Journey page shows this Space as the guide. The server actions are the
// authority; this only renders what the page already gated. No em dashes.

export function GuidesPanel({
  journeys,
  guides,
}: {
  journeys: Array<{ id: string; title: string }>
  guides: Record<string, JourneyGuide[]>
}) {
  const router = useRouter()
  const [planId, setPlanId] = useState(journeys[0]?.id ?? '')
  const [handle, setHandle] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (journeys.length === 0) return null

  function run(task: () => Promise<ActionResult>, done: string) {
    if (pending) return
    start(async () => {
      setError(null)
      setNotice(null)
      const res = await task()
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice(done)
      router.refresh()
    })
  }

  const add = () =>
    run(async () => {
      const res = await addJourneyGuideAction({ planId, handle })
      if (!isError(res)) setHandle('')
      return res
    }, 'Guide added. They show on the Journey page and can host a Run of it here.')

  const withGuides = journeys.filter((j) => (guides[j.id] ?? []).length > 0)

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-subtle" aria-hidden />
        <h2 className="text-body-sm font-bold text-text">Guides</h2>
      </div>
      <p className="mb-3 text-meta text-subtle">
        Name the people who lead a Journey. Guides are credited on its page and can host a live Run of it in this Space.
        They cannot edit it. A Journey with no guides shows this Space as its guide.
      </p>

      {withGuides.length > 0 && (
        <ul className="mb-3 space-y-2">
          {withGuides.map((j) => (
            <li key={j.id} className="text-body-sm">
              <span className="font-medium text-text">{j.title}</span>
              <span className="mt-1 flex flex-wrap gap-2">
                {(guides[j.id] ?? []).map((g) => (
                  <span key={g.profileId} className="inline-flex items-center gap-2 rounded-control border border-border px-2 py-1">
                    <span className="text-text">{g.displayName}</span>
                    <span className="text-subtle">@{g.handle}</span>
                    <button
                      type="button"
                      className="text-meta font-medium text-subtle hover:text-text"
                      disabled={pending}
                      aria-label={`Remove ${g.displayName} as a guide of ${j.title}`}
                      onClick={() => run(() => removeJourneyGuideAction({ planId: j.id, profileId: g.profileId }), 'Guide removed.')}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Journey" className="min-w-0 flex-1 basis-48">
          <Select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            aria-label="Journey to add a guide to"
            options={journeys.map((j) => ({ value: j.id, label: j.title }))}
          />
        </Field>
        <Field label="Their handle" className="min-w-0 flex-1 basis-48">
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && planId && handle.trim()) add()
            }}
          />
        </Field>
        <Button type="button" disabled={!planId || !handle.trim() || pending} onClick={add}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          Add guide
        </Button>
      </div>
      {error && <p className="mt-2 text-body-sm font-medium text-danger">{error}</p>}
      {notice && !error && <p className="mt-2 text-body-sm font-medium text-success">{notice}</p>}
    </section>
  )
}
