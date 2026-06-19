'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setJourneyOfficialAction } from '../../actions'
import type { AssignableJourney } from './data'

// Assign an EXISTING Journey to this season — files it under the season's Quest (official = true,
// quest_id = questId) via setJourneyOfficialAction, the same write the Journeys-curation control
// uses. Lives in the Season Composer so an operator doesn't have to detour to curation. Janitor /
// curator only (the action re-checks). Assigning a Journey that's official under ANOTHER season
// MOVES it here, so those options say so.
export function AssignJourneyToSeason({ questId, journeys }: { questId: string; journeys: AssignableJourney[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (journeys.length === 0) {
    return (
      <p className="text-xs text-muted">No other Journeys to assign yet. Build one in the Journey editor, then it shows up here.</p>
    )
  }

  function assign() {
    if (!selected) return
    setError(null)
    start(async () => {
      const res = await setJourneyOfficialAction(selected, true, questId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSelected('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-3">
      <label htmlFor="assign-journey" className={labelClasses}>Assign an existing Journey</label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          id="assign-journey"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          className={`${fieldClasses} sm:max-w-sm`}
        >
          <option value="">Choose a Journey…</option>
          {journeys.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.status !== 'approved' ? ` · ${j.status}` : ''}
              {j.inOtherQuest ? ' · in another season' : ''}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={assign} disabled={!selected || pending} className="shrink-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Assign to this season
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      <p className="mt-1.5 text-2xs text-subtle">
        Files the Journey under this season’s Quest. A Journey already in another season moves here.
      </p>
    </div>
  )
}
