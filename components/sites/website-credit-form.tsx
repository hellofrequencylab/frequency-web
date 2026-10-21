'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import type { FooterBadgeMode } from '@/lib/sites/site-badge'
import { setSiteBadge } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE FOOTER CREDIT CHOICE (LIVE-1117), on the Profile & Settings Website card: the Frequency Partner badge,
// a quiet text line, or nothing. Nothing is the paid choice, so without badge removal it shows locked. The
// server action re-gates; this client is feedback only.

const OPTIONS: { id: FooterBadgeMode; label: string; hint: string }[] = [
  { id: 'badge', label: 'Frequency Partner badge', hint: 'The badge that closes the footer.' },
  { id: 'line', label: 'Text line', hint: 'A small "Built on Frequency" line instead of the badge.' },
  { id: 'none', label: 'None', hint: 'No mention of Frequency in the footer.' },
]

export function WebsiteCreditForm({ slug, initial, removalHeld }: { slug: string; initial: FooterBadgeMode; removalHeld: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<FooterBadgeMode>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pick(next: FooterBadgeMode) {
    if (next === mode) return
    setError(null)
    start(async () => {
      const result = await setSiteBadge(slug, next)
      if (isError(result)) return setError(result.error)
      setMode(next)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Footer credit" className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const locked = o.id === 'none' && !removalHeld
          return (
            <Button key={o.id} type="button" variant="secondary" size="sm" aria-pressed={mode === o.id} disabled={pending || locked} onClick={() => pick(o.id)}>
              {o.label}
            </Button>
          )
        })}
      </div>
      <p className="text-body-sm text-muted">
        {OPTIONS.find((o) => o.id === mode)?.hint}
        {!removalHeld && ' Removing the credit is a paid option: ask your Network, or move to Independent.'}
      </p>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
