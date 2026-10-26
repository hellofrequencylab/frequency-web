'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { reviewWinbackCoaching } from '@/app/(main)/admin/marketing/agent/actions'
import type { WinbackCoaching } from '@/lib/studio/winback'

/** Review text only. No editor/draft callback, form submission, autosave or message insertion. */
export function WinbackCoachingReview() {
  const [review, setReview] = useState<WinbackCoaching | null>(null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState('')
  return <div className="space-y-3">
    <p className="text-body-sm text-muted">The invitation uses an existing operational template. Vera can help you review your approach; coaching is not saved to the proposal or sent to a member.</p>
    <Button type="button" variant="secondary" disabled={pending} onClick={() => {
      setReview(null); setNotice('')
      startTransition(async () => {
        try { const result = await reviewWinbackCoaching(); if (result) setReview(result); else setNotice('Marketing permission is required to review this approach.') }
        catch { setNotice('Coaching is unavailable. Review the template and consent before approving.') }
      })
    }}>{pending ? 'Reviewing…' : 'Review my approach'}</Button>
    {review && <div role="status" className="space-y-2 text-body-sm"><p>{review.source === 'checklist' ? 'Guided checklist; AI was not used.' : 'Operator coaching questions'}</p><ul>{review.questions.map(question => <li key={question}>{question}</li>)}</ul></div>}
    <p role="status" aria-live="polite">{notice}</p>
  </div>
}
