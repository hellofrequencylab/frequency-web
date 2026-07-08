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
import { SPACE_THEMES, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceImages,
  uploadSpaceImage,
  setSpaceCoverScrim,
  setSpaceAccent,
  setSpaceHeaderCta,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  HEADER_CTA_FUNCTIONS,
  headerCtaFunctionLabel,
  isValidCtaUrl,
  type HeaderCtaFunction,
  type HeaderCtaPreference,
} from '@/lib/spaces/header-cta'

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
  headerCta = null,
  defaultCtaLabel,
  pageTheme,
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
  headerCta?: HeaderCtaPreference | null
  defaultCtaLabel: string
  /** The current Space PAGE STYLE (ADR-578) — the selected one of the 5 typography + shape themes. */
  pageTheme: SpaceThemeId
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

  // PAGE STYLE (ADR-578): the one of five typography + shape themes the page renders in. Optimistic like the
  // cover scrim — flip the active card now, persist to preferences.theme via updateSpaceProfile, and reflect
  // an external prop change back in with the render-time adjust-on-prop-change pattern (no effect).
  const [theme, setTheme] = useState<SpaceThemeId>(pageTheme)
  const [seenTheme, setSeenTheme] = useState<SpaceThemeId>(pageTheme)
  if (pageTheme !== seenTheme) {
    setSeenTheme(pageTheme)
    setTheme(pageTheme)
  }

  // HEADER BUTTON — the one dominant CTA on the profile hero. Three modes: 'default' (the per-type label +
  // the /book surface), 'function' (an in-house surface with an optional custom label), or 'custom' (the
  // owner's own URL + label). Local state so the picker is instant; it saves on the Save button (multiple
  // fields, unlike the auto-save single controls above).
  const [ctaMode, setCtaMode] = useState<'default' | 'function' | 'custom'>(
    headerCta?.kind === 'custom' ? 'custom' : headerCta?.kind === 'function' ? 'function' : 'default',
  )
  const [ctaFunction, setCtaFunction] = useState<HeaderCtaFunction>(
    headerCta?.kind === 'function' ? headerCta.function : 'book',
  )
  const [ctaFunctionLabel, setCtaFunctionLabel] = useState(
    headerCta?.kind === 'function' ? (headerCta.label ?? '') : '',
  )
  const [ctaUrl, setCtaUrl] = useState(headerCta?.kind === 'custom' ? headerCta.url : '')
  const [ctaCustomLabel, setCtaCustomLabel] = useState(headerCta?.kind === 'custom' ? headerCta.label : '')

  // Build the preference the current picker state represents (null = default = clear the override).
  function ctaPreference(): HeaderCtaPreference | null {
    if (ctaMode === 'function') {
      const label = ctaFunctionLabel.trim()
      return { kind: 'function', function: ctaFunction, ...(label ? { label } : {}) }
    }
    if (ctaMode === 'custom') {
      return { kind: 'custom', url: ctaUrl.trim(), label: ctaCustomLabel.trim() }
    }
    return null
  }

  const ctaCustomInvalid =
    ctaMode === 'custom' && (!ctaCustomLabel.trim() || !isValidCtaUrl(ctaUrl.trim()))

  function saveHeaderCta() {
    run(() => setSpaceHeaderCta(slug, ctaPreference()))
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

      {/* HEADER BUTTON — the one dominant action on your hero. Pick a built-in action, add your own link,
          or keep the default. Saved with its own Save button (it has more than one field). */}
      <section className="space-y-3">
        <SectionHeader title="Header button" />
        <p className="text-xs text-muted">
          The main button on your page. Keep the default, point it at one of your pages, or add your own
          link.
        </p>

        {/* Mode picker: Default / Built in / Custom link. */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'default' as const, label: 'Default' },
            { value: 'function' as const, label: 'Built in' },
            { value: 'custom' as const, label: 'Custom link' },
          ].map((m) => {
            const active = ctaMode === m.value
            return (
              <button
                key={m.value}
                type="button"
                disabled={readOnly || pending}
                onClick={() => setCtaMode(m.value)}
                aria-pressed={active}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default motion-reduce:transition-none',
                  active
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-muted hover:border-border-strong',
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {m.label}
                  {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                </span>
              </button>
            )
          })}
        </div>

        {ctaMode === 'default' && (
          <p className="text-xs text-subtle">
            Shows &ldquo;{defaultCtaLabel}&rdquo; and opens your booking page.
          </p>
        )}

        {ctaMode === 'function' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {HEADER_CTA_FUNCTIONS.map((f) => {
                const active = ctaFunction === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    disabled={readOnly || pending || active}
                    onClick={() => setCtaFunction(f.key)}
                    aria-pressed={active}
                    title={f.hint}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default motion-reduce:transition-none',
                      active
                        ? 'border-primary bg-primary-bg'
                        : 'border-border bg-surface hover:border-border-strong',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                      {f.label}
                      {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{f.hint}</span>
                  </button>
                )
              })}
            </div>
            <div>
              <Label htmlFor="cta-fn-label" className="mb-1 block font-semibold">
                Button text
              </Label>
              <Input
                id="cta-fn-label"
                value={ctaFunctionLabel}
                maxLength={40}
                disabled={readOnly}
                placeholder={headerCtaFunctionLabel(ctaFunction)}
                onChange={(e) => setCtaFunctionLabel(e.target.value)}
              />
              <p className="mt-1 text-xs text-subtle">Leave blank to use the default text.</p>
            </div>
          </div>
        )}

        {ctaMode === 'custom' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="cta-custom-label" className="mb-1 block font-semibold">
                Button text
              </Label>
              <Input
                id="cta-custom-label"
                value={ctaCustomLabel}
                maxLength={40}
                disabled={readOnly}
                placeholder="Visit our shop"
                onChange={(e) => setCtaCustomLabel(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cta-custom-url" className="mb-1 block font-semibold">
                Link
              </Label>
              <Input
                id="cta-custom-url"
                type="url"
                inputMode="url"
                value={ctaUrl}
                maxLength={2000}
                disabled={readOnly}
                placeholder="https://example.com"
                onChange={(e) => setCtaUrl(e.target.value)}
              />
              <p className="mt-1 text-xs text-subtle">Start with https:// for another site, or / for a page here.</p>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={readOnly || pending || ctaCustomInvalid}
          onClick={saveHeaderCta}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60',
          )}
        >
          Save button
        </button>
      </section>

      {/* PAGE STYLE — the typography + shape identity the whole page renders in. Five presets; the accent
          colour is set separately below. Optimistic buttons, each saves the moment it is picked. */}
      <section className="space-y-2">
        <SectionHeader title="Page style" />
        <p className="text-xs text-muted">
          The fonts and shapes for your whole page. Your colours stay the same. Pick the feel that fits.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SPACE_THEMES.map((t) => {
            const active = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                disabled={readOnly || pending || active}
                onClick={() => {
                  setTheme(t.id) // optimistic: flip the active card now, not after the refresh
                  run(() => updateSpaceProfile(spaceId, { theme: t.id }))
                }}
                aria-pressed={active}
                title={t.description}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default motion-reduce:transition-none',
                  active ? 'border-primary bg-primary-bg' : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  {t.label}
                  {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
              </button>
            )
          })}
        </div>
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
