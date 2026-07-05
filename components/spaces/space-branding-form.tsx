'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import { SectionHeader } from '@/components/ui/section-header'
import { ImageUpload } from '@/components/ui/image-upload'
import { AccentPicker } from '@/components/spaces/space-form'
import type { CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceImages,
  uploadSpaceImage,
  setSpaceCoverScrim,
  setSpaceAccent,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE SPACE BRANDING FORM (Space rail Section 2 — the profile+identity rework). The ONE place an operator
// sets everything VISUAL: the header (cover) image, the logo / profile image, the Hero cover style (how
// the name + buttons sit on the image), and the brand accent colour. Each control saves on its own the
// moment it resolves (an upload finishing, a scrim tap, an accent pick) through its owner-gated action, so
// there is no Save button. Every field here was previously duplicated across the Basics form, the Business
// info form, and the Page panel; it now lives ONLY here. Copy runs CONTENT-VOICE: plain, no em dashes.

// The two Hero cover-scrim treatments (a Space profile is always Hero, ADR-526). Compact buttons.
const COVER_SCRIMS: { value: CoverScrim; label: string; tagline: string }[] = [
  { value: 'shade', label: 'Shade', tagline: 'A soft dark fade so your name stays readable on any photo.' },
  { value: 'blend', label: 'Blend', tagline: 'The photo melts into the page. Best with a calm image.' },
]

export function SpaceBrandingForm({
  slug,
  coverImageUrl = null,
  brandLogoUrl = null,
  coverScrim,
  accent,
  readOnly = false,
}: {
  slug: string
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
