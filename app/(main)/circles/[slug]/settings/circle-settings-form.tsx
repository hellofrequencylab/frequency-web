'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Check } from 'lucide-react'
import { archiveCircle, updateCircleSettings } from '@/app/(main)/admin/actions'
import { setCircleCoverUrl, removeCircleCover } from '@/app/(main)/circles/admin-actions'
import { DangerModal } from '@/components/admin/danger-modal'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

export interface CircleSettingsInitial {
  name: string
  about: string
  type: string
  memberCap: number
  imageUrl: string
  city: string
  neighborhood: string
  resonancePublic: boolean
  unlisted: boolean
}

// The label TEXT class. Fields wrap their control in a native <label> (HTML's implicit
// association); a <label> beside the control names nothing (ADR-966).
const lbl = 'block text-meta font-medium text-muted mb-1'

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
  const [unlisted, setUnlisted] = useState(initial.unlisted)
  const [pending, start] = useTransition()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, startArchive] = useTransition()
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const router = useRouter()

  function archive() {
    setArchiveError(null)
    startArchive(async () => {
      try {
        await archiveCircle(circleId)
        router.push('/circles')
      } catch (err) {
        // archiveCircle is host-or-admin gated and throws on failure. Surface it so the host
        // knows it didn't archive (a silent no-op reads as "nothing happened") and can retry.
        setArchiveError(err instanceof Error ? err.message : 'Could not archive this circle. Try again.')
      }
    })
  }

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
    fd.set('unlisted', unlisted ? 'on' : 'off')
    start(async () => {
      await updateCircleSettings(circleId, fd)
      router.push(`/circles/${slug}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={lbl}>Circle name *</span>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={pending} />
      </label>

      <label className="block sm:col-span-2">
        <span className={lbl}>About <span className="font-normal text-subtle">(optional)</span></span>
        <Textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder="What is this circle about?" disabled={pending} className="resize-none" />
      </label>

      <div>
        <label className={lbl} htmlFor="circle-type">Type</label>
        <Select
          id="circle-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={pending}
          options={[
            { value: 'in-person', label: 'In-person' },
            { value: 'online', label: 'Online' },
          ]}
        />
      </div>

      <label className="block">
        <span className={lbl}>Member cap</span>
        <Input type="number" min={1} max={500} value={cap} onChange={(e) => setCap(e.target.value)} disabled={pending} />
      </label>

      <div className="sm:col-span-2">
        <span className={lbl}>Cover image</span>
        {/* Server-side upload (uploadCircleCover, admin client) so it never trips storage RLS — the
            client-side uploader did. onChange tracks the URL so this form's Save persists the latest. */}
        <InlineCover
          value={imageUrl || null}
          alt={name || 'Circle cover'}
          canEdit
          forceEdit
          setUrl={setCircleCoverUrl.bind(null, circleId, slug)}
          remove={removeCircleCover.bind(null, circleId, slug)}
          onChange={(url) => setImageUrl(url ?? '')}
        />
        <p className="text-2xs text-muted">Shown on the circle&apos;s card and header.</p>
      </div>

      <label className="block">
        <span className={lbl}>City <span className="font-normal text-subtle">(optional)</span></span>
        <Input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Encinitas" disabled={pending} />
      </label>

      <label className="block">
        <span className={lbl}>Neighborhood <span className="font-normal text-subtle">(optional)</span></span>
        <Input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="e.g. Leucadia" disabled={pending} />
      </label>

      <div className="rounded-lg border border-border bg-surface-elevated/40 p-3 sm:col-span-2">
        <Checkbox
          checked={unlisted}
          onChange={(e) => setUnlisted(e.target.checked)}
          disabled={pending}
          label={<span className="font-medium">Unlisted</span>}
          hint="Keep this circle off the Circles directory, map, and search. Anyone with the link can still open it, and your members always see it. Great for a private group you invite by hand."
          wrapperClassName="flex"
        />
      </div>

      <div className="sm:col-span-2">
        <Checkbox
          checked={resonancePublic}
          onChange={(e) => setResonancePublic(e.target.checked)}
          disabled={pending}
          label={<>Show this circle&apos;s resonance publicly</>}
          wrapperClassName="flex"
        />
      </div>

      <div className="flex items-center gap-3 pt-1 sm:col-span-2">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Link href={`/circles/${slug}`} className="text-body-sm text-muted transition-colors hover:text-text">
          Cancel
        </Link>
      </div>

      <div className="mt-2 border-t border-border pt-5 sm:col-span-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Danger zone</p>
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          disabled={archiving || pending}
          className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-danger/30 px-3 py-2 text-body-sm font-medium text-danger transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
        >
          <Archive className="h-4 w-4" /> Archive this circle
        </button>
        <p className="mt-1.5 text-2xs text-muted">Hides the circle from discovery. An admin can restore it later.</p>
        {archiveError && <p className="mt-1.5 text-2xs font-medium text-danger">{archiveError}</p>}
      </div>

      <DangerModal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive this circle"
        body={
          <>
            Archiving <span className="font-semibold text-text">{name.trim() || 'this circle'}</span> hides it from
            discovery and its members lose access. It is not deleted, and an admin can restore it later.
          </>
        }
        confirmLabel="Archive circle"
        onConfirm={archive}
      />
    </form>
  )
}
