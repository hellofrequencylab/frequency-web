'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Loader2, Upload, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { getAppearanceRailData } from '@/app/(main)/settings/rail-getters'
import {
  setSpotlightTheme,
  setSpotlightBackground,
  uploadSpotlightImage,
} from '@/app/(main)/settings/profile/spotlight-actions'
import { updateProfileTheme } from '@/lib/profile/profile-theme-actions'
import { PROFILE_SKINS } from '@/lib/theme/profile-skins'
import { SPOTLIGHT_FONTS, type SpotlightTheme } from '@/lib/spotlight/theme'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import { unlockedCosmetics } from '@/lib/spotlight/cosmetics'
import { SPOTLIGHT_PUBLIC_BASE } from '@/lib/spotlight/puck/resolve'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import { SectionHeader } from '@/components/ui/section-header'

// Personal "You" module (ADR-525): the grid-side APPEARANCE surface for the Spotlight looks that lost their
// editor when the Puck Spotlight editor was retired (ADR-524). Their VALUES still render on the public
// /spotlight/<handle> page via SpotlightShell; this restores the edit UI. Four compact groups tuned for the
// ~360px rail: the profile SKIN, the Spotlight HEADER (framing + fonts), the page BACKGROUND (image +
// focus/dim/zoom), STICKERS (place / move / remove, ADR-1275), and TOP FRIENDS (pick / reorder / remove). A THIN wrapper: it self-fetches the read-gated
// getAppearanceRailData (null when signed out / cannot enable Spotlight → renders nothing, fail-safe) and
// reuses the RETAINED owner-gated actions (each re-checks auth + ownership + validates server-side), so this
// is convenience over unchanged authorities. No new writer duplicates a retained one.

type Data = NonNullable<Awaited<ReturnType<typeof getAppearanceRailData>>>

const HEADER_MIN = 80
const HEADER_MAX = 360

export function PersonalAppearanceModule({ onSkinChange }: { onSkinChange?: (skin: string) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  // Working copies (seeded from the read; each control saves through a retained action).
  const [profileTheme, setProfileTheme] = useState<string | null>(null)
  const [theme, setTheme] = useState<SpotlightTheme | null>(null)
  const [background, setBackground] = useState<SpotlightBackground | null>(null)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // The earned gate's picker half (ADR-1279): an earned skin is offered only when the
  // member holds its item. The writers re-check server-side, so hiding here is honesty, not security.
  const held = new Set(data?.heldItems ?? [])
  // A Crew theme (LIVE-757) is offered only to a member on Crew; the writer re-checks it.
  const skinOptions = unlockedCosmetics(PROFILE_SKINS, held).filter((s) => !s.crewOnly || data?.crewPerks === true)

  useEffect(() => {
    let active = true
    getAppearanceRailData().then((d) => {
      if (!active) return
      setData(d)
      if (d) {
        setProfileTheme(d.profileTheme)
        setTheme(d.theme)
        setBackground(d.background)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])


  async function run(work: () => Promise<{ error?: string } | void>) {
    setPending(true)
    setError('')
    try {
      const res = await work()
      if (res && 'error' in res && res.error) setError(res.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your change.')
    } finally {
      setPending(false)
    }
  }

  // ── Profile skin ──────────────────────────────────────────────────────────────
  function pickSkin(id: string) {
    setProfileTheme(id)
    onSkinChange?.(id)
    void run(() => updateProfileTheme(id))
  }

  // ── Spotlight header + fonts (setSpotlightTheme takes the FULL theme; merge over current) ──
  function saveTheme(next: SpotlightTheme) {
    setTheme(next)
    void run(() => setSpotlightTheme(next))
  }
  function patchHeader(patch: Partial<SpotlightTheme['header']>) {
    if (!theme) return
    saveTheme({ ...theme, header: { ...theme.header, ...patch } })
  }
  function patchFont(patch: Partial<SpotlightTheme['font']>) {
    if (!theme) return
    saveTheme({ ...theme, font: { ...theme.font, ...patch } })
  }

  // ── Background ──────────────────────────────────────────────────────────────────
  function saveBackground(next: SpotlightBackground) {
    setBackground(next)
    void run(() => setSpotlightBackground(next))
  }
  async function onPickFile(raw: File) {
    setUploading(true)
    setError('')
    try {
      // Convert an iPhone HEIC to JPEG + downscale big photos in the browser first — the server action
      // only accepts JPEG/PNG/GIF/WebP, and a raw HEIC renders broken in every browser but Safari.
      const prepared = await prepareImageForUpload(raw)
      if ('error' in prepared) {
        setError(prepared.error)
        return
      }
      const fd = new FormData()
      fd.append('file', prepared.file)
      const res = await uploadSpotlightImage(fd)
      if (res.error || !res.path) {
        setError(res.error ?? 'Upload failed.')
        return
      }
      saveBackground({ ...(background ?? emptyBackground()), assetPath: res.path })
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  // Signed out / no profile, or the member cannot turn Spotlight on → no chrome (fail-safe).
  if (!data || !data.canEnableSpotlight || !theme || !background) return null

  return (
    <section className="min-w-0 space-y-6">
      {!data.spotlightEnabled && (
        <p className="text-meta text-muted">
          Turn your Spotlight on first to save these. They still shape your profile page.
        </p>
      )}

      {/* Profile skin */}
      <div>
        <SectionHeader title="Skin" />
        <div className="flex flex-wrap gap-2">
          {skinOptions.map((s) => {
            const active = (profileTheme ?? 'default') === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSkin(s.id)}
                disabled={pending}
                aria-pressed={active}
                title={s.description}
                className={`rounded-control border px-3 py-1.5 text-body-sm font-medium transition-colors disabled:opacity-50 motion-reduce:transition-none ${
                  active
                    ? 'border-primary bg-primary-bg text-primary-strong'
                    : 'border-border text-text hover:bg-surface-elevated'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Spotlight header + fonts */}
      <div>
        <SectionHeader title="Header" />
        <div className="space-y-4 rounded-card border border-border bg-surface-elevated/40 p-4">
          {/* Row order is preserved by reversing the flex, so the text stays on the left of the
              box the way every other row in this panel reads. */}
          <Checkbox
            label="Show the cover band"
            checked={theme.header.show}
            onChange={(e) => patchHeader({ show: e.target.checked })}
            disabled={pending}
            wrapperClassName="w-full flex-row-reverse justify-between gap-3"
          />

          {theme.header.show && (
            <>
              <RangeRow
                label="Height"
                value={theme.header.height}
                min={HEADER_MIN}
                max={HEADER_MAX}
                suffix="px"
                disabled={pending}
                onCommit={(v) => patchHeader({ height: v })}
              />
              <RangeRow
                label="Focus"
                value={theme.header.focusY}
                min={0}
                max={100}
                suffix="%"
                disabled={pending}
                onCommit={(v) => patchHeader({ focusY: v })}
              />
            </>
          )}

          <SelectRow
            label="Heading font"
            value={theme.font.heading}
            disabled={pending}
            options={SPOTLIGHT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) => patchFont({ heading: v as SpotlightTheme['font']['heading'] })}
          />
          <SelectRow
            label="Body font"
            value={theme.font.body}
            disabled={pending}
            options={SPOTLIGHT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) => patchFont({ body: v as SpotlightTheme['font']['body'] })}
          />
        </div>
      </div>

      {/* Background */}
      <div>
        <SectionHeader title="Background" />
        <div className="space-y-4 rounded-card border border-border bg-surface-elevated/40 p-4">
          {background.assetPath ? (
            <div className="relative overflow-hidden rounded-card border border-border">
              {/* Unoptimized: the background lives in the public avatars bucket, not a next/image domain. */}
              <Image
                src={`${SPOTLIGHT_PUBLIC_BASE}${background.assetPath}`}
                alt=""
                width={320}
                height={128}
                unoptimized
                className="h-32 w-full object-cover"
                style={{ objectPosition: `${background.focusX}% ${background.focusY}%` }}
              />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={pending || uploading}
                  className="rounded-control bg-canvas/90 px-2.5 py-1 text-meta font-medium text-text lift-1 backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
                >
                  {uploading ? 'Uploading' : 'Replace'}
                </button>
                <button
                  type="button"
                  onClick={() => saveBackground({ ...background, assetPath: null })}
                  disabled={pending || uploading}
                  aria-label="Remove background"
                  className="rounded-control bg-canvas/90 p-1 text-subtle lift-1 backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending || uploading}
              className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-border text-body-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
              {uploading ? 'Uploading' : 'Upload a photo'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onPickFile(f)
              e.target.value = ''
            }}
          />

          {background.assetPath && (
            <>
              <RangeRow
                label="Focus across"
                value={background.focusX}
                min={0}
                max={100}
                suffix="%"
                disabled={pending}
                onCommit={(v) => saveBackground({ ...background, focusX: v })}
              />
              <RangeRow
                label="Focus down"
                value={background.focusY}
                min={0}
                max={100}
                suffix="%"
                disabled={pending}
                onCommit={(v) => saveBackground({ ...background, focusY: v })}
              />
              <RangeRow
                label="Dim"
                value={background.dim}
                min={0}
                max={80}
                suffix="%"
                disabled={pending}
                onCommit={(v) => saveBackground({ ...background, dim: v })}
              />
              <RangeRow
                label="Zoom"
                value={background.zoom}
                min={100}
                max={200}
                suffix="%"
                disabled={pending}
                onCommit={(v) => saveBackground({ ...background, zoom: v })}
              />
            </>
          )}
        </div>
      </div>

      {error && <p className="text-meta text-danger">{error}</p>}
    </section>
  )
}

function emptyBackground(): SpotlightBackground {
  return { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 }
}

/** A labeled slider that reports its value on release (onCommit), keeping saves off every tick. */
function RangeRow({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  // Reset the local (dragging) value when the authoritative prop changes — the render-time pattern, so no
  // effect (React docs: "adjusting state when a prop changes").
  const [local, setLocal] = useState(value)
  const [seed, setSeed] = useState(value)
  if (value !== seed) {
    setSeed(value)
    setLocal(value)
  }
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-body-sm text-text">
        {label}
        <span className="tabular-nums text-meta text-muted">
          {local}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="w-full accent-[color:var(--color-primary)] disabled:opacity-50"
      />
    </label>
  )
}

/** A labeled select over a closed option list. */
function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-body-sm text-text">{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        wrapperClassName="inline-block w-max max-w-full shrink-0"
      />
    </label>
  )
}
