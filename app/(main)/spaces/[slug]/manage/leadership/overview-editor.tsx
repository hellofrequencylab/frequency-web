'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea, Label } from '@/components/ui/field'
import { saveProgramOverview } from './actions'

// The executive overview's editor (LIVE-862): one Markdown textarea and a Save. Only a manager gets it
// (the page decides; the action re-gates). After a save the page re-renders the overview from the Space.

export function OverviewEditor({ slug, initial, startOpen }: { slug: string; initial: string; startOpen: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(startOpen)
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit the overview
      </Button>
    )
  }

  const save = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveProgramOverview(slug, text)
      if (res.error) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      <Label htmlFor="program-overview">Executive overview, in Markdown</Label>
      <p className="text-body-sm text-muted">
        Start each section with a line like <code>## The member path</code> so it shows in the contents. Tables, lists
        and bold all work. Only your space&apos;s managers can see this page.
      </p>
      <Textarea
        id="program-overview"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        rows={20}
        className="w-full font-mono text-body-sm"
        spellCheck
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} loading={pending}>
          Save overview
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setText(initial)
            setError(null)
            setOpen(false)
          }}
          disabled={pending}
        >
          Close
        </Button>
        {saved && <span className="text-body-sm text-success" role="status">Saved.</span>}
        {error && <span className="text-body-sm text-danger" role="alert">{error}</span>}
      </div>
    </div>
  )
}
