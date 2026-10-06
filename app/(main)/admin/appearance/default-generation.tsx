'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { GENERATIONS, type GenerationId } from '@/lib/theme/generations'
import { setDefaultGeneration } from './actions'

// The community default generation picker (LIVE-658). A small client island over the janitor-gated
// action: pick a feel, save, and the root layout re-renders with it. A member's own choice and a
// Space's choice still win over this one; it is the fallback for everyone else.

export function DefaultGenerationPicker({ current }: { current: GenerationId }) {
  const router = useRouter()
  const [value, setValue] = useState<GenerationId>(current)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const adult = GENERATIONS.filter((g) => g.group === 'adult')
  const kids = GENERATIONS.filter((g) => g.group === 'kids')
  const chosen = GENERATIONS.find((g) => g.id === value)

  function save() {
    setMessage(null)
    start(async () => {
      const r = await setDefaultGeneration(value)
      if (isError(r)) {
        setMessage({ tone: 'error', text: r.error })
        return
      }
      setMessage({ tone: 'ok', text: 'Saved. New page loads use it now.' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lift-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-body-sm font-semibold text-text">
          Feel
          <Select
            value={value}
            onChange={(e) => setValue(e.target.value as GenerationId)}
            disabled={pending}
          >
            <optgroup label="Everyone">
              {adult.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Kids">
              {kids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </optgroup>
          </Select>
        </label>
        <Button onClick={save} disabled={pending || value === current}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {chosen && (
        <p className="text-body-sm text-muted">
          {chosen.vibe}
          {chosen.minContrast === 'AAA' ? ' Text holds AAA contrast.' : ''}
        </p>
      )}
      {message && (
        <p role="status" className={message.tone === 'ok' ? 'text-body-sm text-success' : 'text-body-sm text-danger'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
