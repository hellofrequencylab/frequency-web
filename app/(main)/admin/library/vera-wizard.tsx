'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Wand2, RotateCcw } from 'lucide-react'
import { sanitizeSvg } from '@/lib/library/svg-sanitize'
import { generateLoomCard, saveLoomCard } from './vera-actions'

// "Create with Vera": describe a card, Vera draws it as inline SVG in the house style,
// preview it, then save it to the library. The generated SVG is validated server-side and
// again here before it renders (allowlist sanitizer, defense in depth).
export function VeraWizard() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [svg, setSvg] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [generating, startGen] = useTransition()
  const [saving, startSave] = useTransition()

  const safeSvg = svg && sanitizeSvg(svg).ok ? svg : null

  function generate() {
    if (!prompt.trim()) return
    setErr(null)
    startGen(async () => {
      const res = await generateLoomCard(prompt)
      if ('error' in res) {
        setErr(res.error)
        setSvg(null)
      } else {
        setSvg(res.svg)
        if (!title.trim()) setTitle(prompt.trim().slice(0, 80))
      }
    })
  }

  function save() {
    if (!safeSvg || !title.trim()) return
    setErr(null)
    startSave(async () => {
      const res = await saveLoomCard({ title, svg: safeSvg, prompt })
      if ('error' in res) setErr(res.error)
      else {
        setSvg(null)
        setPrompt('')
        setTitle('')
        router.refresh()
      }
    })
  }

  const inputCls = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm'

  return (
    <details className="mb-6 rounded-2xl border border-border bg-surface-elevated/50 p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
        <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
        Create a card with Vera
      </summary>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">
              Describe the card
            </span>
            <textarea
              className={inputCls}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a calendar page with a checkmark, or a hand holding a heart"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-70"
            >
              <Wand2 className="h-4 w-4" />
              {generating ? 'Drawing…' : svg ? 'Redraw' : 'Draw it'}
            </button>
            {svg && (
              <button
                type="button"
                onClick={() => {
                  setSvg(null)
                  setErr(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated"
              >
                <RotateCcw className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
          <p className="text-xs text-subtle">
            Vera draws flat, on-brand line-art (the same style as the kit). Review before saving.
          </p>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>

        <div className="space-y-3">
          <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface [&>svg]:max-h-full [&>svg]:w-auto">
            {safeSvg ? (
              <div
                className="flex h-full w-full items-center justify-center p-3 [&>svg]:max-h-full [&>svg]:w-auto"
                // Sanitized server-side and re-validated above before this render.
                dangerouslySetInnerHTML={{ __html: safeSvg }}
              />
            ) : (
              <span className="text-sm text-subtle">Preview appears here</span>
            )}
          </div>
          {safeSvg && (
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Title</span>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={save}
                disabled={saving || !title.trim()}
                className="rounded-2xl bg-signal px-4 py-2 text-sm font-bold text-on-signal hover:bg-signal-strong disabled:opacity-70"
              >
                {saving ? 'Saving…' : 'Save to library'}
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
