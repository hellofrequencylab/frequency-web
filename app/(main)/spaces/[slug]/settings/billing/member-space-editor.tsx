'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { setCollectiveMemberSpace, setCollectiveExtraSpaces } from '@/lib/collective/member-spaces-actions'
import type { ExtraSpaceQuote } from '@/lib/collective/extra-space-billing'
import type { MemberSpaceManagement } from '@/lib/collective/member-spaces-store'

export function MemberSpaceEditor({ parentId, management, quote = null }: { parentId: string; management: MemberSpaceManagement; quote?: ExtraSpaceQuote | null }) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [extra, setExtra] = useState(quote?.quantity ?? 0)
  const [saved, setSaved] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  function change(childId: string, attach: boolean) {
    setError('')
    startTransition(async () => {
      try {
        const result = await setCollectiveMemberSpace(parentId, childId, attach)
        if ('error' in result) setError(result.error)
        else { setSelected(''); router.refresh() }
      } catch { setError('Could not update this member Space. Try again.') }
    })
  }
  function saveExtraSpaces() {
    if (!quote) return
    setError('')
    startTransition(async () => {
      try {
        const result = await setCollectiveExtraSpaces(parentId, extra, quote.priceId, quote.unitCents)
        if ('error' in result) setError(result.error)
        else { setSaved(extra); router.refresh() }
      } catch { setError('Could not update extra Spaces. Refresh before trying again.') }
    })
  }
  const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return (
    <section className="rounded-card border border-border bg-surface px-5 py-4 space-y-4">
      <h2 className="text-body-lg font-bold text-text">Member Spaces</h2>
      <p className="text-body-sm text-muted">{management.members.length} of {management.capacity} Spaces attached. Each member Space keeps its own content and gets Business tools while your Collective is active.</p>
      {management.members.length === 0 && <p className="text-body-sm text-muted">Attach a Space you own to bring it into your Collective.</p>}
      <ul className="space-y-3">
        {management.members.map(space => (
          <li key={space.id} className="flex items-center justify-between gap-4">
            <a href={`/spaces/${space.slug}`} className="text-body-sm text-link">{space.name}</a>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => change(space.id, false)} aria-label={`Detach ${space.name}`}>Detach</Button>
          </li>
        ))}
      </ul>
      <p className="text-meta text-muted">Detaching restores the Space&apos;s own plan. Its content stays in place. Reducing your extra Spaces never removes an attached Space.</p>
      {management.candidates.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-body-sm text-text" htmlFor="collective-member-space">Choose one of your Spaces
            <Select id="collective-member-space" value={selected} onChange={e => setSelected(e.target.value)} disabled={pending} className="mt-1">
              <option value="">Choose a Space</option>
              {management.candidates.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </Select>
          </label>
          <Button disabled={pending || !selected || management.members.length >= management.capacity} onClick={() => change(selected, true)}>Attach Space</Button>
        </div>
      )}
      {management.active && quote && (
        <div className="space-y-3 border-t border-border pt-4">
          <label htmlFor="collective-extra-spaces" className="text-body-sm text-text">Extra Spaces beyond the five included</label>
          <Input id="collective-extra-spaces" type="number" min={quote.minQuantity} step={1} value={extra} disabled={pending}
            onChange={e => setExtra(Number(e.target.value))} />
          <p className="text-meta text-muted">{extra} extra Spaces x {money(quote.unitCents)} = {money(quote.unitCents * extra)} per {quote.interval === 'year' ? 'year' : 'month'}. Changes are prorated on your next invoice.</p>
          {quote.minQuantity > 0 && <p className="text-meta text-muted">Detach member Spaces before reducing below {quote.minQuantity} extra Spaces.</p>}
          <Button disabled={pending || !Number.isSafeInteger(extra) || extra < quote.minQuantity || extra === (saved ?? quote.quantity)} onClick={saveExtraSpaces}>Save extra Spaces</Button>
          {saved !== null && <p role="status" className="text-meta text-muted">Extra Spaces updated. Your invoice reflects the prorated change.</p>}
        </div>
      )}
      {management.active && !quote && <p className="text-body-sm text-muted">Extra-Space billing is available once your paid Collective subscription and its prices are ready.</p>}
      {management.active && management.members.length >= management.capacity && <p className="text-body-sm text-muted">Your Collective is full. Add another Space to your plan before attaching one.</p>}
      {!management.active && <p className="text-body-sm text-muted">Your Collective is inactive. Member Spaces now use their own plans, and you can still detach them.</p>}
      {error && <p role="alert" className="text-body-sm text-text">{error}</p>}
    </section>
  )
}
