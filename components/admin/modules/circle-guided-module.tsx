'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { getCircleAdminData } from '@/app/(main)/circles/admin-actions'
import { redrawCircleAction } from '@/app/(main)/circles/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { WritingQuestions } from '@/components/studio/writing-questions'
import { safeWritingQuestions } from '@/lib/ai/writing-questions'
import { useEntityRailRead } from './entity-rail-data'

export function CircleGuidedModule() {
  const slug = usePathname().match(/^\/circles\/([^/]+)/)?.[1] ?? null
  return slug ? <CircleCoach key={slug} slug={slug} /> : null
}
function CircleCoach({ slug }: { slug: string }) {
  const readAdmin = useEntityRailRead('circle', 'admin', getCircleAdminData)
  const [request, setRequest] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return <section className="space-y-3">
    <p className="text-body-sm text-muted">Think through your Circle with Vera, then make any changes in your own words.</p>
    <Textarea aria-label="What would you like to improve?" value={request} onChange={event => setRequest(event.target.value)} disabled={pending} />
    <Button type="button" disabled={pending} onClick={() => start(async () => {
      setError(null)
      try {
        const circle = await readAdmin(slug)
        if (!circle) { setError('You do not manage this Circle.'); return }
        const result = await redrawCircleAction(circle.id, { directions: request })
        if ('error' in result) { setError(result.error); return }
        setQuestions(safeWritingQuestions(result.data))
      } catch { setError('Could not load your writing prompts. Try again.') }
    })}>{pending ? 'Thinking...' : 'Get writing prompts'}</Button>
    <WritingQuestions questions={questions} />
    {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
  </section>
}
