'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { ImageUpload } from '@/components/ui/image-upload'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  TextField,
  TextareaField,
  AccentPicker,
  VisibilityField,
  FormError,
} from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { setSpaceImages, uploadSpaceImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { draftSpaceBioAction, suggestTaglineAction } from '@/app/(main)/spaces/copilot-actions'

// The OWNER SETTINGS form (client). Edits the Space profile fields, grouped for clarity (ADR-516 D2):
//   • Identity — name, tagline, about (with the two Vera draft affordances)
//   • Images   — the header (cover) image + the logo, both real uploaders (not a URL box), saved the
//                moment an upload resolves through the owner-gated setSpaceImages
//   • Brand    — the brand color picker (a real color picker + on-brand swatches)
//   • Visibility
// Identity + Brand + Visibility persist together through the canEditProfile-gated updateSpaceProfile on
// Save; the images save on their own (like the business form), so a new header/logo shows without a
// second step. Every write action re-checks authorization server-side, so this client is convenience,
// never the gate. Reads well in the narrow rail (~360px, single column) and on the full basics page.
// COPY runs CONTENT-VOICE: plain labels, no narrated feelings, no em dashes.

export interface SpaceSettingsValues {
  brandName: string
  brandAccent: string
  brandLogoUrl: string
  /** The Space's header (cover) image URL, edited here alongside the logo. */
  coverImageUrl: string
  about: string
  tagline: string
  visibility: 'network' | 'private'
}

export function SpaceSettingsForm({
  spaceId,
  slug,
  initial,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  initial: SpaceSettingsValues
  /** Read-only mode for a STAFF PREVIEW (a janitor viewing a Space they don't manage). The whole
   *  form is rendered inside a disabled fieldset and the submit is a no-op, so nothing can be edited
   *  or saved here. The write actions (updateSpaceProfile / setSpaceImages) ALSO re-check the gate
   *  server-side, so this is a UI convenience over an unchanged server gate, never the gate itself. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [brandName, setBrandName] = useState(initial.brandName)
  const [brandAccent, setBrandAccent] = useState(initial.brandAccent)
  const [about, setAbout] = useState(initial.about)
  const [tagline, setTagline] = useState(initial.tagline)
  const [visibility, setVisibility] = useState<'network' | 'private'>(initial.visibility)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  // Images save on their own the moment an upload resolves (or is cleared), separate from the Save
  // button, mirroring the business form. They write the SAME cover_image_url / brand_logo_url columns.
  const [coverUrl, setCoverUrl] = useState<string | null>(initial.coverImageUrl || null)
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.brandLogoUrl || null)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imgPending, startImage] = useTransition()
  const saveImage = (patch: { coverImageUrl?: string | null; brandLogoUrl?: string | null }) => {
    setImgError(null)
    startImage(async () => {
      const result = await setSpaceImages(slug, patch)
      if (isError(result)) {
        setImgError(result.error)
        return
      }
      router.refresh()
    })
  }

  // Vera draft state, per field (so each button shows its own spinner + error).
  const [bioBusy, startBio] = useTransition()
  const [taglineBusy, startTagline] = useTransition()
  const [veraError, setVeraError] = useState<string | null>(null)

  function runDraft(
    action: () => Promise<ActionResult<string>>,
    apply: (text: string) => void,
    start: (cb: () => void) => void,
  ) {
    setVeraError(null)
    start(async () => {
      const result = await action()
      if (isError(result)) {
        setVeraError(result.error)
        return
      }
      apply(result.data)
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startSave(async () => {
      const result = await updateSpaceProfile(spaceId, {
        brandName: brandName.trim() || null,
        brandAccent: brandAccent || null,
        about: about.trim() || null,
        tagline: tagline.trim() || null,
        visibility,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  const veraButton = (onClick: () => void, busy: boolean, label: string) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || bioBusy || taglineBusy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong transition-colors hover:text-primary disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  )

  return (
    <form
      className="space-y-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending && !readOnly) save()
      }}
    >
      {/* A disabled fieldset natively disables every nested control (the inputs, the accent + visibility
          buttons, the uploaders, and the Vera affordances), so a STAFF PREVIEW reads the form but can
          edit nothing. Save lives outside it and is gated on `readOnly` directly. `display: contents`
          keeps the fieldset out of the layout box model. */}
      <fieldset disabled={readOnly} className="contents">
        {/* IDENTITY — the name and words. */}
        <section className="space-y-5">
          <SectionHeader title="Identity" />
          <TextField
            id="brand-name"
            label="Brand name"
            hint="Shown in your space header."
            value={brandName}
            onChange={setBrandName}
            placeholder="River Yoga"
            maxLength={200}
          />
          <TextareaField
            id="tagline"
            label="Tagline"
            hint="One plain line that says what you do."
            value={tagline}
            onChange={setTagline}
            placeholder="Slow, breath-led yoga by the river."
            rows={2}
            maxLength={200}
            action={veraButton(
              () => runDraft(() => suggestTaglineAction(spaceId), setTagline, startTagline),
              taglineBusy,
              'Suggest with Vera',
            )}
          />
          <TextareaField
            id="about"
            label="About"
            hint="A short bio for your profile. A few sentences is plenty."
            value={about}
            onChange={setAbout}
            placeholder="Tell people who you are and what they can expect."
            rows={6}
            maxLength={4000}
            action={veraButton(
              () => runDraft(() => draftSpaceBioAction(spaceId), setAbout, startBio),
              bioBusy,
              'Draft with Vera',
            )}
          />
          <p className="text-xs text-subtle">
            Vera is AI. The Draft and Suggest buttons write a starting point you review and edit; nothing
            is saved or published until you do.
          </p>
        </section>

        {/* IMAGES — the header (cover) and the logo, where you set your other identity images. Each saves
            on upload through the owner-gated setSpaceImages (same columns as the business info form). */}
        <section className="space-y-3">
          <SectionHeader title="Images" />
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              value={coverUrl}
              onChange={(v) => {
                setCoverUrl(v)
                saveImage({ coverImageUrl: v })
              }}
              label="Header image"
              hint="Wide banner across the top of your page. About 1600 by 500."
              folder="space-covers"
              disabled={readOnly}
              uploadFn={(file) => {
                const fd = new FormData()
                fd.append('file', file)
                return uploadSpaceImage(slug, 'cover', fd)
              }}
            />
            <ImageUpload
              value={logoUrl}
              onChange={(v) => {
                setLogoUrl(v)
                saveImage({ brandLogoUrl: v })
              }}
              label="Logo"
              hint="Your logo or mark, shown as your profile image. A square reads best."
              folder="space-logos"
              disabled={readOnly}
              uploadFn={(file) => {
                const fd = new FormData()
                fd.append('file', file)
                return uploadSpaceImage(slug, 'logo', fd)
              }}
            />
          </div>
          {imgPending && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving your image…
            </p>
          )}
          {imgError && <FormError message={imgError} />}
        </section>

        {/* BRAND — the accent color (a real color picker + on-brand swatches). */}
        <section className="space-y-3">
          <SectionHeader title="Brand" />
          <AccentPicker value={brandAccent} onChange={setBrandAccent} disabled={readOnly} />
        </section>

        {/* VISIBILITY — who can find this space. */}
        <section className="space-y-3">
          <SectionHeader title="Visibility" />
          <VisibilityField value={visibility} onChange={setVisibility} />
        </section>

        {veraError && (
          <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm font-medium text-warning" role="status">
            {veraError}
          </p>
        )}
        {error && <FormError message={error} />}
      </fieldset>

      {/* The action row lives OUTSIDE the disabled fieldset: Save is gated on `readOnly` directly (so a
          staff viewer can't submit), while "View profile" stays available so staff can still open the
          live profile. */}
      <div className="flex items-center gap-3 pt-1">
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden /> Save changes
              </>
            )}
          </Button>
        )}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push(`/spaces/${slug}`)} disabled={pending}>
          View profile
        </Button>
      </div>
    </form>
  )
}
