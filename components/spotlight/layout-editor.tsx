'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Trash2, Plus, Check, Loader2, ExternalLink, Upload, ImageIcon, X } from 'lucide-react'
import {
  type SpotlightBlock,
  type SpotlightBackground,
  type SpotlightStatKey,
  type BlockTint,
  type BlockType,
  type EmbedBlock,
  BLOCK_PALETTE,
  MAX_BLOCKS,
  MAX_GALLERY_IMAGES,
  MAX_TOP_FRIENDS,
  ALT_MAX,
  QUOTE_MAX,
  CITE_MAX,
  LABEL_MAX,
  SPOTLIGHT_STAT_KEYS,
  SPOTLIGHT_LAYOUT_VERSION,
} from '@/lib/spotlight/blocks/schema'

// Block types that support a per-block colour override (text/background).
const TINTABLE = new Set<BlockType>(['heading', 'text', 'links', 'quote', 'divider'])
import {
  saveSpotlightLayout,
  saveSpotlightBackground,
  uploadSpotlightImage,
  setTopFriends as setTopFriendsAction,
} from '@/app/(main)/settings/profile/spotlight-actions'
import { parseEmbedUrl, buildEmbedSrc, embedHeight } from '@/lib/spotlight/embeds'
import type { TopFriend } from '@/lib/spotlight/top-friends'
import { getInitials } from '@/lib/utils'

// Resolve a stored asset PATH to its public URL for previews. The path is the only thing
// we persist (the renderer derives the URL the same way), so the editor mirrors it.
const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

let counter = 0
function newId() {
  counter += 1
  return `b_${Date.now().toString(36)}${counter}`
}

function blankBlock(type: SpotlightBlock['type']): SpotlightBlock {
  const id = newId()
  switch (type) {
    case 'heading': return { id, type, text: '', level: 2 }
    case 'text': return { id, type, text: '' }
    case 'links': return { id, type, items: [{ label: '', url: '' }] }
    case 'image': return { id, type, assetPath: '', alt: '' }
    case 'gallery': return { id, type, items: [] }
    case 'quote': return { id, type, text: '' }
    case 'stats': return { id, type, show: [] }
    case 'topfriends': return { id, type }
    case 'embed': return { id, type, provider: 'spotify', ref: '' }
    case 'divider': return { id, type }
  }
}

const STAT_LABELS: Record<SpotlightStatKey, string> = {
  zaps: 'Zaps',
  streak: 'Day streak',
  gems: 'Gems earned',
  joined: 'Member since',
  region: 'Region',
}

const inputCls =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none'

// One upload control shared by image blocks and the background. Posts the file to the
// session-derived server action (service-role write — the browser client has no session
// under SSR-cookie auth) and hands back the storage PATH. Previews resolve the path to a
// public URL; the parent owns the value + the save.
function SpotlightImageUploader({
  value,
  onChange,
  label,
  height = 'h-40',
  square = false,
}: {
  value: string | null
  onChange: (path: string | null) => void
  label: string
  height?: string
  /** Render the frame as a 1:1 square (matches how galleries display publicly). */
  square?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    setBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await uploadSpotlightImage(fd)
    setBusy(false)
    if (res.error || !res.path) { setError(res.error ?? 'Upload failed.'); return }
    onChange(res.path)
  }

  const previewSrc = value ? `${PUBLIC_BASE}${value}` : null
  const frame = square ? 'aspect-square w-full' : height

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <ImageIcon className="h-3.5 w-3.5" /> {label}
      </span>
      {previewSrc ? (
        <div className={`relative ${frame} overflow-hidden rounded-xl border border-border`}>
          {/* Unoptimized: member-uploaded assets from Supabase Storage, not the configured next/image domains. */}
          <Image src={previewSrc} alt="" width={768} height={320} unoptimized className="h-full w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-lg bg-canvas/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-canvas disabled:opacity-60">
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button type="button" onClick={() => onChange(null)} disabled={busy} aria-label="Remove image" className="rounded-lg bg-canvas/90 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-60">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`flex ${frame} w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60`}>
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
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}

// Controlled: the parent (the builder) owns `blocks` + `background` so the live preview
// reflects edits as they happen. The editor keeps its own Save buttons (they persist the
// current value) and transient saved/error/pending state.
export function LayoutEditor({
  blocks,
  onBlocksChange,
  background,
  onBackgroundChange,
  topFriends,
  onTopFriendsChange,
  friendChoices,
  handle,
}: {
  blocks: SpotlightBlock[]
  onBlocksChange: (b: SpotlightBlock[]) => void
  background: SpotlightBackground
  onBackgroundChange: (bg: SpotlightBackground) => void
  /** The member's current ordered Top Friends (controlled, drives the live preview). */
  topFriends: TopFriend[]
  onTopFriendsChange: (next: TopFriend[]) => void
  /** Every accepted friend the member can pick from. */
  friendChoices: TopFriend[]
  handle: string
}) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const [bgSaved, setBgSaved] = useState(false)
  const [bgError, setBgError] = useState('')
  const [bgPending, startBg] = useTransition()

  function update(id: string, patch: Partial<SpotlightBlock>) {
    onBlocksChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as SpotlightBlock) : b)))
  }
  function remove(id: string) {
    onBlocksChange(blocks.filter((b) => b.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onBlocksChange(next)
  }
  function add(type: SpotlightBlock['type']) {
    if (blocks.length >= MAX_BLOCKS) return
    onBlocksChange([...blocks, blankBlock(type)])
  }
  function setBg(p: Partial<SpotlightBackground>) {
    onBackgroundChange({ ...background, ...p })
  }

  function save() {
    setError('')
    start(async () => {
      const res = await saveSpotlightLayout({ version: SPOTLIGHT_LAYOUT_VERSION, blocks })
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  function saveBackground(next: SpotlightBackground) {
    setBgError('')
    startBg(async () => {
      const res = await saveSpotlightBackground(next)
      if (res?.error) { setBgError(res.error); return }
      setBgSaved(true)
      setTimeout(() => setBgSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-6">
      {/* Background — page chrome, saved on its own */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Background</p>
        <SpotlightImageUploader
          value={background.assetPath}
          onChange={(p) => {
            const next = { ...background, assetPath: p }
            onBackgroundChange(next)
            // Clearing the image saves immediately; setting one waits for the framing + Save.
            if (p === null) saveBackground(next)
          }}
          label="Background image"
          height="h-32"
        />
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
            onClick={() => saveBackground(background)}
            disabled={bgPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
          >
            {bgPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : bgSaved ? <Check className="h-3.5 w-3.5" /> : null}
            {bgPending ? 'Saving…' : bgSaved ? 'Saved' : 'Save background'}
          </button>
          {bgError && <span className="text-xs text-danger">{bgError}</span>}
        </div>
      </section>

      {/* Blocks */}
      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-muted">
          Your page is empty. Add a block below to start building it.
        </p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-subtle">{block.type}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(block.id, -1)} disabled={i === 0} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(block.id, 1)} disabled={i === blocks.length - 1} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => remove(block.id)} className="rounded-md p-1 text-subtle hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <BlockFields
            block={block}
            onChange={(p) => update(block.id, p)}
            topFriends={topFriends}
            onTopFriendsChange={onTopFriendsChange}
            friendChoices={friendChoices}
          />
          {TINTABLE.has(block.type) && (
            <BlockTintRow
              tint={'tint' in block ? block.tint : undefined}
              onChange={(tint) => update(block.id, { tint } as Partial<SpotlightBlock>)}
            />
          )}
        </div>
      ))}

      {/* Palette — every block type, image included now */}
      <div className="flex flex-wrap gap-2">
        {BLOCK_PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => add(p.type)}
            disabled={blocks.length >= MAX_BLOCKS}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save layout'}
        </button>
        {handle && (
          <Link href={`/spotlight/${handle}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </Link>
        )}
      </div>
    </div>
  )
}

function BlockFields({
  block,
  onChange,
  topFriends,
  onTopFriendsChange,
  friendChoices,
}: {
  block: SpotlightBlock
  onChange: (p: Partial<SpotlightBlock>) => void
  topFriends: TopFriend[]
  onTopFriendsChange: (next: TopFriend[]) => void
  friendChoices: TopFriend[]
}) {
  if (block.type === 'heading') {
    return (
      <div className="space-y-2">
        <input value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Heading" className={inputCls} maxLength={80} />
        <select value={block.level} onChange={(e) => onChange({ level: Number(e.target.value) === 3 ? 3 : 2 })} className={`${inputCls} w-auto`}>
          <option value={2}>Large</option>
          <option value={3}>Small</option>
        </select>
      </div>
    )
  }
  if (block.type === 'text') {
    return <textarea value={block.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Write something…" rows={3} className={`${inputCls} resize-y`} maxLength={1000} />
  }
  if (block.type === 'links') {
    const items = block.items
    return (
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input value={it.label} onChange={(e) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, label: e.target.value } : x)) })} placeholder="Label" className={inputCls} maxLength={60} />
            <input value={it.url} onChange={(e) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, url: e.target.value } : x)) })} placeholder="https://…" className={inputCls} />
            {items.length > 1 && (
              <button type="button" onClick={() => onChange({ items: items.filter((_, k) => k !== idx) })} className="shrink-0 rounded-md p-1 text-subtle hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        ))}
        {items.length < 10 && (
          <button type="button" onClick={() => onChange({ items: [...items, { label: '', url: '' }] })} className="text-xs font-medium text-primary-strong hover:underline">+ Add link</button>
        )}
      </div>
    )
  }
  if (block.type === 'image') {
    return (
      <div className="space-y-2">
        <SpotlightImageUploader
          value={block.assetPath || null}
          onChange={(p) => onChange({ assetPath: p ?? '' })}
          label="Image"
        />
        {block.assetPath && (
          <CropControls
            focusX={block.focusX ?? 50}
            focusY={block.focusY ?? 50}
            zoom={block.zoom ?? 100}
            onChange={(p) => onChange(p as Partial<SpotlightBlock>)}
          />
        )}
        <input
          value={block.alt}
          onChange={(e) => onChange({ alt: e.target.value })}
          placeholder="Describe the image (for screen readers)"
          className={inputCls}
          maxLength={ALT_MAX}
        />
      </div>
    )
  }
  if (block.type === 'gallery') {
    const items = block.items
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it, idx) => (
            <div key={idx} className="space-y-1.5 rounded-xl border border-border p-1.5">
              <SpotlightImageUploader
                value={it.assetPath || null}
                onChange={(p) =>
                  onChange({
                    items: p
                      ? items.map((x, k) => (k === idx ? { ...x, assetPath: p } : x))
                      : items.filter((_, k) => k !== idx),
                  })
                }
                label={`Image ${idx + 1}`}
                square
              />
              <input
                value={it.alt}
                onChange={(e) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, alt: e.target.value } : x)) })}
                placeholder="Alt text"
                className={`${inputCls} px-2 py-1 text-xs`}
                maxLength={ALT_MAX}
              />
              {it.assetPath && (
                <CropControls
                  focusX={it.focusX ?? 50}
                  focusY={it.focusY ?? 50}
                  zoom={it.zoom ?? 100}
                  onChange={(p) => onChange({ items: items.map((x, k) => (k === idx ? { ...x, ...p } : x)) })}
                />
              )}
            </div>
          ))}
        </div>
        {items.length < MAX_GALLERY_IMAGES && (
          <GalleryMultiUpload
            remaining={MAX_GALLERY_IMAGES - items.length}
            onAdd={(paths) => onChange({ items: [...items, ...paths.map((assetPath) => ({ assetPath, alt: '' }))] })}
          />
        )}
      </div>
    )
  }
  if (block.type === 'quote') {
    return (
      <div className="space-y-2">
        <textarea
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="A quote or callout…"
          rows={2}
          className={`${inputCls} resize-y`}
          maxLength={QUOTE_MAX}
        />
        <input
          value={block.cite ?? ''}
          onChange={(e) => onChange({ cite: e.target.value })}
          placeholder="Attribution (optional)"
          className={inputCls}
          maxLength={CITE_MAX}
        />
      </div>
    )
  }
  if (block.type === 'stats') {
    const show = block.show
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-subtle">Pick which numbers to show. The values come from your account.</p>
        <div className="flex flex-wrap gap-2">
          {SPOTLIGHT_STAT_KEYS.map((key) => {
            const on = show.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({ show: on ? show.filter((k) => k !== key) : [...show, key] })
                }
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? 'border-primary-strong bg-primary-bg text-primary-strong'
                    : 'border-border text-text hover:bg-surface-elevated'
                }`}
              >
                {STAT_LABELS[key]}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (block.type === 'topfriends') {
    return (
      <div className="space-y-3">
        <input
          value={block.title ?? ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Grid heading (optional, e.g. Top 8)"
          className={inputCls}
          maxLength={LABEL_MAX}
        />
        <TopFriendsPicker
          selected={topFriends}
          onChange={onTopFriendsChange}
          choices={friendChoices}
        />
      </div>
    )
  }
  if (block.type === 'embed') {
    return <EmbedField block={block} onChange={onChange} />
  }
  if (block.type === 'divider') {
    return <p className="text-xs text-subtle">A horizontal line.</p>
  }
  return null
}

// Music / video embed: paste a Spotify / YouTube / SoundCloud / Vimeo link. The pasted URL
// is parsed against the host allowlist into a (provider, ref); the block stores only that,
// and both the preview and the public page rebuild the iframe src from it (never a raw src).
function EmbedField({ block, onChange }: { block: EmbedBlock; onChange: (p: Partial<SpotlightBlock>) => void }) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  function apply(raw: string) {
    setUrl(raw)
    if (!raw.trim()) { setErr(''); return }
    const parsed = parseEmbedUrl(raw)
    if (parsed) { setErr(''); onChange({ provider: parsed.provider, ref: parsed.ref } as Partial<SpotlightBlock>) }
    else setErr('That link is not from Spotify, YouTube, SoundCloud, or Vimeo.')
  }
  return (
    <div className="space-y-2">
      <input
        value={url}
        onChange={(e) => apply(e.target.value)}
        placeholder="Paste a Spotify, YouTube, SoundCloud, or Vimeo link"
        className={inputCls}
      />
      {err && <p className="text-2xs text-danger">{err}</p>}
      {block.ref && (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src={buildEmbedSrc(block.provider, block.ref)}
            title={`${block.provider} embed`}
            height={embedHeight(block.provider)}
            className="w-full"
            style={{ border: 0 }}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="encrypted-media; picture-in-picture"
          />
        </div>
      )}
      <p className="text-2xs text-muted">
        {block.ref ? `Embedded from ${block.provider}.` : 'Spotify song/album/playlist, YouTube or Vimeo video, or a SoundCloud track.'}
      </p>
    </div>
  )
}

// A labelled range slider with a live value readout.
function Slider({ label, suffix = '', min, max, step, value, onChange }: {
  label: string; suffix?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span><span className="tabular-nums">{value}{suffix}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  )
}

// Per-image crop framing: focal point (across / up-down) + zoom, mirroring the background's
// focus controls in the theme editor. Values clamp on read (lib/spotlight/blocks/validate.ts);
// the editor just drives them with the same sliders.
function CropControls({
  focusX, focusY, zoom, onChange,
}: {
  focusX: number
  focusY: number
  zoom: number
  onChange: (p: { focusX?: number; focusY?: number; zoom?: number }) => void
}) {
  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Crop</span>
      <Slider label="Position across" suffix="%" min={0} max={100} step={1} value={focusX} onChange={(v) => onChange({ focusX: v })} />
      <Slider label="Position up/down" suffix="%" min={0} max={100} step={1} value={focusY} onChange={(v) => onChange({ focusY: v })} />
      <Slider label="Zoom" suffix="%" min={100} max={200} step={5} value={zoom} onChange={(v) => onChange({ zoom: v })} />
    </div>
  )
}

// Pick several images at once for a gallery. Uploads each selected file through the
// session-derived action (sequentially, so each gets its own validated path) and appends
// the resulting paths, capped at `remaining`.
function GalleryMultiUpload({ remaining, onAdd }: { remaining: number; onAdd: (paths: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(files: FileList) {
    setError(null)
    setBusy(true)
    const chosen = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, remaining)
    const paths: string[] = []
    for (const file of chosen) {
      const fd = new FormData()
      fd.set('file', file)
      const res = await uploadSpotlightImage(fd)
      if (res.path) paths.push(res.path)
      else if (res.error) setError(res.error)
    }
    setBusy(false)
    if (paths.length) onAdd(paths)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {busy ? 'Uploading…' : `Add images (${remaining} left)`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) void pick(e.target.files); e.target.value = '' }}
      />
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  )
}

// Top Friends picker (the "Top 8"): choose an ordered set of accepted friends to feature.
// The selection lives in the spotlight_top_friends table (not the block JSON), so every
// change persists immediately through setTopFriends — which re-validates each pick against
// the friendships graph server-side. The parent owns `selected` so the live preview updates
// as the member edits. Capped at MAX_TOP_FRIENDS.
function TopFriendsPicker({
  selected,
  onChange,
  choices,
}: {
  selected: TopFriend[]
  onChange: (next: TopFriend[]) => void
  choices: TopFriend[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const selectedIds = new Set(selected.map((f) => f.profileId))
  const available = choices.filter((f) => !selectedIds.has(f.profileId))
  const full = selected.length >= MAX_TOP_FRIENDS

  // Persist the ordered selection; the server filters to real friends + caps the set, so
  // we optimistically reflect `next` and let any server drop reconcile on the next load.
  function persist(next: TopFriend[]) {
    onChange(next)
    setError('')
    start(async () => {
      const res = await setTopFriendsAction(next.map((f) => f.profileId))
      if (res?.error) setError(res.error)
    })
  }

  function addFriend(f: TopFriend) {
    if (full) return
    persist([...selected, f])
  }
  function removeFriend(id: string) {
    persist(selected.filter((f) => f.profileId !== id))
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
    <div className="space-y-3">
      <p className="text-xs text-subtle">
        Pick the friends to feature, in order. Up to {MAX_TOP_FRIENDS}.
      </p>

      {choices.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-surface/50 p-3 text-xs text-muted">
          Add some friends first, then come back to feature them here.
        </p>
      )}

      {/* The chosen Top Friends, ordered */}
      {selected.length > 0 && (
        <ul className="space-y-1.5">
          {selected.map((f, i) => (
            <li key={f.profileId} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5">
              <FriendAvatar friend={f} />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{f.displayName || `@${f.handle}`}</span>
              <button type="button" onClick={() => move(f.profileId, -1)} disabled={i === 0 || pending} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(f.profileId, 1)} disabled={i === selected.length - 1 || pending} className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => removeFriend(f.profileId)} disabled={pending} className="rounded-md p-1 text-subtle hover:text-danger disabled:opacity-30" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {/* Friends still available to add */}
      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
            {full ? `That's your Top ${MAX_TOP_FRIENDS}. Remove one to swap.` : 'Add a friend'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((f) => (
              <button
                key={f.profileId}
                type="button"
                onClick={() => addFriend(f)}
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

      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}

function FriendAvatar({ friend, small = false }: { friend: TopFriend; small?: boolean }) {
  const size = small ? 'h-5 w-5 text-2xs' : 'h-8 w-8 text-xs'
  const name = friend.displayName || `@${friend.handle}`
  if (friend.avatarUrl) {
    return (
      <Image
        src={friend.avatarUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary-bg font-bold text-primary-strong`}>
      {getInitials(name)}
    </span>
  )
}

// Per-block colour override: text + background swatches that win over the page theme for
// this block. Empty = inherit the theme. Validated to hex on save.
function BlockTintRow({ tint, onChange }: { tint?: BlockTint; onChange: (t: BlockTint | undefined) => void }) {
  function set(key: 'text' | 'bg', value: string | undefined) {
    const next: BlockTint = { ...tint, [key]: value }
    if (!next.text && !next.bg) { onChange(undefined); return }
    onChange(next)
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Colours</span>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Text
        <input type="color" value={tint?.text ?? '#000000'} onChange={(e) => set('text', e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-border-strong" aria-label="Block text colour" />
        {tint?.text && <button type="button" onClick={() => set('text', undefined)} className="text-subtle hover:text-text">×</button>}
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Background
        <input type="color" value={tint?.bg ?? '#ffffff'} onChange={(e) => set('bg', e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-border-strong" aria-label="Block background colour" />
        {tint?.bg && <button type="button" onClick={() => set('bg', undefined)} className="text-subtle hover:text-text">×</button>}
      </label>
    </div>
  )
}
