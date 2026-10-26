'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { SectionHeader } from '@/components/ui/section-header'
import { chooseSpaceNiche } from './actions'

// The starting setup card on Menu and features (ADR-1882). Says what this Space is building and which tools
// that starts on. The switches themselves stay in the grid below: this card only names the niche and, for a
// Space that never tuned its tools, starts it from that niche's preset. Plain owner copy, no em dashes.

export interface StartingSetupProps {
  slug: string
  /** The saved niche id, or null. */
  niche: string | null
  /** Every niche, for the picker: id and plain label. */
  options: { id: string; label: string }[]
  /** The tools the saved niche starts on, as the owner reads them. */
  tools: string[]
  readOnly: boolean
}

export function StartingSetup({ slug, niche, options, tools, readOnly }: StartingSetupProps) {
  const router = useRouter()
  const [pick, setPick] = useState(options[0]?.id ?? '')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const saved = options.find((o) => o.id === niche)

  const choose = () =>
    start(async () => {
      const res = await chooseSpaceNiche(slug, pick)
      if (isError(res)) return setNote(res.error)
      setNote(res.data.applied ? 'Done. The tools below now start from this setup.' : 'Saved. Your tools stay as you set them.')
      router.refresh()
    })

  return (
    <section aria-labelledby="starting-setup" className="space-y-3">
      <SectionHeader title="Starting setup" id="starting-setup" />
      {saved ? (
        <p className="text-body-sm text-muted">
          {saved.label}.{' '}
          {tools.length
            ? `Started with ${tools.join(', ')}. Everything else is one switch away below.`
            : 'Every tool stays on. Switch off what you do not use below.'}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-body-sm text-muted">
            Tell us what you are building and we will start your tools to match. If you have already changed your
            tools, they stay exactly as they are.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="What are you building" value={pick} onChange={(e) => setPick(e.target.value)} disabled={readOnly || pending} wrapperClassName="inline-block w-max max-w-full">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={choose} disabled={readOnly || pending}>
              Use this setup
            </Button>
          </div>
        </div>
      )}
      {note && (
        <p role="status" className="text-body-sm text-muted">
          {note}
        </p>
      )}
    </section>
  )
}
