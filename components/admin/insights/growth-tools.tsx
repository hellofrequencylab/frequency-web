'use client'

import { useState, useTransition } from 'react'
import { RowCard } from '@/components/cards/row-card'
import { Button } from '@/components/ui/button'
import { exportGrowthCampaigns, draftGrowthBrief } from '@/app/(main)/admin/insights/growth-actions'
import { GOOGLE_REPORTING_SPEC } from '@/lib/analytics/google-reporting'

function downloadFile(contents: string, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function GrowthTools() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [brief, setBrief] = useState<{ text: string; at: string; mode: 'ai' | 'rules' } | null>(null)
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <RowCard title="Google report specification" actions={<Button size="sm" variant="ghost" onClick={() => {
          downloadFile(JSON.stringify(GOOGLE_REPORTING_SPEC, null, 2), 'application/json', 'frequency-google-reporting.json')
          setMessage('Report specification downloaded. This does not create reports in your Google account.')
        }}>Download Google report specification</Button>} />
        <RowCard title="Campaign outcomes" actions={<Button size="sm" variant="secondary" loading={pending} onClick={() => startTransition(async () => {
          try {
            const result = await exportGrowthCampaigns()
            if ('error' in result) { setMessage(result.error); return }
            downloadFile(result.csv, 'text/csv;charset=utf-8', 'frequency-campaign-outcomes.csv')
            setMessage('Campaign aggregates exported. Spend is blank until a verified spend source is connected.')
          } catch { setMessage('The export could not be loaded. Try again.') }
        })}>Export campaign outcomes</Button>} />
        <RowCard title="Improvement brief" actions={<Button size="sm" variant="secondary" loading={pending} onClick={() => startTransition(async () => {
          try {
            const result = await draftGrowthBrief()
            if ('error' in result) { setMessage(result.error); return }
            setBrief(result)
            setMessage('Improvement brief drafted. Review its evidence and proposed test before changing the site.')
          } catch { setMessage('The brief could not be loaded. Try again.') }
        })}>Draft an improvement brief</Button>} />
      </div>
      <p role="status" className="text-meta text-muted">{message}</p>
      {brief && <section aria-label="Improvement brief" className="space-y-2">
        <p className="text-meta text-muted">{brief.mode === 'ai' ? 'AI-assisted' : 'Rule-based'} brief. Evidence computed <time dateTime={brief.at}>{brief.at}</time>. No site changes made.</p>
        <div className="whitespace-pre-wrap text-body-sm text-text">{brief.text}</div>
      </section>}
    </div>
  )
}
