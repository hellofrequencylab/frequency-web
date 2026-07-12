'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { applyMergeTags } from '@/lib/email-studio/render'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// LIVE EMAIL PREVIEW. Compiles the working email doc (block layout + subject + preheader) to send-ready HTML
// IN THE BROWSER (lib/email-studio compile is pure + framework-free, so it is client-safe) and renders it in
// a sandboxed <iframe srcDoc>. An email is a FIXED-WIDTH table (600px desktop / 360px mobile), so to show
// the WHOLE email with no horizontal scroll inside a narrow editor column, the frame is SCALED DOWN with a
// CSS transform to fit the available column width, measured live with a ResizeObserver (scale capped at 1,
// so it never zooms past natural size and never overflows). The frame height tracks the email's real content
// height so the full email is visible with no vertical scroll either.
//
// sandbox='allow-same-origin' (NOT allow-scripts) only lets the parent read the content height to size the
// frame; no script ever runs in the frame, and the renderer already escapes all authored text. A width
// toggle switches the target between the desktop (600px) and mobile (360px) inbox shapes. Merge tags are
// filled with EXAMPLE values. Read-only surface: repaints instantly from the shared store as the operator edits.

const EXAMPLE_VARS: Record<string, string> = Object.fromEntries(
  MERGE_TAG_VARIABLES.map((v) => [v.token, v.example]),
)

type PreviewWidth = 'desktop' | 'mobile'
const WIDTH_PX: Record<PreviewWidth, number> = { desktop: 600, mobile: 360 }
/** Fallback frame height until the real content height is measured on load. */
const DEFAULT_FRAME_H = 700

export function EmailPreview({
  layout,
  subject,
  preheader,
}: {
  layout: EntityLayout
  subject: string
  preheader: string
}) {
  const [width, setWidth] = useState<PreviewWidth>('desktop')

  const html = useMemo(() => {
    const { html: compiled } = compileEmailDoc({ layout, subject, preheader })
    return applyMergeTags(compiled, EXAMPLE_VARS, { fallbacks: MERGE_TAG_DEFAULT_FALLBACKS })
  }, [layout, subject, preheader])

  const frameW = WIDTH_PX[width]
  const wrapRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(1)
  const [frameH, setFrameH] = useState(DEFAULT_FRAME_H)

  // Fit the fixed-width email to the column: scale = availableWidth / emailWidth, capped at 1 so it never
  // enlarges past natural size. Re-measures on any container resize, so it stays fit on any screen.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / frameW))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [frameW])

  // Read the email's real rendered height so the whole email shows with no vertical scroll. Runs on each
  // srcDoc load (i.e. on every edit) and is fail-safe (keeps the last good height if the read is blocked).
  const measureHeight = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0)
    if (h > 0) setFrameH(h)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Preview</p>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Preview width">
          {(['desktop', 'mobile'] as const).map((w) => {
            const on = width === w
            const Icon = w === 'desktop' ? Monitor : Smartphone
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                aria-label={w === 'desktop' ? 'Desktop width' : 'Mobile width'}
                onClick={() => setWidth(w)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold transition-colors ${
                  on ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:text-text'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {w === 'desktop' ? 'Desktop' : 'Mobile'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-elevated/40 p-3">
        <div ref={wrapRef} className="overflow-hidden">
          {/* The scaled box owns exactly the footprint of the scaled email, centered, so nothing overflows. */}
          <div className="mx-auto overflow-hidden" style={{ width: frameW * scale, height: frameH * scale }}>
            <iframe
              ref={iframeRef}
              title="Email preview"
              srcDoc={html}
              sandbox="allow-same-origin"
              onLoad={measureHeight}
              className="rounded-lg border border-border bg-white shadow-sm"
              style={{ width: frameW, height: frameH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
