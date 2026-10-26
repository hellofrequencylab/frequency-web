'use client'

import { useState, useTransition } from 'react'
import { COACH_PROFILE_FIELDS, type SpaceCoachProfile } from '@/lib/spaces/coach-profile'
import { saveSpaceCoachProfile } from '@/app/(main)/spaces/[slug]/settings/coach/actions'
import { Button } from '@/components/ui/button'
import { Textarea, Label } from '@/components/ui/field'
import { isError } from '@/lib/action-result'

export function CoachProfileForm({ spaceId, initial, readOnly = false }: { spaceId: string; initial: SpaceCoachProfile; readOnly?: boolean }) {
  const [profile, setProfile] = useState(initial)
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  function save(clear = false) {
    if (readOnly || pending) return
    setNotice('')
    startTransition(async () => {
      try {
        const result = await saveSpaceCoachProfile(spaceId, clear ? null : profile)
        if (isError(result)) { setNotice(result.error); return }
        setProfile(result.data)
        setNotice(clear ? 'Coach preferences cleared.' : 'Coach preferences saved.')
      } catch { setNotice('Your preferences could not be saved. Try again.') }
    })
  }
  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); save() }}>
    <p className="text-body-sm text-muted">Vera uses these preferences when coaching your Space profile. You write the copy. These notes do not publish to your page or authorize messages. Space editors can view and change them.</p>
    {COACH_PROFILE_FIELDS.map((field) => <div key={field.key} className="space-y-2">
      <Label htmlFor={`coach-${field.key}`} className="block text-body-sm font-medium">{field.label}</Label>
      <p id={`coach-${field.key}-hint`} className="text-body-sm text-muted">{field.hint}</p>
      <Textarea id={`coach-${field.key}`} aria-describedby={`coach-${field.key}-hint`} rows={field.key === 'examples' ? 5 : 3} maxLength={field.max} value={profile[field.key]} disabled={readOnly || pending} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })} />
    </div>)}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={readOnly || pending}>{pending ? 'Saving…' : 'Save preferences'}</Button>
      <Button type="button" variant="secondary" disabled={readOnly || pending} onClick={() => { if (window.confirm('Clear all saved coach preferences for this Space?')) save(true) }}>Clear preferences</Button>
    </div>
    <p role="status" aria-live="polite" className="text-body-sm text-muted">{notice}</p>
  </form>
}
