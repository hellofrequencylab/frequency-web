'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { CAMPAIGN_LANDINGS, CAMPAIGN_SOURCES, buildCampaignLink, isCampaignLanding, isCampaignSource, type CampaignLanding, type CampaignSource } from '@/lib/analytics/campaign-links'

export function CampaignLinkBuilder() {
  const id = useId()
  const [source, setSource] = useState<CampaignSource>('email')
  const [landing, setLanding] = useState<CampaignLanding>('/')
  const [label, setLabel] = useState('')
  const [generated, setGenerated] = useState<ReturnType<typeof buildCampaignLink> | null>(null)
  const [message, setMessage] = useState('')
  function clearGeneratedLink() {
    if (!generated) return
    setGenerated(null)
    setMessage('Choices changed. Generate a new campaign link.')
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label htmlFor={`${id}-label`} className="space-y-1 text-body-sm text-text"><span>Private campaign label</span><Input id={`${id}-label`} value={label} maxLength={80} onChange={(e) => { clearGeneratedLink(); setLabel(e.target.value) }} placeholder="A label for your own records" /></label>
      <label htmlFor={`${id}-source`} className="space-y-1 text-body-sm text-text"><span>Campaign source</span><Select id={`${id}-source`} value={source} onChange={(e) => { if (isCampaignSource(e.target.value)) { clearGeneratedLink(); setSource(e.target.value) } }} options={Object.entries(CAMPAIGN_SOURCES).map(([value, spec]) => ({ value, label: spec.label }))} /></label>
      <label htmlFor={`${id}-landing`} className="space-y-1 text-body-sm text-text"><span>Destination</span><Select id={`${id}-landing`} value={landing} onChange={(e) => { if (isCampaignLanding(e.target.value)) { clearGeneratedLink(); setLanding(e.target.value) } }} options={Object.entries(CAMPAIGN_LANDINGS).map(([value, text]) => ({ value, label: text }))} /></label>
    </div>
    <p className="text-meta text-muted">Links use a random campaign ID. The private label stays out of the URL and Google. Save the label mapping to recognize that ID later. Generating a link does not start an ad or spend money.</p>
    <Button size="sm" variant="secondary" onClick={() => {
      try { setGenerated(buildCampaignLink({ id: crypto.randomUUID(), source, landing, privateLabel: label })); setMessage('Production campaign link generated. Save its label mapping before leaving this page.') }
      catch { setMessage('The link could not be generated. Use a supported secure browser.') }
    }}>Generate campaign link</Button>
    {generated && <div className="space-y-3">
      <label htmlFor={`${id}-url`} className="block space-y-1 text-body-sm text-text"><span>Production campaign link</span><Input id={`${id}-url`} readOnly value={generated.url} onFocus={(e) => e.target.select()} /></label>
      <p className="text-meta text-muted">Campaign ID: {generated.mapping.campaignId}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(generated.url); setMessage('Campaign link copied.') }
          catch { setMessage('Select the link field and copy it using your browser.') }
        }}>Copy link</Button>
        <Button size="sm" variant="ghost" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(generated.mapping, null, 2)], { type: 'application/json' }))
          const link = document.createElement('a'); link.href = url; link.download = `frequency-campaign-${generated.mapping.campaignId}.json`; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          setMessage('Private campaign mapping exported. Keep it with your campaign records.')
        }}>Save private label mapping</Button>
      </div>
    </div>}
    <p role="status" className="text-meta text-muted">{message}</p>
  </div>
}
