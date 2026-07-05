'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Textarea, Label } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { AccentPicker } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import type { CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceImages,
  uploadSpaceImage,
  setSpaceCoverScrim,
  setSpaceAccent,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE IDENTITY & BRANDING FORM (Space rail Section 1 — the standardized rail, ADR-535). The ONE place an
// operator sets everything that shows in the header HERO: brand name, tagline, header (cover) image, logo /
// profile image, the Hero cover style, and the brand accent. The name + tagline save on BLUR; the images,
// cover, and accent each save the moment they resolve — so there is no Save button. Copy runs CONTENT-VOICE:
// plain, no em dashes.

// The two Hero cover-scrim treatments (a Space profile is always Hero, ADR-526). Compact buttons.
const COVER_SCRIMS: { value: CoverScrim; label: string; tagline: string }[] = [
  { value: 'shade', label: 'Shade', tagline: 'A soft dark fade so your name stays readable on any photo.' },
  { value: 'blend', label: 'Blend', tagline: 'The photo melts into the page. Best with a calm image.' },
]

export function SpaceBrandingForm({
  spaceId,
  slug,
  brandName: initialBrandName,
  tagline: initialTagline,
  coverImageUrl = null,
  brandLogoUrl = null,
  coverScrim,
  accent,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  brandName: string
  tagline: string
  coverImageUrl?: string | null
  brandLogoUrl?: string | null
  coverScrim: CoverScrim
  accent: string
  readOnly?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [coverUrl, setCoverUrl] = useState<string | null>(coverImageUrl)
  const [logoUrl, setLogoUrl] = useState<string | null>(brandLogoUrl)

  // Name + tagline: local state, saved on BLUR (only when the value actually changed) via the profile
  // columns. Keeps the section button-free — every control here persists on its own.
  const [brandName, setBrandName] = useState(initialBrandName)
  const [tagline, setTagline] = useState(initialTagline)
  const saveField = (patch: { brandName?: string | null; tagline?: string | null }) =>
    run(() => updateSpaceProfile(spaceId, patch))

  // Track the cover scrim OPTIMISTICALLY: the buttons key off local state, not the server prop (which only
  // updates on router.refresh()). Without this, after picking one scrim the other button stayed "active +
  // disabled" until a reload, so you could not switch back (bug 2). Reflect an external prop change back in
  // with React's render-time adjust-on-prop-change pattern (no effect).
  const [scrim, setScrim] = useState<CoverScrim>(coverScrim)
  const [seenScrim, setSeenScrim] = useState<CoverScrim>(coverScrim)
  if (coverScrim !== seenScrim) {
    setSeenScrim(coverScrim)
    setScrim(coverScrim)
  }

  function run<T = void>(fn: () => Promise<ActionResult<T>>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (result && isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      {error && (
        <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* NAME + TAGLINE — the words that sit ON the hero. Saved on blur. */}
      <section className="space-y-4">
        <SectionHeader title="Name" />
        <div>
          <Label htmlFor="brand-name" className="mb-1 block font-semibold">Brand name</Label>
          <Input
            id="brand-name"
            value={brandName}
            maxLength={200}
            disabled={readOnly}
            placeholder="River Yoga"
            onChange={(e) => setBrandName(e.target.value)}
            onBlur={() => {
              if (brandName.trim() !== initialBrandName.trim()) saveField({ brandName: brandName.trim() || null })
            }}
          />
        </div>
        <div>
          <Label htmlFor="tagline" className="mb-1 block font-semibold">Tagline</Label>
          <Textarea
            id="tagline"
            rows={2}
            value={tagline}
            maxLength={200}
            disabled={readOnly}
            placeholder="Slow, breath-led yoga by the river."
            onChange={(e) => setTagline(e.target.value)}
            onBlur={() => {
              if (tagline.trim() !== initialTagline.trim()) saveField({ tagline: tagline.trim() || null })
            }}
          />
          <p className="mt-1 text-xs text-subtle">One plain line that says what you do.</p>
        </div>
      </section>

      {/* IMAGES — the header banner (full width) + the logo beneath at a square size. */}
      <section className="space-y-3">
        <SectionHeader title="Pictures" />
        <ImageUpload
          value={coverUrl}
          onChange={(v) => {
            setCoverUrl(v)
            run(() => setSpaceImages(slug, { coverImageUrl: v }))
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
        <div className="max-w-[12rem]">
          <ImageUpload
            value={logoUrl}
            onChange={(v) => {
              setLogoUrl(v)
              run(() => setSpaceImages(slug, { brandLogoUrl: v }))
            }}
            label="Logo"
            hint="Your profile image. A square reads best."
            folder="space-logos"
            disabled={readOnly}
            uploadFn={(file) => {
              const fd = new FormData()
              fd.append('file', file)
              return uploadSpaceImage(slug, 'logo', fd)
            }}
          />
        </div>
      </section>

      {/* COVER STYLE — how the name + buttons sit on the Hero cover. Compact buttons. */}
      <section className="space-y-2">
        <SectionHeader title="Cover style" />
        <div className="grid grid-cols-2 gap-2">
          {COVER_SCRIMS.map((c) => {
            const active = scrim === c.value
            return (
              <button
                key={c.value}
                type="button"
                disabled={readOnly || pending || active}
                onClick={() => {
                  setScrim(c.value) // optimistic: flip the active state now, not after the refresh
                  run(() => setSpaceCoverScrim(slug, c.value))
                }}
                aria-pressed={active}
                title={c.tagline}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default motion-reduce:transition-none',
                  active ? 'border-primary bg-primary-bg' : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  {c.label}
                  {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted">{COVER_SCRIMS.find((c) => c.value === scrim)?.tagline}</p>
      </section>

      {/* THEME ACCENT — the brand colour that paints buttons, the active tab, and highlights. */}
      <section className="space-y-2">
        <SectionHeader title="Theme accent" />
        <AccentPicker value={accent} onChange={(v) => run(() => setSpaceAccent(slug, v))} disabled={readOnly || pending} />
      </section>

      {pending && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
        </p>
      )}
    </div>
  )
}
