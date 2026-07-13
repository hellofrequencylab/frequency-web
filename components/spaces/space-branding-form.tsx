'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, PanelTop, Type, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Textarea, Label } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { ImageFocalPicker } from '@/components/ui/image-focal-picker'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'
import { AccentPicker } from '@/components/spaces/space-form'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { SPACE_THEMES, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { CoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import {
  setSpaceImages,
  uploadSpaceImage,
  setSpaceCoverScrim,
  setSpaceCoverFocus,
  setSpaceAccent,
  setSpaceHeaderCta,
  setSpaceHeroLook,
} from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  HEADER_CTA_FUNCTIONS,
  headerCtaFunctionLabel,
  isValidCtaUrl,
  type HeaderCtaFunction,
  type HeaderCtaPreference,
} from '@/lib/spaces/header-cta'
import { heroAspect, type HeroHeight, type HeroButtonOrientation } from '@/lib/spaces/hero-config'

// The hero LOOK controls that moved into Identity & Branding (item 5): Short/Medium/Tall height + the
// button orientation. Compact segmented buttons, matching Cover style / Page style. Each saves the moment
// it is picked (no Save button).
const HERO_HEIGHTS: { value: HeroHeight; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'tall', label: 'Tall' },
]
const HERO_BUTTONS: { value: HeroButtonOrientation; label: string }[] = [
  { value: 'row', label: 'In a row' },
  { value: 'stacked', label: 'Stacked' },
]

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
  coverFocus = DEFAULT_OBJECT_POSITION,
  accent,
  headerCta = null,
  defaultCtaLabel,
  pageTheme,
  heroHeight = 'medium',
  heroButtonOrientation = 'row',
  readOnly = false,
}: {
  spaceId: string
  slug: string
  brandName: string
  tagline: string
  coverImageUrl?: string | null
  brandLogoUrl?: string | null
  coverScrim: CoverScrim
  /** The saved hero cover FOCAL POINT (CSS object-position "x% y%"). Defaults to centered. */
  coverFocus?: string
  accent: string
  headerCta?: HeaderCtaPreference | null
  defaultCtaLabel: string
  /** The current Space PAGE STYLE (ADR-578) — the selected one of the 5 typography + shape themes. */
  pageTheme: SpaceThemeId
  /** The hero cover height + button orientation (item 5, edited here now, not in the page builder). */
  heroHeight?: HeroHeight
  heroButtonOrientation?: HeroButtonOrientation
  readOnly?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [coverUrl, setCoverUrl] = useState<string | null>(coverImageUrl)
  const [logoUrl, setLogoUrl] = useState<string | null>(brandLogoUrl)

  // HEADER FOCUS — where the cover sits in its cropped hero window (a CSS object-position). The SAME control
  // the admin event rail uses (ImageFocalPicker): the marker moves live while a drag DEBOUNCES the write, so a
  // drag does not fire a save per pixel. This is a reposition only; it never changes the header's height.
  const [focus, setFocus] = useState(coverFocus)
  const [, startFocus] = useTransition()
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onFocusChange(next: string) {
    setFocus(next)
    if (focusTimer.current) clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(() => {
      startFocus(async () => {
        const res = await setSpaceCoverFocus(slug, next)
        if (res && isError(res)) setError(res.error)
      })
    }, 400)
  }

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

  // HERO LOOK (item 5) — height + button orientation, moved here from the page builder. Optimistic, each
  // saves the moment it is picked via setSpaceHeroLook (which never touches the header CTA).
  const [hHeight, setHHeight] = useState<HeroHeight>(heroHeight)
  const [seenHHeight, setSeenHHeight] = useState<HeroHeight>(heroHeight)
  if (heroHeight !== seenHHeight) {
    setSeenHHeight(heroHeight)
    setHHeight(heroHeight)
  }
  const [hButtons, setHButtons] = useState<HeroButtonOrientation>(heroButtonOrientation)
  const [seenHButtons, setSeenHButtons] = useState<HeroButtonOrientation>(heroButtonOrientation)
  if (heroButtonOrientation !== seenHButtons) {
    setSeenHButtons(heroButtonOrientation)
    setHButtons(heroButtonOrientation)
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

  // Item 1: the header button AUTOSAVES like every other control — no Save button. Pass an explicit
  // preference when a pick changes state (avoids the stale-closure trap of reading just-set state); a
  // blur on the label/url fields saves the current state (an incomplete custom link is skipped).
  function saveCtaPref(pref: HeaderCtaPreference | null) {
    run(() => setSpaceHeaderCta(slug, pref))
  }
  function saveCurrentCta() {
    if (ctaMode === 'custom' && ctaCustomInvalid) return
    saveCtaPref(ctaPreference())
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

      {/* IMAGES — the header banner as ONE control (upload + reposition, previewed at the hero's set
          height RATIO) + the profile image with the header-height picker BESIDE it (item 4). */}
      <section className="space-y-4">
        <SectionHeader title="Pictures" />
        <HeaderImageField
          coverUrl={coverUrl}
          aspect={heroAspect(hHeight)}
          focus={focus}
          onFocusChange={onFocusChange}
          disabled={readOnly}
          uploadFn={(file) => {
            const fd = new FormData()
            fd.append('file', file)
            return uploadSpaceImage(slug, 'cover', fd)
          }}
          onChange={(v) => {
            setCoverUrl(v)
            run(() => setSpaceImages(slug, { coverImageUrl: v }))
          }}
        />
        {/* The profile image on the left, the header HEIGHT picker beside it: the control that sizes the
            header banner sits with the pictures it governs (restored + relocated, item 4). */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-[11rem] shrink-0">
            <ImageUpload
              value={logoUrl}
              onChange={(v) => {
                setLogoUrl(v)
                run(() => setSpaceImages(slug, { brandLogoUrl: v }))
              }}
              label="Logo or Profile Image"
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
          <div className="min-w-0 flex-1 space-y-2">
            <Label className="block font-semibold">Header height</Label>
            <div className="grid grid-cols-3 gap-2">
              {HERO_HEIGHTS.map((h) => {
                const active = hHeight === h.value
                return (
                  <button
                    key={h.value}
                    type="button"
                    disabled={readOnly || pending || active}
                    onClick={() => {
                      setHHeight(h.value)
                      run(() => setSpaceHeroLook(slug, { height: h.value }))
                    }}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default motion-reduce:transition-none',
                      active ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-border-strong',
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      {h.label}
                      {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted">How tall the header banner sits at the top of your page.</p>
          </div>
        </div>
      </section>

      {/* HEADER STYLE — a differentiated fold-open EDIT button (border + surface + icon so it reads as a
          button on all-white), CLOSED by default. Folds open to reveal buttons, shade, and the header button.
          Height lives beside the profile image now (item 4). Each control autosaves on pick / blur. */}
      <details className="group rounded-xl border border-border bg-surface-elevated">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-text outline-none transition-colors hover:border-border-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary/50 [&::-webkit-details-marker]:hidden">
          <PanelTop className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1">Header style</span>
          <span className="text-2xs font-medium text-subtle group-open:hidden">Edit</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="space-y-5 px-4 pb-4 pt-1">
        <div className="space-y-2">
          <Label className="block font-semibold">Buttons</Label>
          <div className="grid grid-cols-2 gap-2">
            {HERO_BUTTONS.map((b) => {
              const active = hButtons === b.value
              return (
                <button
                  key={b.value}
                  type="button"
                  disabled={readOnly || pending || active}
                  onClick={() => {
                    setHButtons(b.value)
                    run(() => setSpaceHeroLook(slug, { buttonOrientation: b.value }))
                  }}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default motion-reduce:transition-none',
                    active ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-border-strong',
                  )}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {b.label}
                    {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Shade — the cover-scrim treatment over the header photo. */}
        <div className="space-y-2">
          <Label className="block font-semibold">Shade</Label>
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
        </div>

        {/* Header button — the one dominant action on your hero. Autosaves on each pick / blur; a custom
            link only saves once its label + URL are valid. */}
        <div className="space-y-3">
          <Label className="block font-semibold">Header button</Label>
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
                  onClick={() => {
                    setCtaMode(m.value)
                    // Autosave the switch: Default clears the override; Built in saves the current function;
                    // Custom waits for a valid label + URL (saved on blur), so it does not clear the button.
                    if (m.value === 'default') saveCtaPref(null)
                    else if (m.value === 'function') {
                      const label = ctaFunctionLabel.trim()
                      saveCtaPref({ kind: 'function', function: ctaFunction, ...(label ? { label } : {}) })
                    }
                  }}
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
                      onClick={() => {
                        setCtaFunction(f.key)
                        const label = ctaFunctionLabel.trim()
                        saveCtaPref({ kind: 'function', function: f.key, ...(label ? { label } : {}) })
                      }}
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
                  onBlur={saveCurrentCta}
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
                  onBlur={saveCurrentCta}
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
                  onBlur={saveCurrentCta}
                />
                <p className="mt-1 text-xs text-subtle">Start with https:// for another site, or / for a page here.</p>
              </div>
            </div>
          )}
        </div>
        </div>
      </details>

      {/* PAGE STYLE — the typography + shape identity the whole page renders in. A clear button + dropdown
          (closed by default, matching Header): the presets stay tucked away until the operator opens it. The
          accent colour is set separately below. Optimistic buttons, each saves the moment it is picked. */}
      <details className="group rounded-xl border border-border bg-surface-elevated">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-text outline-none transition-colors hover:border-border-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary/50 [&::-webkit-details-marker]:hidden">
          <Type className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1">Page style</span>
          <span className="text-2xs font-medium text-subtle group-open:hidden">Edit</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="space-y-2 px-4 pb-4 pt-1">
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
        </div>
      </details>

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

// THE COMBINED HEADER IMAGE CONTROL — one control for the header/hero photo (upload + reposition), so the
// image, its crop, and the focus all live together instead of a separate upload box and focus card. When a
// photo is set, the preview renders IN THE RAIL at the HERO'S SET HEIGHT RATIO (`aspect`, not a fixed pixel
// height) with the drag-to-focus marker on it (the same reusable ImageFocalPicker the event rail uses) plus
// Replace / Remove — so the box is the same SHAPE as the live header (wide + short for Short, taller for Tall)
// whatever the rail width. Empty, it falls back to the shared ImageUpload dropzone (upload or paste a URL).
// Server-side upload (uploadFn), so it never depends on a live browser Storage token. Copy runs CONTENT-VOICE.
function HeaderImageField({
  coverUrl,
  aspect,
  focus,
  onFocusChange,
  disabled = false,
  uploadFn,
  onChange,
}: {
  coverUrl: string | null
  /** The width:height aspect ratio of the hero at its current height, so the preview matches the live crop
   *  shape at any rail width (heroAspect). */
  aspect: number
  /** The saved cover focal point ("x% y%") and its debounced setter (owned by the parent form). */
  focus: string
  onFocusChange: (v: string) => void
  disabled?: boolean
  uploadFn: (file: File) => Promise<{ url: string } | { error: string }>
  /** Called with the new public URL (cache-busted) after an upload, or null when the photo is removed. */
  onChange: (v: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doUpload(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`)
      return
    }
    setBusy(true)
    const res = await uploadFn(file)
    setBusy(false)
    if ('error' in res) {
      setError(`Upload failed: ${res.error}`)
      return
    }
    // Cache-bust so a replace shows immediately.
    onChange(`${res.url}?t=${Date.now()}`)
  }

  // Empty: the shared dropzone (upload + paste-a-URL), labelled as the header image.
  if (!coverUrl) {
    return (
      <ImageUpload
        value={null}
        onChange={onChange}
        label="Header image"
        hint="Wide banner across the top of your page. About 1600 by 500."
        folder="space-covers"
        disabled={disabled}
        uploadFn={uploadFn}
      />
    )
  }

  // Set: ONE control — the preview at the hero's set height, the drag-to-focus selector on it, and Replace /
  // Remove overlaid. Repositioning never changes the header height; it only picks what stays in frame.
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <ImageFocalPicker
          imageUrl={coverUrl}
          value={focus}
          onChange={onFocusChange}
          disabled={disabled || busy}
          label="Header image"
          hint="Drag to choose which part of your header photo stays in frame. This preview matches your header height."
          showSliders={false}
          aspect={aspect}
        />
        {/* Replace / Remove sit top-right over the preview; the focal marker owns the rest of the frame. */}
        <div className="absolute right-2 top-9 flex gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60 motion-reduce:transition-none"
          >
            {busy ? 'Uploading…' : 'Replace'}
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || busy}
            aria-label="Remove header image"
            className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60 motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void doUpload(f)
          e.target.value = ''
        }}
      />
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}
