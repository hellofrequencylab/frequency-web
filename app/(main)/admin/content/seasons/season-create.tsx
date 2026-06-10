'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Label } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { createSeasonAction } from '../actions'

// Janitor-only create form for the next season. The number auto-increments
// server-side; this form sets the identity (name, theme) and the window.

export function SeasonCreateForm({ nextNumber }: { nextNumber: number }) {
  const [name, setName] = useState(`Season ${nextNumber}`)
  const [theme, setTheme] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<'idle' | 'created' | string>('idle')
  const router = useRouter()

  function submit() {
    setStatus('idle')
    start(async () => {
      const r = await createSeasonAction({
        name,
        theme: theme || null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
      })
      if (isError(r)) setStatus(r.error)
      else {
        setStatus('created')
        setTheme('')
        setStartsAt('')
        setEndsAt('')
        setName(`Season ${nextNumber + 1}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="season-name">Name</Label>
          <Input
            id="season-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Season ${nextNumber}`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-theme">Theme (optional)</Label>
          <Input
            id="season-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="What this season is about"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-start">Starts</Label>
          <Input
            id="season-start"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="season-end">Ends</Label>
          <Input
            id="season-end"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? 'Creating…' : `Create season ${nextNumber}`}
        </Button>
        {status === 'created' && <span className="text-xs text-success">Season created.</span>}
        {status !== 'idle' && status !== 'created' && <span className="text-xs text-danger">{status}</span>}
      </div>
    </div>
  )
}
