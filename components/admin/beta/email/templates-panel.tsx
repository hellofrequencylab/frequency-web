'use client'

// Pre-loaded best-practice templates — WITH content. One click seeds them all as
// DRAFTS (nothing armed): five broadcast campaigns filed under their phase, plus the
// Beta waitlist drip pair on a disabled sequence. Idempotent: re-running never
// duplicates. The list shows exactly what will land so the owner knows before seeding.

import { useState, useTransition } from 'react'
import { Download, FileText, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { loadBetaTemplates } from '@/app/(main)/admin/beta/email-actions'

export function TemplatesPanel({ labels, loaded }: { labels: string[]; loaded: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function seed() {
    setError(null)
    setNote(null)
    start(async () => {
      const r = await loadBetaTemplates()
      if (isError(r)) {
        setError(r.error)
        return
      }
      const d = r.data
      setNote(
        `Loaded ${d.campaignsCreated} campaign draft${d.campaignsCreated === 1 ? '' : 's'} and ` +
          `${d.nurtureStepsCreated} drip step${d.nurtureStepsCreated === 1 ? '' : 's'}` +
          `${d.skipped ? `, skipped ${d.skipped} already present` : ''}. Nothing was armed.`,
      )
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Best-practice starter copy for the whole Beta arc, written to the voice. Everything loads as a draft you
          review, edit, and approve.
        </p>
        <Button size="sm" disabled={pending} onClick={seed}>
          <Download className="h-3.5 w-3.5" /> {pending ? 'Loading…' : loaded ? 'Reload missing' : 'Load templates'}
        </Button>
      </div>

      {error && (
        <Banner tone="critical" title="Could not load templates">
          {error}
        </Banner>
      )}
      {note && <Banner tone="info" title={note} />}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {labels.map((label) => (
          <li key={label} className="flex items-center gap-3 px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <span className="min-w-0 flex-1 text-sm text-text">{label}</span>
            {loaded && <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  )
}
