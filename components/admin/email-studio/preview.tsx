'use client'

import { useEffect, useMemo, useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { applyMergeTags } from '@/lib/email-studio/render'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// LIVE EMAIL PREVIEW. Compiles the working email doc (block layout + subject + preheader) to send-ready HTML
// IN THE BROWSER (lib/email-studio compile is pure + framework-free, so it is client-safe) and renders it in
// a sandboxed <iframe srcDoc>. A width toggle switches between a desktop (600px) and a mobile (360px) frame
// so the operator sees both inbox shapes. Merge tags are filled with EXAMPLE values so `{{ contact.first_name }}`
// reads naturally. Read-only surface: no writes, repaints instantly from the shared store as the operator edits.

const EXAMPLE_VARS: Record<string, string> = Object.fromEntries(
  MERGE_TAG_VARIABLES.map((v) => [v.token, v.example]),
)

type PreviewWidth = 'desktop' | 'mobile'
const WIDTH_PX: Record<PreviewWidth, number> = { desktop: 600, mobile: 360 }

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

  // Load the compiled email into the sandboxed frame via a same-origin blob URL instead of srcDoc. The
  // result is identical and equally safe (sandbox="" runs no scripts, and the renderer already escapes all
  // authored text), and it keeps the compiled HTML string off the DOM-based-XSS sink path. Revoke on change.
  const src = useMemo(() => URL.createObjectURL(new Blob([html], { type: 'text/html' })), [html])
  useEffect(() => () => URL.revokeObjectURL(src), [src])

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

      <div className="flex justify-center overflow-x-auto rounded-2xl border border-border bg-surface-elevated/40 p-3">
        <iframe
          title="Email preview"
          src={src}
          sandbox=""
          className="h-[640px] rounded-lg border border-border bg-white shadow-sm"
          style={{ width: WIDTH_PX[width], maxWidth: '100%' }}
        />
      </div>
    </div>
  )
}
