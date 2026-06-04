'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, Sparkles, Trash2, MapPin } from 'lucide-react'
import { previewArea, seedArea, purgeArea } from './actions'

type Channel = { slug: string; name: string }
type Preview = Awaited<ReturnType<typeof previewArea>>

const ALIVE = [
  { v: 'sprouting', label: 'Just sprouting', hint: '2–3 circles, small' },
  { v: 'growing', label: 'Growing', hint: '4–6 circles' },
  { v: 'thriving', label: 'Thriving year-old', hint: '8–12 circles, full' },
] as const

export function StudioWizard({ channels }: { channels: Channel[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Record<string, number> | null>(null)

  // spec
  const [areaName, setAreaName] = useState('')
  const [lat, setLat] = useState('33.0369')
  const [lng, setLng] = useState('-117.2920')
  const [radius, setRadius] = useState(10)
  const [aliveness, setAliveness] = useState<(typeof ALIVE)[number]['v']>('growing')
  const [sel, setSel] = useState<Set<string>>(new Set(['movement', 'holistic-health', 'creative']))
  const [flavor, setFlavor] = useState('')

  const spec = () => ({
    areaName: areaName.trim() || 'New Area',
    centerLat: Number(lat), centerLng: Number(lng), radiusMi: radius,
    aliveness, channels: [...sel],
    flavorWords: flavor.split(',').map((s) => s.trim()).filter(Boolean),
    aiPolish: false,
  })

  const toggleCh = (slug: string) =>
    setSel((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n })

  const run = (fn: () => Promise<void>) => {
    setError(null)
    start(async () => {
      try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
    })
  }

  const field = 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none'

  return (
    <div className="max-w-2xl space-y-6">
      {error && <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* 1. Where */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-text">1 · Where</h3></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Area name
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Austin" className={`${field} min-w-44`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Center lat
            <input value={lat} onChange={(e) => setLat(e.target.value)} className={`${field} w-28`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Center lng
            <input value={lng} onChange={(e) => setLng(e.target.value)} className={`${field} w-28`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Radius (mi)
            <input type="number" min={1} max={50} value={radius} onChange={(e) => setRadius(Math.max(1, Math.min(50, Number(e.target.value) || 10)))} className={`${field} w-20`} /></label>
        </div>
      </section>

      {/* 2. How alive */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="mb-2 text-sm font-bold text-text">2 · How alive</h3>
        <div className="flex flex-wrap gap-2">
          {ALIVE.map((a) => (
            <button key={a.v} type="button" onClick={() => setAliveness(a.v)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${aliveness === a.v ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-primary-bg'}`}>
              <div className="font-semibold">{a.label}</div>
              <div className="text-xs text-subtle">{a.hint}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. What */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="mb-2 text-sm font-bold text-text">3 · What it covers</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {channels.map((c) => (
            <button key={c.slug} type="button" onClick={() => toggleCh(c.slug)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${sel.has(c.slug) ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-primary-bg'}`}>
              {c.name}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">Local flavor words (comma-separated — used as place/vibe variables)
          <input value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder="e.g. Barton Springs, tacos, greenbelt, East Side" className={field} /></label>
      </section>

      {/* 4. Voice */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="mb-1 text-sm font-bold text-text">4 · Voice</h3>
        <p className="text-sm text-muted">Content is generated from curated templates + your flavor words.
          <span className="ml-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">AI polish — coming soon</span></p>
      </section>

      {/* 5. Preview */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">5 · Preview</h3>
          <button type="button" disabled={pending || sel.size === 0} onClick={() => run(async () => setPreview(await previewArea(spec())))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text hover:border-primary disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview
          </button>
        </div>
        {preview && (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted">Would create <b className="text-text">{preview.totals.people}</b> people across <b className="text-text">{preview.totals.circles}</b> circles, <b className="text-text">{preview.totals.posts}</b> posts + <b className="text-text">{preview.totals.replies}</b> replies, <b className="text-text">{preview.totals.events}</b> events.</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.circles.map((c, i) => <span key={i} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">{c.name} · {c.members}</span>)}
            </div>
            <div className="rounded-xl border border-border bg-canvas p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Sample people</p>
              {preview.samplePeople.map((p, i) => <p key={i} className="text-text">{p.name} <span className="text-subtle">@{p.handle} · {p.rank}</span> — <span className="text-muted">{p.bio}</span></p>)}
            </div>
            {preview.sampleThread && (
              <div className="rounded-xl border border-border bg-canvas p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Sample thread</p>
                <p className="text-text"><b>{preview.sampleThread.author}</b>: {preview.sampleThread.body}</p>
                {preview.sampleThread.replies.map((r, i) => <p key={i} className="ml-3 text-muted">↳ <b className="text-text">{r.author}</b>: {r.body}</p>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 6. Seed */}
      <section className="rounded-2xl border border-primary-bg bg-primary-bg/20 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">6 · Seed it</h3>
            <p className="text-sm text-muted">Writes the area as demo content (⚡), reversible below.</p>
          </div>
          <button type="button" disabled={pending || sel.size === 0} onClick={() => run(async () => { setResult(await seedArea(spec())); router.refresh() })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Seed this area
          </button>
        </div>
        {result && <p className="mt-3 rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">Seeded {result.circles} circles · {result.members} members · {result.posts} posts · {result.events} events. The ⚡ demo notice now reflects the new totals.</p>}
      </section>

      {/* Reverse */}
      <section className="rounded-2xl border border-danger-bg bg-danger-bg/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">Purge this area</h3>
            <p className="text-sm text-muted">Deletes demo content within the radius around the center above.</p>
          </div>
          <button type="button" disabled={pending} onClick={() => run(async () => { await purgeArea(Number(lat), Number(lng), radius); setResult(null); setPreview(null); router.refresh() })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger-bg/30 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Purge area
          </button>
        </div>
      </section>
    </div>
  )
}
