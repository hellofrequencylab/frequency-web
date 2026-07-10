'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Store, Loader2, ArrowRight, MapPin, Check } from 'lucide-react'
import { StudioLaunchButton } from '../kit/studio-launch-button'
import { StudioField } from '../kit/studio-field'
import { StudioFooter } from '../kit/studio-footer'
import { isError } from '@/lib/action-result'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { getBrowserPosition } from '@/lib/geo-browser'
import { createListingAction } from '@/app/(main)/classifieds/actions'

const FIELD = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

// Post a marketplace listing via the Studio window. No payment — it just connects
// neighbors; contact happens over DMs from the listing. (ADR-148)
export function NewListingButton({ className }: { className?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ListingKind>('offer')
  const [category, setCategory] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [description, setDescription] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [images, setImages] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const useMyLocation = async () => {
    setLocating(true)
    const pos = await getBrowserPosition()
    setLocating(false)
    if (pos) setCoords(pos)
    else setError('Couldn’t get your location. You can still set a neighborhood/city.')
  }

  const create = () => {
    if (!title.trim()) { setError('Give your listing a title.'); return }
    start(async () => {
      setError(null)
      const res = await createListingAction({
        title, kind, category, priceNote, description, neighborhood, city,
        images: images.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
      })
      if (isError(res)) { setError(res.error); return }
      router.push(`/classifieds/${res.data.id}`)
    })
  }

  return (
    <StudioLaunchButton
      label="Post a listing"
      icon={Plus}
      className={className}
      eyebrow="Studio · New listing"
      footer={
        <StudioFooter
          left={<span className="text-xs text-subtle">{error ? <span className="text-danger">{error}</span> : 'Free to post. No payment, just neighbors helping out.'}</span>}
        >
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Post listing
          </button>
        </StudioFooter>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Store className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            maxLength={120}
            placeholder="What are you offering or looking for?"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={40}
            placeholder="Optional category (e.g. furniture, tools, lessons)"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StudioField label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as ListingKind)} className={FIELD}>
            {LISTING_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </StudioField>
        <StudioField label="Price / terms (free text)">
          <input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} maxLength={80} placeholder="e.g. $20, or a trade, or free" className={FIELD} />
        </StudioField>
        <StudioField label="Neighborhood">
          <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} maxLength={80} placeholder="optional" className={FIELD} />
        </StudioField>
        <StudioField label="City">
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="optional" className={FIELD} />
        </StudioField>
      </div>

      {/* Precise location (optional) — powers "near me" for people browsing. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : coords ? <Check className="h-4 w-4 text-success" /> : <MapPin className="h-4 w-4" />}
          {coords ? 'Location pinned' : 'Use my location'}
        </button>
        <span className="ml-2 text-xs text-subtle">Helps neighbors find it by distance (never shown exactly).</span>
      </div>

      <div className="mt-4">
        <StudioField label="Image URLs (one per line)">
          <textarea value={images} onChange={(e) => setImages(e.target.value)} rows={2} placeholder="https://…  (optional)" className={FIELD} />
        </StudioField>
      </div>

      <div className="mt-4">
        <StudioField label="Details">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000} placeholder="Condition, size, when/where to pick up, anything useful…" className={FIELD} />
        </StudioField>
      </div>

      <p className="mt-3 text-xs text-subtle">No money changes hands in the app. Arrange that offline. Be kind; this is mutual support, not a storefront.</p>
    </StudioLaunchButton>
  )
}
