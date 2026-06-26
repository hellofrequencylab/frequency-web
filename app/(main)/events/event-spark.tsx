'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, ArrowLeft, Loader2, ScanLine, ImagePlus, CalendarDays, MapPin, Tag } from 'lucide-react'
import { WizardProgress, wizardPrimaryClass, wizardSecondaryClass } from '@/components/templates'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedEvent } from '@/lib/events/types'
import { sparkEventAction } from './create-actions'
import { saveDraft, scanPoster } from './scan/actions'
import { downscaleForScan } from './scan/image-tools'
import { EventForm } from './new/event-form'

// The PRIVATE bucket the poster scanner uploads to (owner-scoped RLS, path `${uid}/...`).
// scanPoster + saveDraft both re-validate the path is the caller's, so the wizard reuses it.
const SCAN_BUCKET = 'network-contacts'

// Vera's event Spark — the guided /events/new composer, mirroring the Journeys/Practices
// builder (components/journey/v2/journey-spark.tsx). Two ways in:
//   • QUESTIONS — a short stepped form (what / when / where / details), or
//   • FLYER     — paste a flyer or post and let Vera read it.
// Either way Vera drafts the event for review, then creating it runs through the SHARED
// saveDraft → draft editor → publish flow (the same one the poster scanner uses). Nothing
// persists until that create. "Fill it in myself" hands off to the manual EventForm; "Scan
// a poster" jumps to the vision flow. Degrades cleanly when Vera is off.

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

type Group = { id: string; name: string }

export function EventSpark({ groups, defaultGroupId }: { groups: Group[]; defaultGroupId?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'wizard' | 'manual'>('wizard')
  const [usingFlyer, setUsingFlyer] = useState(false)
  const [step, setStep] = useState(1)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [what, setWhat] = useState('')
  const [when, setWhen] = useState('')
  const [where, setWhere] = useState('')
  const [details, setDetails] = useState('')
  const [flyer, setFlyer] = useState('')
  // A photo of a flyer/poster the user uploaded: its stored path rides through to the draft as the
  // cover, and the vision read fills the rest. Set only when the photo path is used.
  const [posterPath, setPosterPath] = useState<string | null>(null)

  // Vera's drafted event (review step). title/description are the editable surface here; the
  // rest carries through to the draft editor untouched.
  const [draft, setDraft] = useState<ExtractedEvent | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  if (mode === 'manual') return <EventForm groups={groups} defaultGroupId={defaultGroupId} />

  const onReview = step === 5
  const total = usingFlyer ? 2 : 5
  const current = usingFlyer ? (onReview ? 2 : 1) : step
  const label = onReview ? 'Review' : usingFlyer ? 'Flyer or photo' : ['What', 'When', 'Where', 'Details'][step - 1]

  const generate = () => {
    setError(null)
    start(async () => {
      const res = await sparkEventAction({ what, when, where, details }, usingFlyer ? flyer : undefined)
      if (!res.ok) {
        setError(
          res.reason === 'ai_unavailable'
            ? 'Vera is off right now. Use "Fill it in myself" below.'
            : 'Sign in to draft an event.',
        )
        return // stay on this step; the manual fallback stays visible
      }
      setDraft(res.draft)
      setTitle(res.draft.title)
      setDescription(res.draft.description)
      setStep(5)
    })
  }

  // Upload a flyer/poster photo and let Vera read it (the same vision path as /events/scan, brought
  // inline). The photo is downscaled on-device, uploaded to the owner-scoped private bucket, read by
  // scanPoster, and KEPT as the draft's cover. Jumps straight to the review step on success.
  const onPhoto = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('That is not an image. Upload a photo of the flyer or poster.')
      return
    }
    setError(null)
    setExtracting(true)
    start(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Sign in to read a photo.')
          return
        }
        const small = await downscaleForScan(file)
        const path = `${user.id}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage
          .from(SCAN_BUCKET)
          .upload(path, small, { contentType: 'image/jpeg' })
        if (upErr) {
          setError('Could not upload that photo. Try again.')
          return
        }
        const res = await scanPoster([path])
        if (!res.ok) {
          setError(
            res.reason === 'ai_unavailable'
              ? 'Vera is off right now. Use "Fill it in myself" below.'
              : 'Could not read that photo. Try a sharper, straight-on shot.',
          )
          return
        }
        setDraft(res.extraction)
        setTitle(res.extraction.title)
        setDescription(res.extraction.description)
        setPosterPath(res.posterPath)
        setStep(5)
      } catch {
        setError('Could not read that photo. Try again.')
      } finally {
        setExtracting(false)
      }
    })
  }

  const create = () => {
    if (!title.trim() || !draft) return
    setError(null)
    start(async () => {
      const res = await saveDraft({
        title: title.trim(),
        description,
        startsAt: draft.startsAt || null,
        endsAt: draft.endsAt || null,
        location: draft.location,
        isFree: draft.isFree,
        priceCents: draft.priceCents,
        organizerName: draft.organizerName,
        organizerContact: draft.organizerContact,
        domain: draft.domain,
        details: draft.details,
        // The uploaded flyer photo (if any) becomes the draft's cover.
        posterPath,
      })
      if ('id' in res) router.push(`/events/drafts/${res.id}`)
      else setError(res.error)
    })
  }

  const next = () => {
    if (usingFlyer || step === 4) generate()
    else setStep((s) => Math.min(5, s + 1))
  }
  const back = () => setStep((s) => Math.max(1, s - 1))

  const canNext = usingFlyer
    ? flyer.trim().length > 0
    : (step === 1 && what.trim().length > 0) || step === 2 || step === 3 || step === 4

  const heading = onReview
    ? {
        title: 'Here is your event',
        description:
          "Vera's draft. Tidy the title and description, then create it. You'll set the exact time, place, cover, and tickets in the editor next.",
      }
    : usingFlyer
      ? { title: 'Paste or upload your event', description: 'Paste the full write-up, page, or post, or upload a photo of the flyer. Vera turns it into an event.' }
      : [
          { title: 'What is the event?', description: 'A sentence is plenty. Tell Vera what it is and she drafts the rest.' },
          { title: 'When is it?', description: 'In your own words, like "this Friday 7pm" or "March 1 at noon".' },
          { title: 'Where is it?', description: 'A venue and city, or online.' },
          { title: 'Anything else?', description: 'Who it is for, the price, what to bring. Optional.' },
        ][step - 1]

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <WizardProgress current={current} total={total} label={label} />

      <div className="mt-7">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">New event</p>
        <h1 className="text-2xl font-bold text-text">{heading.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{heading.description}</p>

        <div className="mt-5">
          {/* FLYER / PHOTO path: paste the full write-up OR upload a photo of the flyer. */}
          {usingFlyer && !onReview && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={flyer}
                onChange={(e) => setFlyer(e.target.value)}
                rows={8}
                className={FIELD}
                placeholder="Paste the full event write-up, page, or post here…"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || pending}
                  className={`${wizardSecondaryClass} !px-3 !py-2 text-sm`}
                >
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload a photo
                </button>
                <span className="text-xs text-subtle">A flyer or poster image. Vera reads it and keeps it as the cover.</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }}
                />
              </div>
            </div>
          )}

          {/* QUESTIONS path */}
          {!usingFlyer && step === 1 && (
            <>
              <textarea
                autoFocus
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                rows={3}
                className={FIELD}
                placeholder="e.g. A Sunday sound bath and tea circle for beginners."
              />
              <button
                type="button"
                onClick={() => { setUsingFlyer(true); setStep(1) }}
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-bg/20 px-4 py-3 text-left transition-colors hover:bg-primary-bg/40"
              >
                <ScanLine className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">Have a flyer or a post already?</span>
                  <span className="block text-xs leading-snug text-muted">Paste the full write-up or upload a photo, and Vera builds the whole event from it.</span>
                </span>
              </button>
            </>
          )}
          {!usingFlyer && step === 2 && (
            <input autoFocus value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD} placeholder="e.g. this Friday 7pm" />
          )}
          {!usingFlyer && step === 3 && (
            <input autoFocus value={where} onChange={(e) => setWhere(e.target.value)} className={FIELD} placeholder="e.g. Balboa Park, San Diego — or online" />
          )}
          {!usingFlyer && step === 4 && (
            <textarea
              autoFocus
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className={FIELD}
              placeholder="Who it's for, the price, what to bring…"
            />
          )}

          {/* REVIEW */}
          {onReview && draft && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${FIELD} font-semibold`} placeholder="Name your event" />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Description</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={FIELD} placeholder="What it is and who it's for." />
              </label>
              <div className="space-y-1.5 rounded-xl border border-border bg-canvas px-3 py-3 text-sm text-muted">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-subtle" />
                  {draft.startsAt ? formatWhen(draft.startsAt) : 'Add a date in the editor'}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-subtle" />
                  {draft.location || 'Add a place in the editor'}
                </p>
                <p className="flex items-center gap-2">
                  <Tag className="h-4 w-4 shrink-0 text-subtle" />
                  {draft.isFree ? 'Free' : draft.priceCents != null ? `$${(draft.priceCents / 100).toFixed(0)}` : 'Set the price in the editor'}
                  {draft.domain ? ` · ${draft.domain}` : ''}
                </p>
                <p className="text-2xs text-subtle">You&apos;ll set the exact time, place, cover image, and tickets in the editor next.</p>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-warning">{error}</p>}

        <div className="mt-7 flex gap-3">
          {(step > 1 || (usingFlyer && !onReview)) && (
            <button
              type="button"
              onClick={usingFlyer && !onReview ? () => setUsingFlyer(false) : back}
              disabled={pending}
              className={`${wizardSecondaryClass} flex-1`}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {!onReview ? (
            <button
              type="button"
              onClick={next}
              disabled={!canNext || pending}
              className={`${wizardPrimaryClass} ${step > 1 || usingFlyer ? 'flex-1' : 'w-full'}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : usingFlyer || step === 4 ? <Sparkles className="h-4 w-4" /> : null}
              {usingFlyer || step === 4 ? 'Draft with Vera' : 'Continue'}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={!title.trim() || pending || !draft} className={`${wizardPrimaryClass} flex-1`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create event
            </button>
          )}
        </div>
      </div>

      {!onReview && (
        <p className="mt-8 text-center text-xs text-subtle">
          <Link href="/events/scan" className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Scan a poster instead
          </Link>
          <span className="px-1.5 text-border" aria-hidden>·</span>
          <button type="button" onClick={() => setMode('manual')} className="underline-offset-4 transition-colors hover:text-muted hover:underline">
            Fill it in myself
          </button>
        </p>
      )}
    </div>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
