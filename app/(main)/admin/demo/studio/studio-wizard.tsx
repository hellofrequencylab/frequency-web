'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye, Sparkles, MapPin } from 'lucide-react'
import { previewArea, seedArea } from './actions'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'

type Channel = { slug: string; name: string }
type Preview = Awaited<ReturnType<typeof previewArea>>

// Quick presets just nudge the size sliders; everything is fine-tunable below.
const PRESETS = [
  { label: 'Just sprouting', circles: 2, members: 8, conn: 15 },
  { label: 'Growing', circles: 5, members: 14, conn: 30 },
  { label: 'Thriving year-old', circles: 10, members: 20, conn: 45 },
] as const

export function StudioWizard({ channels }: { channels: Channel[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Record<string, number> | null>(null)

  // location
  const [areaName, setAreaName] = useState('Encinitas')
  const [lat, setLat] = useState(33.0369)
  const [lng, setLng] = useState(-117.292)
  const [radius, setRadius] = useState(10)
  // size + connections
  const [circles, setCircles] = useState(5)
  const [membersPerCircle, setMembersPerCircle] = useState(14)
  const [connectednessPct, setConnectednessPct] = useState(30)
  // content
  const [sel, setSel] = useState<Set<string>>(new Set(['movement', 'holistic-health', 'creative']))
  const [flavor, setFlavor] = useState('')
  const [aiPolish, setAiPolish] = useState(true)

  const estPeople = circles * membersPerCircle
  const estConnections = Math.round((estPeople * connectednessPct) / 100)

  const spec = () => ({
    areaName: areaName.trim() || 'New Area',
    centerLat: lat,
    centerLng: lng,
    radiusMi: radius,
    circles,
    membersPerCircle,
    connectednessPct,
    channels: [...sel],
    flavorWords: flavor.split(',').map((s) => s.trim()).filter(Boolean),
    aiPolish,
  })

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setCircles(p.circles)
    setMembersPerCircle(p.members)
    setConnectednessPct(p.conn)
  }
  const toggleCh = (slug: string) =>
    setSel((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n })

  const run = (fn: () => Promise<void>) => {
    setError(null)
    start(async () => {
      try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
    })
  }

  const field = 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none'
  const activePreset = PRESETS.find((p) => p.circles === circles && p.members === membersPerCircle && p.conn === connectednessPct)

  return (
    <div className="max-w-2xl space-y-6">
      {error && <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* 1. Where */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-text">1 · Where</h3></div>
        <LocationAutocomplete value={areaName} placeholder="Search a city or town…"
          onPick={(p) => { setAreaName(p.label.split(',')[0]); setLat(+p.lat.toFixed(5)); setLng(+p.lng.toFixed(5)) }} />
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <p className="text-xs text-subtle">
            Centered on <b className="text-text">{areaName}</b> ({lat.toFixed(4)}, {lng.toFixed(4)})
          </p>
          <label className="flex flex-col gap-1 text-xs text-muted">Radius: <b className="text-text">{radius} mi</b>
            <input type="range" min={1} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-40 accent-primary" /></label>
        </div>
      </section>

      {/* 2. How big */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">2 · How big</h3>
          <span className="text-xs text-subtle">≈ <b className="text-text">{estPeople}</b> people · <b className="text-text">{circles}</b> circles · <b className="text-text">{estConnections}</b> connections</span>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => applyPreset(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${activePreset === p ? 'border-primary bg-primary-bg text-text' : 'border-border bg-surface text-muted hover:border-primary-bg'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            <span className="mb-1 flex justify-between"><span>Circles</span><b className="text-text">{circles}</b></span>
            <input type="range" min={1} max={20} value={circles} onChange={(e) => setCircles(Number(e.target.value))} className="w-full accent-primary" />
          </label>
          <label className="block text-xs text-muted">
            <span className="mb-1 flex justify-between"><span>People per circle</span><b className="text-text">{membersPerCircle}</b></span>
            <input type="range" min={6} max={40} value={membersPerCircle} onChange={(e) => setMembersPerCircle(Number(e.target.value))} className="w-full accent-primary" />
          </label>
          <label className="block text-xs text-muted">
            <span className="mb-1 flex justify-between"><span>Connections (cross-circle ties)</span><b className="text-text">{connectednessPct}%</b></span>
            <input type="range" min={0} max={70} value={connectednessPct} onChange={(e) => setConnectednessPct(Number(e.target.value))} className="w-full accent-primary" />
          </label>
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
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={aiPolish} onChange={(e) => setAiPolish(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
          <span className="text-sm text-muted">
            <span className="font-semibold text-text">Demographic-aware (AI)</span> — one quick model call reads the
            place and channels to draw names, local activities, and journey titles that fit the area; templates expand
            it into every row. Off uses the built-in pools. Falls back automatically if AI is unavailable.
          </span>
        </label>
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
            <p className="text-muted">Would create <b className="text-text">{preview.totals.people}</b> people across <b className="text-text">{preview.totals.circles}</b> circles, <b className="text-text">{preview.totals.posts}</b> posts + <b className="text-text">{preview.totals.replies}</b> replies, <b className="text-text">{preview.totals.events}</b> events, <b className="text-text">{preview.totals.journeys}</b> journeys, <b className="text-text">{preview.totals.connections}</b> cross-circle connections — plus RSVPs, reactions, practice logs &amp; achievements.</p>
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
        {result && <p className="mt-3 rounded-lg border border-success-bg bg-success-bg/40 px-3 py-2 text-sm text-success">Seeded {result.circles} circles · {result.members} members · {result.posts} posts · {result.events} events · {result.rsvps} RSVPs · {result.reactions} reactions · {result.practiceLogs} practice logs · {result.journeys} journeys · {result.connections} connections. The ⚡ demo notice now reflects the new totals.</p>}
      </section>
    </div>
  )
}
