'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronUp, Loader2, Palette, Plus, Upload, X } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getAppearanceRailData } from '@/app/(main)/settings/rail-getters'
import {
  setSpotlightTheme,
  setSpotlightBackground,
  uploadSpotlightImage,
  setTopFriends,
  reorderTopFriends,
  removeTopFriend,
} from '@/app/(main)/settings/profile/spotlight-actions'
import { updateProfileTheme } from '@/lib/profile/profile-theme-actions'
import { PROFILE_SKINS } from '@/lib/theme/profile-skins'
import { SPOTLIGHT_FONTS, type SpotlightTheme } from '@/lib/spotlight/theme'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import { SPOTLIGHT_PUBLIC_BASE } from '@/lib/spotlight/puck/resolve'
import { SectionHeader } from '@/components/ui/section-header'
import { getInitials } from '@/lib/utils'

// Personal "You" module (ADR-525): the grid-side APPEARANCE surface for the Spotlight looks that lost their
// editor when the Puck Spotlight editor was retired (ADR-524). Their VALUES still render on the public
// /spotlight/<handle> page via SpotlightShell; this restores the edit UI. Four compact groups tuned for the
// ~360px rail: the profile SKIN, the Spotlight HEADER (framing + fonts), the page BACKGROUND (image +
// focus/dim/zoom), and TOP FRIENDS (pick / reorder / remove). A THIN wrapper: it self-fetches the read-gated
// getAppearanceRailData (null when signed out / cannot enable Spotlight → renders nothing, fail-safe) and
// reuses the RETAINED owner-gated actions (each re-checks auth + ownership + validates server-side), so this
// is convenience over unchanged authorities. No new writer duplicates a retained one.

type Data = NonNullable<Awaited<ReturnType<typeof getAppearanceRailData>>>

const HEADER_MIN = 80
const HEADER_MAX = 360

export function PersonalAppearanceModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  // Working copies (seeded from the read; each control saves through a retained action).
  const [profileTheme, setProfileTheme] = useState<string | null>(null)
  const [theme, setTheme] = useState<SpotlightTheme | null>(null)
  const [background, setBackground] = useState<SpotlightBackground | null>(null)
  const [topFriends, setTopFriendsState] = useState<TopFriend[]>([])

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    getAppearanceRailData().then((d) => {
      if (!active) return
      setData(d)
      if (d) {
        setProfileTheme(d.profileTheme)
        setTheme(d.theme)
        setBackground(d.background)
        setTopFriendsState(d.topFriends)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const mod = moduleById('account.spotlightAppearance')
  const Icon = mod?.Icon ?? Palette

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
  async function onPickFile(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
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

  // ── Top Friends ───────────────────────────────────────────────────────────────
  function addFriend(id: string) {
    const next = [...topFriends.map((f) => f.profileId), id]
    const added = data?.friendOptions.find((f) => f.profileId === id)
    if (added) setTopFriendsState((prev) => [...prev, added])
    void run(() => setTopFriends(next))
  }
  function moveFriend(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= topFriends.length) return
    const next = [...topFriends]
    ;[next[index], next[target]] = [next[target], next[index]]
    setTopFriendsState(next)
    void run(() => reorderTopFriends(next.map((f) => f.profileId)))
  }
  function dropFriend(id: string) {
    setTopFriendsState((prev) => prev.filter((f) => f.profileId !== id))
    void run(() => removeTopFriend(id))
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  // Signed out / no profile, or the member cannot turn Spotlight on → no chrome (fail-safe).
  if (!data || !data.canEnableSpotlight || !theme || !background) return null

  const featuredIds = new Set(topFriends.map((f) => f.profileId))
  const pickable = data.friendOptions.filter((f) => !featuredIds.has(f.profileId))

  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          {mod?.label ?? 'Page look'}
        </h3>
        {!data.spotlightEnabled && (
          <p className="text-xs text-muted">
            Turn your Spotlight on first to save these. They still shape your profile page.
          </p>
        )}
      </header>

      {/* Profile skin */}
      <div>
        <SectionHeader title="Skin" />
        <div className="flex flex-wrap gap-2">
          {PROFILE_SKINS.map((s) => {
            const active = (profileTheme ?? 'default') === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSkin(s.id)}
                disabled={pending}
                aria-pressed={active}
                title={s.description}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 motion-reduce:transition-none ${
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
        <div className="space-y-4 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-text">Show the cover band</span>
            <input
              type="checkbox"
              checked={theme.header.show}
              onChange={(e) => patchHeader({ show: e.target.checked })}
              disabled={pending}
              className="h-4 w-4 accent-[color:var(--color-primary)]"
            />
          </label>

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
        <div className="space-y-4 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          {background.assetPath ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
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
                  className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60"
                >
                  {uploading ? 'Uploading' : 'Replace'}
                </button>
                <button
                  type="button"
                  onClick={() => saveBackground({ ...background, assetPath: null })}
                  disabled={pending || uploading}
                  aria-label="Remove background"
                  className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
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
              className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
              {uploading ? 'Uploading' : 'Upload a photo'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
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

      {/* Top Friends */}
      <div>
        <SectionHeader title="Top Friends" count={topFriends.length} />
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          {topFriends.length === 0 ? (
            <p className="text-sm text-muted">Feature the friends you want front and center.</p>
          ) : (
            <ul className="space-y-2">
              {topFriends.map((f, i) => (
                <li key={f.profileId} className="flex items-center gap-2">
                  <Avatar friend={f} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {f.displayName || `@${f.handle}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveFriend(i, -1)}
                    disabled={pending || i === 0}
                    aria-label={`Move ${f.displayName || f.handle} up`}
                    className="rounded-md p-1 text-subtle transition-colors hover:text-text disabled:opacity-40"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFriend(i, 1)}
                    disabled={pending || i === topFriends.length - 1}
                    aria-label={`Move ${f.displayName || f.handle} down`}
                    className="rounded-md p-1 text-subtle transition-colors hover:text-text disabled:opacity-40"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => dropFriend(f.profileId)}
                    disabled={pending}
                    aria-label={`Remove ${f.displayName || f.handle}`}
                    className="rounded-md p-1 text-subtle transition-colors hover:text-danger disabled:opacity-40"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pickable.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Add a friend</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {pickable.map((f) => (
                  <li key={f.profileId}>
                    <button
                      type="button"
                      onClick={() => addFriend(f.profileId)}
                      disabled={pending}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated disabled:opacity-50"
                    >
                      <Avatar friend={f} />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">
                        {f.displayName || `@${f.handle}`}
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  )
}

function emptyBackground(): SpotlightBackground {
  return { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 }
}

function Avatar({ friend }: { friend: TopFriend }) {
  const name = friend.displayName || `@${friend.handle}`
  return friend.avatarUrl ? (
    <Image
      src={friend.avatarUrl}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong">
      {getInitials(name)}
    </span>
  )
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
      <span className="flex items-center justify-between text-sm text-text">
        {label}
        <span className="tabular-nums text-xs text-muted">
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
      <span className="text-sm text-text">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-canvas px-2 py-1 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
