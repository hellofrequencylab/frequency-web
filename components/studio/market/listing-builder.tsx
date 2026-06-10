'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, Eye, MapPin, Check, Loader2 } from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { useStudioDraft } from '../kit/use-studio-draft'
import { StudioField } from '../kit/studio-field'
import { SaveStatus, StudioFooter } from '../kit/studio-footer'
import { getBrowserPosition } from '@/lib/geo-browser'
import { LISTING_KINDS, type ListingKind, type ListingPatch } from '@/lib/marketplace'
import { updateListingAction } from '@/app/(main)/market/actions'

const FIELD = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

export interface ListingBuilderProps {
  id: string
  title: string
  kind: ListingKind
  category: string | null
  priceNote: string | null
  description: string | null
  neighborhood: string | null
  city: string | null
  images: string[]
  hasGeo: boolean
}

// Edit a listing on the Studio shell (entity #4 to ride the kit) — autosaves each
// field via updateListingAction. Status/delete live on the detail page.
export function ListingBuilder(props: ListingBuilderProps) {
  const router = useRouter()
  const close = useCallback(() => router.push(`/market/${props.id}`), [router, props.id])

  const save = useCallback((patch: ListingPatch) => updateListingAction(props.id, patch), [props.id])
  const onError = useCallback(() => router.refresh(), [router])
  const { saveState, error, queueSave } = useStudioDraft<ListingPatch>({ save, onError })

  const [title, setTitle] = useState(props.title ?? '')
  const [kind, setKind] = useState<ListingKind>(props.kind)
  const [category, setCategory] = useState(props.category ?? '')
  const [priceNote, setPriceNote] = useState(props.priceNote ?? '')
  const [description, setDescription] = useState(props.description ?? '')
  const [neighborhood, setNeighborhood] = useState(props.neighborhood ?? '')
  const [city, setCity] = useState(props.city ?? '')
  const [images, setImages] = useState((props.images ?? []).join('\n'))
  const [hasGeo, setHasGeo] = useState(props.hasGeo)
  const [locating, setLocating] = useState(false)

  const useMyLocation = async () => {
    setLocating(true)
    const pos = await getBrowserPosition()
    setLocating(false)
    if (pos) { setHasGeo(true); queueSave({ latitude: pos.lat, longitude: pos.lng }) }
  }
  const clearLocation = () => { setHasGeo(false); queueSave({ latitude: null, longitude: null }) }

  const footer = (
    <StudioFooter left={<SaveStatus state={saveState} error={error} />}>
      <a href={`/market/${props.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
        <Eye className="h-4 w-4" /> View
      </a>
      <button type="button" onClick={close} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
        Done
      </button>
    </StudioFooter>
  )

  return (
    <StudioWindow open onClose={close} eyebrow="Studio · Edit listing" footer={footer}>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Store className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueSave({ title: e.target.value }) }}
            maxLength={120}
            placeholder="What are you offering or looking for?"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={category}
            onChange={(e) => { setCategory(e.target.value); queueSave({ category: e.target.value || null }) }}
            maxLength={40}
            placeholder="Category (optional)"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StudioField label="Type">
          <select value={kind} onChange={(e) => { const v = e.target.value as ListingKind; setKind(v); queueSave({ kind: v }) }} className={FIELD}>
            {LISTING_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </StudioField>
        <StudioField label="Price / terms (free text)">
          <input value={priceNote} onChange={(e) => { setPriceNote(e.target.value); queueSave({ priceNote: e.target.value || null }) }} maxLength={80} placeholder="e.g. $20, or a trade, or free" className={FIELD} />
        </StudioField>
        <StudioField label="Neighborhood">
          <input value={neighborhood} onChange={(e) => { setNeighborhood(e.target.value); queueSave({ neighborhood: e.target.value || null }) }} maxLength={80} className={FIELD} />
        </StudioField>
        <StudioField label="City">
          <input value={city} onChange={(e) => { setCity(e.target.value); queueSave({ city: e.target.value || null }) }} maxLength={80} className={FIELD} />
        </StudioField>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : hasGeo ? <Check className="h-4 w-4 text-success" /> : <MapPin className="h-4 w-4" />}
          {hasGeo ? 'Location pinned' : 'Use my location'}
        </button>
        {hasGeo && <button type="button" onClick={clearLocation} className="text-xs text-subtle hover:text-text">Clear</button>}
      </div>

      <div className="mt-4">
        <StudioField label="Image URLs (one per line)">
          <textarea value={images} onChange={(e) => { setImages(e.target.value); queueSave({ images: e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) }) }} rows={2} placeholder="https://…" className={FIELD} />
        </StudioField>
      </div>

      <div className="mt-4">
        <StudioField label="Details">
          <textarea value={description} onChange={(e) => { setDescription(e.target.value); queueSave({ description: e.target.value || null }) }} rows={5} maxLength={2000} className={FIELD} />
        </StudioField>
      </div>
    </StudioWindow>
  )
}
