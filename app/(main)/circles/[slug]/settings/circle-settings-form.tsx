'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { updateCircleSettings } from '@/app/(main)/admin/actions'
import { ImageUpload } from '@/components/ui/image-upload'

export interface CircleSettingsInitial {
  name: string
  about: string
  type: string
  memberCap: number
  imageUrl: string
  city: string
  neighborhood: string
  resonancePublic: boolean
}

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl = 'block text-xs font-medium text-muted mb-1'

// Host self-service circle settings — the full-page editor a host opens from their circle.
// Writes only host-owned fields via updateCircleSettings (hub / host / status stay admin-only).
export function CircleSettingsForm({
  circleId,
  slug,
  initial,
}: {
  circleId: string
  slug: string
  initial: CircleSettingsInitial
}) {
  const [name, setName] = useState(initial.name)
  const [about, setAbout] = useState(initial.about)
  const [type, setType] = useState(initial.type)
  const [cap, setCap] = useState(String(initial.memberCap))
  const [imageUrl, setImageUrl] = useState(initial.imageUrl)
  const [city, setCity] = useState(initial.city)
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood)
  const [resonancePublic, setResonancePublic] = useState(initial.resonancePublic)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const fd = new FormData()
    fd.set('name', name)
    fd.set('about', about)
    fd.set('type', type)
    fd.set('member_cap', cap)
    fd.set('image_url', imageUrl)
    fd.set('city', city)
    fd.set('neighborhood', neighborhood)
    fd.set('resonance_public', resonancePublic ? 'on' : 'off')
    start(async () => {
      await updateCircleSettings(circleId, fd)
      router.push(`/circles/${slug}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={lbl}>Circle name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={pending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className={lbl}>About <span className="font-normal text-subtle">(optional)</span></label>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder="What is this circle about?" disabled={pending} className={`${input} resize-none`} />
      </div>

      <div>
        <label className={lbl}>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={pending} className={input}>
          <option value="in-person">In-person</option>
          <option value="online">Online</option>
        </select>
      </div>

      <div>
        <label className={lbl}>Member cap</label>
        <input type="number" min={1} max={500} value={cap} onChange={(e) => setCap(e.target.value)} disabled={pending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <ImageUpload
          label="Cover image"
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? '')}
          folder="circle-covers"
          hint="Shown on the circle's card and header."
          disabled={pending}
        />
      </div>

      <div>
        <label className={lbl}>City <span className="font-normal text-subtle">(optional)</span></label>
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Encinitas" disabled={pending} className={input} />
      </div>

      <div>
        <label className={lbl}>Neighborhood <span className="font-normal text-subtle">(optional)</span></label>
        <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="e.g. Leucadia" disabled={pending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={resonancePublic} onChange={(e) => setResonancePublic(e.target.checked)} disabled={pending} className="h-4 w-4 rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/40" />
          Show this circle&apos;s resonance publicly
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Link href={`/circles/${slug}`} className="text-sm text-muted transition-colors hover:text-text">
          Cancel
        </Link>
      </div>
    </form>
  )
}
