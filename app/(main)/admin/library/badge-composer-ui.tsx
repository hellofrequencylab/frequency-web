'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Loader2 } from 'lucide-react'
import {
  composeBadge,
  glyphSvg,
  BADGE_TEMPLATES,
  BADGE_GLYPHS,
  BADGE_PALETTES,
  DEFAULT_BADGE_SPEC,
  type BadgeSpec,
} from '@/lib/loom/badge-composer'
import { rasterizeSvgString } from '@/lib/library/export-svg'
import { saveComposedBadge } from './composer-actions'

// The deterministic house-style badge/trophy composer (ADR-492). Pick a shape + house glyph + palette
// + labels; the preview is composed the same way every time — no AI. Save renders it to a PNG.
const inputCls = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm'

export function BadgeComposer() {
  const router = useRouter()
  const [spec, setSpec] = useState<BadgeSpec>(DEFAULT_BADGE_SPEC)
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const svg = useMemo(() => composeBadge(spec), [spec])
  const set = (patch: Partial<BadgeSpec>) => {
    setSpec((s) => ({ ...s, ...patch }))
    setMsg(null)
  }

  function save(publish: boolean) {
    setErr(null)
    setMsg(null)
    start(async () => {
      let pngBase64 = ''
      try {
        pngBase64 = await rasterizeSvgString(svg, 512)
      } catch {
        setErr('Could not render the badge image.')
        return
      }
      const title = [spec.title, spec.subtitle].map((s) => s.trim()).filter(Boolean).join(' ') || 'Badge'
      const res = await saveComposedBadge({ title, pngBase64, spec, publish })
      if ('error' in res) setErr(res.error)
      else {
        setMsg(publish ? 'Published to the library.' : 'Saved to Drafts.')
        router.refresh()
      }
    })
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'border-primary bg-primary text-on-primary' : 'border-border text-muted hover:bg-surface-elevated'
    }`

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
      <div className="space-y-3">
        {/* Shape */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Shape</p>
          <div className="flex flex-wrap gap-1.5">
            {BADGE_TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => set({ template: t.id })} className={chip(spec.template === t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Glyph */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {BADGE_GLYPHS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => set({ glyph: g.id })}
                aria-pressed={spec.glyph === g.id}
                title={g.label}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border p-1.5 transition-colors ${
                  spec.glyph === g.id ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                <span className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: glyphSvg(g.id, 'currentColor') }} />
              </button>
            ))}
          </div>
        </div>

        {/* Palette */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Color</p>
          <div className="flex flex-wrap gap-2">
            {BADGE_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ palette: p.id })}
                aria-pressed={spec.palette === p.id}
                title={p.label}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 ${
                  spec.palette === p.id ? 'border-primary' : 'border-border hover:bg-surface-elevated'
                }`}
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: p.ring }} />
                <span className="text-xs text-muted">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Labels */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Big label</span>
            <input className={inputCls} value={spec.title} maxLength={22} onChange={(e) => set({ title: e.target.value })} placeholder="100 DAYS" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Small label</span>
            <input className={inputCls} value={spec.subtitle} maxLength={26} onChange={(e) => set({ subtitle: e.target.value })} placeholder="MEDITATION" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-signal px-4 py-2 text-sm font-bold text-on-signal hover:bg-signal-strong disabled:opacity-70"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Publish
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={busy}
            className="rounded-2xl border border-border-strong px-3 py-2 text-sm font-semibold text-text hover:bg-surface-elevated disabled:opacity-70"
          >
            Save draft
          </button>
          {msg && <span className="text-sm text-signal-strong">{msg}</span>}
          {err && <span className="text-sm text-danger">{err}</span>}
        </div>
        <p className="text-xs text-subtle">Composed in the house style from brand tokens — the same every time. No AI.</p>
      </div>

      {/* Live preview (trusted, composed by our own code — rendered directly). */}
      <div className="flex items-start justify-center">
        <div
          className="w-full max-w-[240px] [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
