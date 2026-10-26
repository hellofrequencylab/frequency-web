'use client'
import { useState, useTransition } from 'react'
import { Input, Label } from '@/components/ui/field'
import { RowCard } from '@/components/cards/row-card'
import { Button } from '@/components/ui/button'
import { startSearchProvider, disconnectSearchProvider, reviewConnectedSearch } from '@/app/(main)/spaces/[slug]/settings/coach/search-actions'

type Provider = 'google' | 'bing'
interface ProviderStatus { state: string; propertyUrl: string; expiresAt: string | null }
export function DiscoverySearchPanel({ spaceId, allowed, providers }: {
  spaceId: string; allowed: boolean
  providers: { provider: Provider; configured: boolean; status: ProviderStatus | null }[]
}) {
  const [pending, transition] = useTransition()
  const [message, setMessage] = useState('')
  const [review, setReview] = useState<Awaited<ReturnType<typeof reviewConnectedSearch>> | null>(null)
  const visibleReview = allowed ? review : null
  const [forgotten, setForgotten] = useState<Provider[]>([])
  return <section className="space-y-5" aria-labelledby="discovery-search-title">
    <h3 id="discovery-search-title" className="font-semibold">Search evidence</h3>
    <p>Connect your own verified search property for a read-only review. Google reads only this Space’s profile and published website home. Bing requires a dedicated website property; shared Frequency-wide statistics are excluded. Raw search queries and provider credentials stay out of coaching.</p>
    <p>Reviews are requested by you, with a normal-operation cooldown of one request per provider per minute. Data may be delayed, incomplete or too small to use. Clicks and impressions do not prove enquiries, attendance, rankings in AI answers or conversions. You write the content.</p>
    {!allowed && <p role="status">Allow discovery coaching above before connecting or reviewing search data. You can still forget a saved connection.</p>}
    {providers.map(({ provider, configured, status }) => {
      const current = forgotten.includes(provider) ? null : status
      const name = provider === 'google' ? 'Google Search Console' : 'Bing Webmaster'
      return <RowCard key={provider} title={name} footer={<div className="space-y-3">
        <p>{current?.state === 'connected' ? `Connected to ${current.propertyUrl}` : 'Not connected.'}</p>
        {!configured && <p>Account setup is needed before this provider can connect. Your owner account must have verified access, and the application callback and private credentials must be configured.</p>}
        <form action={startSearchProvider.bind(null, spaceId, provider)} className="space-y-2">
          <Label htmlFor={`search-property-${provider}`}>Verified property</Label>
          <Input id={`search-property-${provider}`} name="property" type="text" required maxLength={2048} defaultValue={current?.propertyUrl ?? ''} placeholder={provider === 'google' ? 'sc-domain:yourdomain.com' : 'https://yourdomain.com/'} disabled={!configured || !allowed || pending} />
          <p>{provider === 'google' ? 'Use the exact Domain or HTTPS URL-prefix property shown in Search Console. Every API query remains restricted to your Space’s approved pages.' : 'Use your published Space website’s exact HTTPS root. Provider access to a shared domain is not permission to read another Space’s activity.'}</p>
          <Button type="submit" disabled={!configured || !allowed || pending}>{current?.state === 'connected' ? 'Reconnect' : 'Connect'} {name}</Button>
        </form>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={!allowed || current?.state !== 'connected' || pending} onClick={() => transition(async () => { try { setReview(await reviewConnectedSearch(spaceId, provider)); setMessage('Review finished. The recorded evidence and limits appear below.') } catch { setReview(null); setMessage('The search review is unavailable. No performance conclusion was drawn.') } })}>Review search evidence</Button>
          {current && current.state !== 'revoked' && <Button type="button" variant="secondary" disabled={pending} onClick={() => transition(async () => { try { const result = await disconnectSearchProvider(spaceId, provider); setMessage(result.success ? 'The saved connection was forgotten. Revoke the app in your provider account too if you want to withdraw its provider-side authorization.' : 'The connection could not be forgotten. Try again.'); if (result.success) { setForgotten(old => [...old, provider]); setReview(null) } } catch { setMessage('The connection could not be forgotten. Try again.') } })}>Forget connection</Button>}
        </div>
      </div>} />
    })}
    <p role="status" aria-live="polite">{message}</p>
    {visibleReview?.status === 'unavailable' && <p role="status">Review unavailable: {visibleReview.reason.replaceAll('_', ' ')}. No performance conclusion was drawn.</p>}
    {visibleReview?.status === 'completed' && <div className="space-y-4">
      <p>Property: {visibleReview.propertyUrl}. These are observations, not evidence of a marketing effect.</p>
      {visibleReview.coaching.recommendations.map(task => <div key={task.id} className="space-y-2">
        <h4 className="font-semibold">{task.title}</h4>
        <p>{task.basis}. {task.evidence.value} {task.evidence.metric.replaceAll('_', ' ')}.</p>
        <p>{task.evidence.period.from.slice(0, 10)} to {task.evidence.period.to.slice(0, 10)} · {task.evidence.freshness} · coverage {task.evidence.coverage}</p>
        <ul>{task.questions.map(question => <li key={question}>{question}</li>)}</ul>
        <p>{task.measurement.caution}</p>
      </div>)}
      {!visibleReview.coaching.recommendations.length && <p>There is not enough eligible evidence to recommend a performance change.</p>}
      <ul>{[...visibleReview.limitations, ...visibleReview.coaching.missingEvidence].map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>)}</ul>
    </div>}
  </section>
}
