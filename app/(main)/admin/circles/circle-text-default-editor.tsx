'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { saveCircleTextDefault } from '@/lib/circles/circle-text-actions'

// The network-wide default for the movable circle Page-text block (janitor only). Sets the copy
// every circle shows in its Page-text block until that circle sets its own override
// (circle-text-module.tsx). Mounted on /admin/circles behind a server-side janitor gate; the action
// re-checks janitor, so this is convenience UI over a server-enforced rule.
export function CircleTextDefaultEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await saveCircleTextDefault(text)
      if (res.error) {
        setErr(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="max-w-2xl space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <label className="block space-y-1.5">
        <span className={labelClasses}>Default text</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          disabled={pending}
          placeholder="The text every circle shows until it sets its own. Leave blank for none."
          className={`${fieldClasses} resize-y`}
        />
      </label>
      <p className="text-xs text-muted">
        Formatting: <code>**bold**</code>, <code>*italic*</code>, <code>[label](/path)</code>. Each circle can override
        this from its own Settings, and operators place the block from the circle Layout editor.
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        {err && <span className="text-xs font-medium text-danger">{err}</span>}
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save default'}
        </button>
      </div>
    </div>
  )
}
