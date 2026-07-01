'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { ArrowUp, ArrowDown, Check, ImageIcon, Loader2, Plus, Upload, X } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { MAX_TOP_FRIENDS, type SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import type { TopFriend } from '@/lib/spotlight/top-friends.types'
import {
  saveSpotlightBackground,
  uploadSpotlightImage,
  setTopFriends as setTopFriendsAction,
} from '@/app/(main)/settings/profile/spotlight-actions'

// THE SPOTLIGHT "CHROME" EDITORS — the page background image and the Top Friends picker.
// These sit OUTSIDE the Puck block body: the background lives at meta.spotlight.background
// (page chrome, not a block) and the Top Friends PICKS live in the spotlight_top_friends
// table (the Puck TopFriends block only marks WHERE the grid renders). The new Puck editor
// (components/spotlight/puck-editor.tsx) renders these in its Theme drawer so nothing the
// old bespoke builder offered is lost. Each saves through the SAME session-derived, owner-
// gated server actions as before — no new write path.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

function Slider({
  label, suffix = '', min, max, step, value, onChange,
}: {
  label: string; suffix?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{value}{suffix}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

// ── Background image editor (page chrome) ───────────────────────────────────────

export function SpotlightBackgroundEditor({ initial }: { initial: SpotlightBackground }) {
  const [background, setBackground] = useState<SpotlightBackground>(initial)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  function setBg(p: Partial<SpotlightBackground>) {
    setBackground((b) => ({ ...b, ...p }))
  }

  function save(next: SpotlightBackground) {
    setError('')
    start(async () => {
      const res = await saveSpotlightBackground(next)
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  async function pick(file: File) {
    setError('')
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    setBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await uploadSpotlightImage(fd)
    setBusy(false)
    if (res.error || !res.path) { setError(res.error ?? 'Upload failed.'); return }
    setBackground((b) => ({ ...b, assetPath: res.path! }))
  }

  const previewSrc = background.assetPath ? `${PUBLIC_BASE}${background.assetPath}` : null

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Background</p>
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
          <ImageIcon className="h-3.5 w-3.5" /> Background image
        </span>
        {previewSrc ? (
          <div className="relative h-32 overflow-hidden rounded-xl border border-border">
            <Image src={previewSrc} alt="" width={768} height={320} unoptimized className="h-full w-full object-cover" />
            <div className="absolute right-2 top-2 flex gap-1.5">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60">
                {busy ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                onClick={() => { const next = { ...background, assetPath: null }; setBackground(next); save(next) }}
                disabled={busy}
                aria-label="Remove image"
                className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {busy ? 'Uploading…' : 'Upload image or GIF'}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }}
        />
        <p className="text-2xs text-muted">JPEG, PNG, GIF, or WebP. Up to 5 MB.</p>
      </div>

      {background.assetPath && (
        <div className="mt-3 space-y-2">
          <Slider label="Dim for readable text" suffix="%" min={0} max={80} step={5} value={background.dim} onChange={(v) => setBg({ dim: v })} />
          <Slider label="Position across" suffix="%" min={0} max={100} step={1} value={background.focusX} onChange={(v) => setBg({ focusX: v })} />
          <Slider label="Position up/down" suffix="%" min={0} max={100} step={1} value={background.focusY} onChange={(v) => setBg({ focusY: v })} />
          <Slider label="Zoom" suffix="%" min={100} max={200} step={5} value={background.zoom} onChange={(v) => setBg({ zoom: v })} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(background)}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save background'}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </section>
  )
}

// ── Top Friends picker ──────────────────────────────────────────────────────────

function FriendAvatar({ friend, small = false }: { friend: TopFriend; small?: boolean }) {
  const size = small ? 'h-5 w-5 text-2xs' : 'h-8 w-8 text-xs'
  const name = friend.displayName || `@${friend.handle}`
  if (friend.avatarUrl) {
    return <Image src={friend.avatarUrl} alt="" width={32} height={32} unoptimized className={`${size} shrink-0 rounded-full object-cover`} />
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary-bg font-bold text-primary-strong`}>
      {getInitials(name)}
    </span>
  )
}

export function SpotlightTopFriendsPicker({
  initialSelected,
  choices,
}: {
  initialSelected: TopFriend[]
  choices: TopFriend[]
}) {
  const [selected, setSelected] = useState<TopFriend[]>(initialSelected)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const selectedIds = new Set(selected.map((f) => f.profileId))
  const available = choices.filter((f) => !selectedIds.has(f.profileId))
  const full = selected.length >= MAX_TOP_FRIENDS

  function persist(next: TopFriend[]) {
    setSelected(next)
    setError('')
    start(async () => {
      const res = await setTopFriendsAction(next.map((f) => f.profileId))
      if (res?.error) setError(res.error)
    })
  }

  function move(id: string, dir: -1 | 1) {
    const i = selected.findIndex((f) => f.profileId === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= selected.length) return
    const next = [...selected]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Top Friends</p>
      <p className="text-xs text-subtle">Pick the friends to feature, in order. Up to {MAX_TOP_FRIENDS}.</p>

      {choices.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-surface/50 p-3 text-xs text-muted">
          Add some friends first, then come back to feature them here.
        </p>
      )}

      {selected.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {selected.map((f, i) => (
            <li key={f.profileId} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5">
              <FriendAvatar friend={f} />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{f.displayName || `@${f.handle}`}</span>
              <button type="button" onClick={() => move(f.profileId, -1)} disabled={i === 0 || pending} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(f.profileId, 1)} disabled={i === selected.length - 1 || pending} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => persist(selected.filter((x) => x.profileId !== f.profileId))} disabled={pending} className="rounded-md p-1 text-subtle hover:text-danger disabled:opacity-30" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
            {full ? `That's your Top ${MAX_TOP_FRIENDS}. Remove one to swap.` : 'Add a friend'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((f) => (
              <button
                key={f.profileId}
                type="button"
                onClick={() => { if (!full) persist([...selected, f]) }}
                disabled={full || pending}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
              >
                <FriendAvatar friend={f} small />
                <span className="max-w-[8rem] truncate">{f.displayName || `@${f.handle}`}</span>
                <Plus className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-2xs text-danger">{error}</p>}
    </section>
  )
}
