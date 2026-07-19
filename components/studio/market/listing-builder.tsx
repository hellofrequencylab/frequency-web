'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, Eye, MapPin, Check, Loader2, Plus, X } from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { useStudioDraft } from '../kit/use-studio-draft'
import { StudioField } from '../kit/studio-field'
import { SaveStatus, StudioFooter } from '../kit/studio-footer'
import { getBrowserPosition } from '@/lib/geo-browser'
import { LISTING_KINDS, type ListingDetailField, type ListingKind, type ListingPatch, type ListingStatus } from '@/lib/marketplace'
import { updateListingAction } from '@/app/(main)/classifieds/actions'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { ListingOwnerControls } from '@/components/market/listing-owner-controls'
import { ListingShareButton } from '@/components/marketplace/listing-share-button'

const FIELD = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

// Best-practice detail fields a seller can add with one tap. A field with `options` edits its value
// through a select; the rest are free text. Every preset still persists through the same
// details {label,value} array, so nothing downstream changes.
const PRESET_DETAILS: { label: string; options?: string[]; placeholder?: string }[] = [
  { label: 'Condition', options: ['New', 'Like new', 'Good', 'Fair', 'For parts'] },
  { label: 'Brand', placeholder: 'West Elm' },
  { label: 'Dimensions', placeholder: '36in round, 30in tall' },
  { label: 'Age', placeholder: 'Used ~2 months' },
  { label: 'Pickup or delivery', options: ['Pickup only', 'Can deliver locally', 'Can ship'] },
]

const presetFor = (label: string) => PRESET_DETAILS.find((p) => p.label === label)

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
  details: ListingDetailField[]
  pickupAddress: string | null
  pickupPrecision: 'area' | 'exact'
  status: ListingStatus
}

// Edit a listing on the Studio shell (entity #4 to ride the kit) — autosaves each
// field via updateListingAction. Status/delete live on the detail page.
export function ListingBuilder(props: ListingBuilderProps) {
  const router = useRouter()
  const close = useCallback(() => router.push(`/classifieds/${props.id}`), [router, props.id])

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
  const [images, setImages] = useState<string[]>(props.images ?? [])
  const [hasGeo, setHasGeo] = useState(props.hasGeo)
  const [locating, setLocating] = useState(false)
  const [details, setDetails] = useState<ListingDetailField[]>(props.details ?? [])
  const [pickupAddress, setPickupAddress] = useState(props.pickupAddress ?? '')
  const [showExact, setShowExact] = useState(props.pickupPrecision === 'exact')

  const useMyLocation = async () => {
    setLocating(true)
    const pos = await getBrowserPosition()
    setLocating(false)
    if (pos) { setHasGeo(true); queueSave({ latitude: pos.lat, longitude: pos.lng }) }
  }
  const clearLocation = () => { setHasGeo(false); queueSave({ latitude: null, longitude: null }) }

  // Detail chips (Condition, Brand, Dimensions, ...) — repeatable label/value rows, autosaved.
  const commitDetails = (next: ListingDetailField[]) => { setDetails(next); queueSave({ details: next }) }
  const setDetail = (i: number, patch: Partial<ListingDetailField>) =>
    commitDetails(details.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const addDetail = () => commitDetails([...details, { label: '', value: '' }])
  const removeDetail = (i: number) => commitDetails(details.filter((_, j) => j !== i))
  // One-tap preset: append a row pre-labeled with the field. If that exact label already exists,
  // do nothing (no duplicate) so tapping twice is a no-op.
  const addPreset = (label: string) => {
    if (details.some((d) => d.label === label)) return
    commitDetails([...details, { label, value: '' }])
  }

  const footer = (
    <StudioFooter left={<SaveStatus state={saveState} error={error} />}>
      <a href={`/classifieds/${props.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
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

      {/* Pickup address (private by default). The map shows only the approximate area unless the seller
          chooses to reveal the exact address. */}
      <div className="mt-4">
        <StudioField label="Pickup address (private)">
          <input
            value={pickupAddress}
            onChange={(e) => { setPickupAddress(e.target.value); queueSave({ pickupAddress: e.target.value || null }) }}
            maxLength={200}
            placeholder="Where a buyer picks up. Not shown until you choose to reveal it."
            className={FIELD}
          />
        </StudioField>
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showExact}
            onChange={(e) => { setShowExact(e.target.checked); queueSave({ pickupPrecision: e.target.checked ? 'exact' : 'area' }) }}
            className="h-4 w-4 rounded border-border"
          />
          Show the exact address on the listing (off shows only the approximate area)
        </label>
      </div>

      {/* Item details — compact label/value chips shown in the listing right rail. */}
      <div className="mt-4">
        <StudioField label="Item details">
          <div className="space-y-2">
            {/* One-tap presets. Tapping a chip adds its row; a chip whose label is already present
                reads as added and does nothing. */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DETAILS.map((p) => {
                const added = details.some((d) => d.label === p.label)
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addPreset(p.label)}
                    disabled={added}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
                  >
                    {added ? <Check className="h-3.5 w-3.5 text-success" /> : <Plus className="h-3.5 w-3.5" />} {p.label}
                  </button>
                )
              })}
            </div>
            {details.map((d, i) => {
              const preset = presetFor(d.label)
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={d.label}
                    onChange={(e) => setDetail(i, { label: e.target.value })}
                    maxLength={40}
                    placeholder="Condition"
                    className={`${FIELD} w-1/3`}
                  />
                  {preset?.options ? (
                    <select
                      value={d.value}
                      onChange={(e) => setDetail(i, { value: e.target.value })}
                      className={`${FIELD} flex-1`}
                    >
                      <option value="">Choose one</option>
                      {preset.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={d.value}
                      onChange={(e) => setDetail(i, { value: e.target.value })}
                      maxLength={120}
                      placeholder={preset?.placeholder ?? 'Like new'}
                      className={`${FIELD} flex-1`}
                    />
                  )}
                  <button type="button" onClick={() => removeDetail(i)} aria-label="Remove detail" className="shrink-0 rounded-lg border border-border p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            <button type="button" onClick={addDetail} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated">
              <Plus className="h-4 w-4" /> Add detail
            </button>
          </div>
        </StudioField>
      </div>

      {/* Photos. The first tile is the cover; drag or use the arrows to reorder. Persists the
          ordered storage paths through the same images patch. */}
      <div className="mt-4">
        <MultiImageUpload
          loom
          label="Photos"
          value={images}
          onChange={(next) => { setImages(next); queueSave({ images: next }) }}
          folder="classifieds"
          max={6}
          reorderable
        />
      </div>

      <div className="mt-4">
        <StudioField label="Details">
          <textarea value={description} onChange={(e) => { setDescription(e.target.value); queueSave({ description: e.target.value || null }) }} rows={5} maxLength={2000} className={FIELD} />
        </StudioField>
      </div>

      {/* Manage. Every owner control lives here so the edit builder is the one place to run the
          listing: change its status, delete it, or share its QR and link. */}
      <div className="mt-6 border-t border-border pt-5">
        <StudioField label="Manage">
          <div className="space-y-3">
            <ListingOwnerControls id={props.id} status={props.status} />
            <ListingShareButton path={`/classifieds/${props.id}`} title={title} sharerProfileId={null} />
          </div>
        </StudioField>
      </div>
    </StudioWindow>
  )
}
