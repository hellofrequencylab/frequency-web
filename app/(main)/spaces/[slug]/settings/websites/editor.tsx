'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { isError, type ActionResult } from '@/lib/action-result'
import { createClientSite, getClientSiteHandoffLink, removeClientSite, toggleClientSiteBadge } from '@/lib/collective/client-sites-actions'
import type { ClientSiteRow } from '@/lib/collective/client-sites'

const DOMAIN_LABEL = { none: 'Free address', live: 'Own domain live', pending: 'Own domain pending' } as const

export function ClientSitesEditor({ networkId, networkOwnerId, sites, monthlyLabel, badgeLabel, billLines }: { networkId: string; networkOwnerId: string; sites: ClientSiteRow[]; monthlyLabel: string; badgeLabel: string; billLines: { label: string; detail: string; total: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [message, setMessage] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()
  const handoff = (siteId: string) => start(async () => {
    try {
      const result = await getClientSiteHandoffLink(networkId, siteId)
      if (isError(result)) { setMessage(result.error); return }
      setLinks((prev) => ({ ...prev, [siteId]: new URL(result.data.path, window.location.origin).toString() }))
      setMessage('Link ready. Send it to the site owner.')
    } catch { setMessage('That did not work. Try again.') }
  })
  const run = (action: () => Promise<ActionResult<unknown>>, done: string, reset = false) => start(async () => {
    try {
      const result = await action()
      setMessage(isError(result) ? result.error : done)
      if (!isError(result)) { if (reset) { setName(''); setHandle('') } router.refresh() }
    } catch { setMessage('That did not save. Try again.') }
  })
  return (
    <div className="space-y-10">
      <section aria-labelledby="client-sites-list" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="client-sites-list" className="text-body-lg font-bold text-text">Your client websites</h2>
          <p className="text-body-sm text-muted">{sites.length} live, {monthlyLabel} a month</p>
        </div>
        {sites.length ? (
          <ul className="space-y-3">{sites.map((site) => (
            <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <Link href={`/spaces/${site.slug}/manage`} className="text-body-sm font-semibold text-link">{site.name}</Link>
                <p className="text-body-sm text-muted">{site.domain ?? `${site.slug}.frequencylocal.com`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={site.published ? 'success' : 'neutral'}>{site.published ? 'Published' : 'Not published'}</Badge>
                <Badge tone={site.domainState === 'live' ? 'success' : 'neutral'}>{DOMAIN_LABEL[site.domainState]}</Badge>
                <Badge tone={site.ownerProfileId === networkOwnerId ? 'neutral' : 'success'}>{site.ownerProfileId === networkOwnerId ? 'You own it' : 'Handed off'}</Badge>
                <Button type="button" variant="secondary" size="sm" disabled={pending} aria-pressed={site.badgeFree}
                  onClick={() => run(() => toggleClientSiteBadge(networkId, site.id, !site.badgeFree), site.badgeFree ? 'Frequency badge is back on that site.' : 'Badge removed from that site.')}>
                  {site.badgeFree ? 'Badge removed' : `Remove badge, +${badgeLabel}`}
                </Button>
                {site.ownerProfileId === networkOwnerId ? <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => handoff(site.id)}>Hand off to owner</Button> : null}
                <Button type="button" variant="ghost" size="sm" disabled={pending}
                  onClick={() => { if (window.confirm(`Stop paying for ${site.name}? The site stays, but it leaves your bill and goes back to a free Space, so its own domain and Business tools switch off.`)) run(() => removeClientSite(networkId, site.id), `${site.name} is off your bill.`) }}>Remove from my bill</Button>
              </div>
              {links[site.id] ? (
                <div className="w-full space-y-1">
                  <p className="text-body-sm text-muted">Send this link to the site owner. When they open it and sign in, the site is theirs. It stays on your bill.</p>
                  <Input readOnly value={links[site.id]} aria-label={`Hand-off link for ${site.name}`} onFocus={(e) => e.currentTarget.select()} />
                </div>
              ) : null}
            </li>
          ))}</ul>
        ) : <p className="text-body-sm text-muted">No client websites yet. Add the first one below.</p>}
      </section>
      {billLines.length ? (
        <section aria-labelledby="client-sites-bill" className="space-y-3">
          <h2 id="client-sites-bill" className="text-body-lg font-bold text-text">What you pay Frequency</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {billLines.map((line) => (
              <li key={line.label} className="flex items-baseline justify-between gap-3 px-4 py-2 text-body-sm">
                <span className="text-text">{line.label}<span className="text-muted">, {line.detail}</span></span>
                <span className="font-semibold text-text">{line.total}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-body-sm font-bold text-text"><span>Total a month</span><span>{monthlyLabel}</span></li>
          </ul>
          <p className="text-body-sm text-muted">Domains are included. You bill your own people outside Frequency.</p>
        </section>
      ) : null}
      <section aria-labelledby="client-sites-new" className="space-y-3">
        <h2 id="client-sites-new" className="text-body-lg font-bold text-text">Add a client website</h2>
        <p className="text-body-sm text-muted">It starts as a Business Space you own, billed to your Network. Hand it to its owner when it is ready.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name"><Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Handle" hint="Lowercase letters, numbers and hyphens. Sets its free address."><Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} /></Field>
        </div>
        <Button type="button" size="sm" disabled={pending || !name.trim() || !handle.trim()} onClick={() => run(() => createClientSite(networkId, { name, slug: handle }), 'Client website added.', true)}>Add client website</Button>
      </section>
      <p aria-live="polite" className="text-body-sm text-muted">{message}</p>
    </div>
  )
}
