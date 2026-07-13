'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wand2, RotateCcw, Palette, Zap, Loader2 } from 'lucide-react'
import { sanitizeSvg } from '@/lib/library/svg-sanitize'
import { generateLoomCard, saveLoomCard, type LoomCardMode } from './vera-actions'
import { generateWithRecraft, listBrandStyles } from './recraft-actions'
import type { BrandStyle } from '@/lib/library/styles'

// One smart "Create" surface for the whole Loom. You pick WHAT you're making; the studio picks the
// engine: Vera draws quick house-style line marks (icons / spot art) as inline SVG, and the Image
// Studio (Recraft) generates richer vector + raster art (illustrations / trophies / cards / textures)
// and can condition a set on a trained brand style. Consolidates the old "Create with Vera" +
// "Generate with the Image Studio" panels into one compact wizard (ADR-490).

type CreateType = 'icon' | 'spot' | 'illustration' | 'trophy' | 'card' | 'texture'
type Engine = 'vera' | 'studio'

type TypeCfg = {
  label: string
  hint: string
  veraMode?: LoomCardMode // set when Vera can draw this type
  lane: 'vector' | 'raster' // the Studio lane for this type
  defaultEngine: Engine
  placeholder: string
  suggestions: string[]
}

// House-voice starters — warm, flat, amber-led (docs/LOOM-DESIGN-LANGUAGE.md).
const TYPES: Record<CreateType, TypeCfg> = {
  icon: {
    label: 'Icon',
    hint: 'A small, single mark (24×24).',
    veraMode: 'icon',
    lane: 'vector',
    defaultEngine: 'vera',
    placeholder: 'e.g. a compass, or a bell with a small notification dot',
    suggestions: ['a compass', 'a bell with a notification dot', 'a flame', 'an open book', 'a lightning bolt'],
  },
  spot: {
    label: 'Spot art',
    hint: 'A small scene or motif (240×150).',
    veraMode: 'graphic',
    lane: 'vector',
    defaultEngine: 'vera',
    placeholder: 'e.g. a calendar page with a checkmark, or a hand holding a heart',
    suggestions: ['a calendar page with a checkmark', 'a hand holding a heart', 'a trail winding to a flag', 'two hands connecting'],
  },
  illustration: {
    label: 'Illustration',
    hint: 'A richer vector illustration (SVG).',
    lane: 'vector',
    defaultEngine: 'studio',
    placeholder: 'e.g. a set of flat icons: compass, book, flame, warm amber, minimal',
    suggestions: ['a set of flat icons: compass, book, flame, warm amber, minimal', 'a cozy reading nook, flat vector, warm palette', 'a mountain trail scene, flat, amber and sage'],
  },
  trophy: {
    label: 'Trophy / reward',
    hint: 'A polished reward image (PNG).',
    lane: 'raster',
    defaultEngine: 'studio',
    placeholder: 'e.g. a warm flat gold trophy badge with a laurel, soft shadows',
    suggestions: ['a warm flat gold trophy badge with a laurel, soft shadows', 'a glowing streak-flame medal, amber, flat', 'a first-place ribbon badge, warm palette'],
  },
  card: {
    label: 'Card',
    hint: 'A shareable card image (PNG).',
    lane: 'raster',
    defaultEngine: 'studio',
    placeholder: 'e.g. a celebration card, confetti, warm amber, flat illustration',
    suggestions: ['a celebration card, confetti, warm amber, flat', 'a welcome card, sunrise over hills, flat vector feel', 'a thank-you card, warm hands motif'],
  },
  texture: {
    label: 'Texture',
    hint: 'A background texture (PNG).',
    lane: 'raster',
    defaultEngine: 'studio',
    placeholder: 'e.g. a soft warm paper grain, subtle, seamless',
    suggestions: ['a soft warm paper grain, subtle, seamless', 'a faint topographic line pattern, amber on cream', 'a gentle gradient mesh, warm sunset tones'],
  },
}

const ORDER: CreateType[] = ['icon', 'spot', 'illustration', 'trophy', 'card', 'texture']
const inputCls = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm'

export function CreateStudio({ recraftEnabled }: { recraftEnabled: boolean }) {
  const router = useRouter()
  const [type, setType] = useState<CreateType>('icon')
  const [engineOverride, setEngineOverride] = useState<Engine | null>(null)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(1)
  const [styleId, setStyleId] = useState('')
  const [styles, setStyles] = useState<BrandStyle[]>([])

  // Vera preview state (only the Vera engine previews before saving).
  const [svg, setSvg] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!recraftEnabled) return
    let live = true
    listBrandStyles().then((s) => live && setStyles(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [recraftEnabled])

  const cfg = TYPES[type]
  const supportsVera = !!cfg.veraMode
  const supportsStudio = recraftEnabled
  // Resolve the engine: the override if valid, else the type's default, clamped to what's available.
  let engine: Engine = engineOverride ?? cfg.defaultEngine
  if (engine === 'studio' && !supportsStudio) engine = supportsVera ? 'vera' : 'studio'
  if (engine === 'vera' && !supportsVera) engine = 'studio'
  const engineUnavailable = engine === 'studio' && !supportsStudio // studio-only type, no key

  const laneStyles = useMemo(() => styles.filter((s) => s.lane === cfg.lane), [styles, cfg.lane])
  const safeSvg = svg && sanitizeSvg(svg).ok ? svg : null

  function pickType(next: CreateType) {
    if (next === type) return
    setType(next)
    setEngineOverride(null)
    setSvg(null)
    setErr(null)
    setMsg(null)
  }

  function reset() {
    setSvg(null)
    setErr(null)
    setMsg(null)
  }

  function create() {
    if (!prompt.trim() || engineUnavailable) return
    setErr(null)
    setMsg(null)
    if (engine === 'vera') {
      start(async () => {
        const res = await generateLoomCard(prompt, cfg.veraMode!)
        if ('error' in res) {
          setErr(res.error)
          setSvg(null)
        } else {
          setSvg(res.svg)
          if (!title.trim()) setTitle(prompt.trim().slice(0, 80))
        }
      })
    } else {
      start(async () => {
        const res = await generateWithRecraft({ prompt, lane: cfg.lane, count, styleId: styleId || undefined })
        if ('error' in res) setErr(res.error)
        else {
          setMsg(`Added ${res.count} to the library.`)
          setPrompt('')
          router.refresh()
        }
      })
    }
  }

  function saveVera() {
    if (!safeSvg || !title.trim()) return
    setErr(null)
    start(async () => {
      const res = await saveLoomCard({ title, svg: safeSvg, prompt, mode: cfg.veraMode! })
      if ('error' in res) setErr(res.error)
      else {
        setSvg(null)
        setPrompt('')
        setTitle('')
        setMsg('Saved to the library.')
        router.refresh()
      }
    })
  }

  const createLabel = busy
    ? engine === 'vera'
      ? 'Drawing…'
      : 'Generating…'
    : engine === 'vera'
      ? svg
        ? 'Redraw'
        : 'Draw it'
      : 'Generate'

  return (
    <details className="mb-6 rounded-2xl border border-border bg-surface-elevated/50 p-4" open>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
        <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
        Create
        <span className="font-normal text-subtle">(describe it, and the studio makes it)</span>
      </summary>

      <div className="mt-4 space-y-3">
        {/* What are you making? — the type drives engine, lane + suggestions. */}
        <div className="flex flex-wrap gap-1.5">
          {ORDER.map((t) => {
            const disabled = !TYPES[t].veraMode && !recraftEnabled // studio-only + no key
            const active = t === type
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => pickType(t)}
                aria-pressed={active}
                title={disabled ? 'Needs the Image Studio (set RECRAFT_API_KEY)' : TYPES[t].hint}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                {TYPES[t].label}
              </button>
            )
          })}
        </div>

        <textarea
          className={inputCls}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={cfg.placeholder}
        />

        {/* Smart prompts — one tap to fill an on-brand starter. */}
        <div className="flex flex-wrap gap-1.5">
          {cfg.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="max-w-full truncate rounded-lg border border-dashed border-border px-2 py-1 text-xs text-subtle hover:bg-surface-elevated hover:text-text"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Engine toggle — only when the type can be either Vera or the Studio. */}
          {supportsVera && supportsStudio && (
            <div className="inline-flex rounded-2xl border border-border p-0.5">
              <button
                type="button"
                onClick={() => {
                  setEngineOverride('vera')
                  reset()
                }}
                aria-pressed={engine === 'vera'}
                title="Vera draws a clean house-style line mark, instant, no cost"
                className={`inline-flex items-center gap-1 rounded-[14px] px-3 py-1.5 text-sm font-semibold ${
                  engine === 'vera' ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'
                }`}
              >
                <Zap className="h-3.5 w-3.5" /> Quick
              </button>
              <button
                type="button"
                onClick={() => {
                  setEngineOverride('studio')
                  reset()
                }}
                aria-pressed={engine === 'studio'}
                title="The Image Studio generates a richer result (uses the paid engine)"
                className={`inline-flex items-center gap-1 rounded-[14px] px-3 py-1.5 text-sm font-semibold ${
                  engine === 'studio' ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> Rich
              </button>
            </div>
          )}

          {/* Studio-only controls: count + trained brand style. */}
          {engine === 'studio' && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                Count
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="rounded-xl border border-border bg-surface px-2 py-1 text-sm"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {laneStyles.length > 0 && (
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  <Palette className="h-4 w-4" aria-hidden /> Style
                  <select
                    value={styleId}
                    onChange={(e) => setStyleId(e.target.value)}
                    className="rounded-xl border border-border bg-surface px-2 py-1 text-sm"
                  >
                    <option value="">Base</option>
                    {laneStyles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <button
            type="button"
            onClick={create}
            disabled={busy || !prompt.trim() || engineUnavailable}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {createLabel}
          </button>

          {svg && engine === 'vera' && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated"
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </button>
          )}
          {msg && <span className="text-sm text-signal-strong">{msg}</span>}
        </div>

        {/* Vera preview + save (the Studio auto-saves, so it has no preview step). */}
        {engine === 'vera' && safeSvg && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-end">
            <div
              className={
                cfg.veraMode === 'icon'
                  ? 'flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-elevated text-text [&>svg]:h-16 [&>svg]:w-16 sm:w-40'
                  : 'flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-elevated text-text [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full sm:w-56'
              }
              // Sanitized server-side and re-validated above before this render.
              dangerouslySetInnerHTML={{ __html: safeSvg }}
            />
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Title</span>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button
              type="button"
              onClick={saveVera}
              disabled={busy || !title.trim()}
              className="rounded-2xl bg-signal px-4 py-2 text-sm font-bold text-on-signal hover:bg-signal-strong disabled:opacity-70"
            >
              {busy ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        )}

        <p className="text-xs text-subtle">
          {engine === 'vera'
            ? 'Vera draws a clean, on-brand line mark you review before saving. Instant, no cost.'
            : `The Image Studio generates ${cfg.lane === 'vector' ? 'vector' : 'raster'} art and adds it straight to the library.`}
        </p>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </details>
  )
}
