'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanText, Pencil, Camera, Upload, Sparkles, Loader2, Check, X, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { squareCropRect, dedupeTags, normalizeTag } from '@/lib/connections/normalize'
import type { ExtractedContact, ContactSource, Visibility } from '@/lib/connections/types'
import { scanCard, veraAssist, createProfile } from '../actions'

const BUCKET = 'network-contacts'
const input = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'
const lbl = 'block text-xs font-medium text-muted mb-1'

type FormState = {
  displayName: string
  title: string
  company: string
  email: string
  phone: string
  city: string
  website: string
  instagram: string
  linkedin: string
  x: string
  connectionNote: string
  tags: string[]
  visibility: Visibility
}

const EMPTY: FormState = {
  displayName: '', title: '', company: '', email: '', phone: '', city: '', website: '',
  instagram: '', linkedin: '', x: '', connectionNote: '', tags: [], visibility: 'private',
}

// ── canvas helpers ───────────────────────────────────────────────────────────
function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')) }
    img.src = url
  })
}
function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality),
  )
}
async function resizeForOcr(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const img = await fileToImage(file)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvasToJpeg(canvas, quality)
}
async function cropFromBox(file: File, box: ExtractedContact['photo']['box'], size = 512): Promise<Blob> {
  const img = await fileToImage(file)
  const rect = box
    ? squareCropRect(box, img.naturalWidth, img.naturalHeight)
    : centerRect(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.drawImage(img, rect.sx, rect.sy, rect.size, rect.size, 0, 0, size, size)
  return canvasToJpeg(canvas, 0.9)
}
function centerRect(w: number, h: number) {
  const size = Math.min(w, h)
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size }
}

function mergeExtraction(prev: FormState, e: ExtractedContact): FormState {
  const fill = (cur: string, val: string) => (cur.trim() ? cur : val)
  return {
    ...prev,
    displayName: fill(prev.displayName, e.displayName),
    title: fill(prev.title, e.title),
    company: fill(prev.company, e.company),
    email: fill(prev.email, e.email),
    phone: fill(prev.phone, e.phone),
    city: fill(prev.city, e.city),
    website: fill(prev.website, e.website),
    instagram: fill(prev.instagram, e.socials.instagram ?? ''),
    linkedin: fill(prev.linkedin, e.socials.linkedin ?? ''),
    x: fill(prev.x, e.socials.x ?? ''),
    connectionNote: fill(prev.connectionNote, e.connectionNote),
    tags: dedupeTags([...prev.tags, ...e.tags]),
  }
}

export function Creator({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<'scan' | 'manual'>('scan')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [source, setSource] = useState<ContactSource>('manual')
  const [extraction, setExtraction] = useState<unknown>(undefined)

  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [assistText, setAssistText] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  const [scanning, setScanning] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))

  async function uploadBlob(blob: Blob): Promise<string> {
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    return path
  }

  async function handleScan(file: File) {
    setScanning(true)
    setMsg(null)
    try {
      const ocr = await resizeForOcr(file)
      const path = await uploadBlob(ocr)
      const res = await scanCard(path)
      if (!res.ok) {
        setSource('card_scan')
        setTab('manual')
        setMsg({
          kind: 'warn',
          text:
            res.reason === 'ai_unavailable'
              ? 'Vera’s scanner is off right now — fill in the details by hand below.'
              : 'Couldn’t read that image. Try a sharper photo, or fill it in below.',
        })
        return
      }
      setForm((p) => mergeExtraction(p, res.extraction))
      setExtraction(res.extraction)
      setSource('card_scan')
      // Cut a profile photo out using the detected face box (or a center crop).
      try {
        const cropped = await cropFromBox(file, res.extraction.photo.found ? res.extraction.photo.box : null)
        const ap = await uploadBlob(cropped)
        setAvatarPath(ap)
        setAvatarPreview(URL.createObjectURL(cropped))
      } catch {
        /* photo is optional — proceed without it */
      }
      setTab('manual')
      setMsg({ kind: 'ok', text: 'Scanned — review the details and save.' })
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setScanning(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  async function handlePhoto(file: File) {
    try {
      const cropped = await cropFromBox(file, null) // center-crop a manually chosen photo
      const ap = await uploadBlob(cropped)
      setAvatarPath(ap)
      setAvatarPreview(URL.createObjectURL(cropped))
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not process that image.' })
    } finally {
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function handleAssist() {
    const text = assistText.trim()
    if (!text || assisting) return
    setAssisting(true)
    setMsg(null)
    const res = await veraAssist(text)
    setAssisting(false)
    if (!res.ok) {
      setMsg({
        kind: 'warn',
        text: res.reason === 'ai_unavailable' ? 'Vera assist is off right now.' : 'Vera couldn’t parse that — add details by hand.',
      })
      return
    }
    setForm((p) => mergeExtraction(p, res.extraction))
    setExtraction(res.extraction)
    setMsg({ kind: 'ok', text: 'Vera filled in what she could — review and save.' })
  }

  function addTag(raw: string) {
    const t = normalizeTag(raw)
    if (!t) return
    setForm((p) => ({ ...p, tags: dedupeTags([...p.tags, t]) }))
    setTagDraft('')
  }

  async function handleSave() {
    if (!form.displayName.trim()) {
      setMsg({ kind: 'warn', text: 'Add a name before saving.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const res = await createProfile({
      source,
      displayName: form.displayName,
      title: form.title,
      company: form.company,
      email: form.email,
      phone: form.phone,
      city: form.city,
      website: form.website,
      socials: {
        ...(form.instagram.trim() ? { instagram: form.instagram.trim() } : {}),
        ...(form.linkedin.trim() ? { linkedin: form.linkedin.trim() } : {}),
        ...(form.x.trim() ? { x: form.x.trim() } : {}),
      },
      tags: form.tags,
      connectionNote: form.connectionNote,
      avatarPath,
      visibility: form.visibility,
      extraction,
    })
    setSaving(false)
    if ('error' in res) {
      setMsg({ kind: 'err', text: res.error })
      return
    }
    router.push(`/connections/${res.id}`)
  }

  const banner =
    msg &&
    (msg.kind === 'ok'
      ? 'border-success/40 bg-success-bg text-success'
      : msg.kind === 'warn'
        ? 'border-primary/40 bg-primary-bg text-primary-strong'
        : 'border-danger/40 bg-danger-bg text-danger')

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        <TabBtn active={tab === 'scan'} onClick={() => setTab('scan')} icon={ScanText} label="Scan a card" />
        <TabBtn active={tab === 'manual'} onClick={() => setTab('manual')} icon={Pencil} label="Manual entry" />
      </div>

      {msg && <p className={`rounded-lg border px-3 py-2 text-sm ${banner}`}>{msg.text}</p>}

      {tab === 'scan' ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
          {scanning ? (
            <div className="flex flex-col items-center gap-2 py-4 text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-primary-strong" />
              <p className="text-sm">Reading the card…</p>
            </div>
          ) : (
            <>
              <ScanText className="mx-auto h-8 w-8 text-primary-strong" />
              <p className="mt-3 text-sm font-medium text-text">Snap a business card or poster</p>
              <p className="mt-1 text-xs text-subtle">
                Vera reads the details, drafts a connection note and tags, and cuts out a profile photo.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <Camera className="h-4 w-4" /> Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <Upload className="h-4 w-4" /> Upload an image
                </button>
              </div>
              <p className="mt-4 text-xs text-subtle">Prefer to type it?{' '}
                <button type="button" className="font-medium text-primary-strong hover:underline" onClick={() => setTab('manual')}>
                  Enter manually
                </button>
              </p>
            </>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleScan(f) }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleScan(f) }}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Vera assist */}
          <div className="rounded-2xl border border-border bg-surface-elevated/40 p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary-strong" />
              <p className="text-sm font-semibold text-text">Vera assist</p>
            </div>
            <textarea
              value={assistText}
              onChange={(e) => setAssistText(e.target.value)}
              rows={2}
              placeholder="e.g. Met Sarah Kim at the Encinitas market — runs a sound-bath studio, wants to co-host a session. sarah@studio.com"
              className={`${input} resize-none`}
            />
            <button
              type="button"
              onClick={handleAssist}
              disabled={assisting || !assistText.trim()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {assisting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {assisting ? 'Thinking…' : 'Fill it in with Vera'}
            </button>
          </div>

          {/* Photo */}
          <div className="flex items-center gap-4">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-surface" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted">
                <User className="h-6 w-6" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => photoRef.current?.click()} className="text-sm font-medium text-primary-strong hover:underline">
                {avatarPreview ? 'Change photo' : 'Add a photo'}
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={() => { setAvatarPath(null); setAvatarPreview(null) }}
                  className="text-left text-xs text-subtle hover:text-muted"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-subtle">Private — stored just for you.</p>
            </div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhoto(f) }}
            />
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input className={input} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Sarah Kim" />
            </Field>
            <Field label="Title"><input className={input} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Sound facilitator" /></Field>
            <Field label="Company"><input className={input} value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Resonance Studio" /></Field>
            <Field label="Email"><input className={input} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="sarah@studio.com" /></Field>
            <Field label="Phone"><input className={input} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 123-4567" /></Field>
            <Field label="City"><input className={input} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Encinitas, CA" /></Field>
            <Field label="Website"><input className={input} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="studio.com" /></Field>
            <Field label="Instagram"><input className={input} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@handle" /></Field>
            <Field label="LinkedIn"><input className={input} value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="linkedin.com/in/…" /></Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-1.5">
              {form.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
                  {t}
                  <button type="button" onClick={() => set('tags', form.tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft) }
                }}
                placeholder={form.tags.length ? 'Add tag…' : 'yoga, investor, met at SXSW…'}
                className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-text placeholder-subtle focus:outline-none"
              />
            </div>
          </Field>

          {/* Connection note */}
          <Field label="Connection note">
            <textarea
              className={`${input} resize-none`}
              rows={3}
              value={form.connectionNote}
              onChange={(e) => set('connectionNote', e.target.value)}
              placeholder="Where you met, what you talked about, any follow-up…"
            />
          </Field>

          {/* Visibility */}
          <Field label="Visibility">
            <select className={input} value={form.visibility} onChange={(e) => set('visibility', e.target.value as Visibility)}>
              <option value="private">Private — only you</option>
              <option value="network">Network — visible to stewards</option>
            </select>
          </Field>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.displayName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  )
}
