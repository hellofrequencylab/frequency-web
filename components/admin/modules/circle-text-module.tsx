'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, Type } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { getCircleTextForEditor, saveCircleTextOverride } from '@/lib/circles/circle-text-actions'

// The per-circle editor for the movable Page-text block (the `circle-text` layout module). Rendered
// in the circle Settings drawer alongside "Circle settings" (registry id `circle.text`). It edits
// ONE circle's override copy; leaving it blank falls the block back to the network default. Like the
// other dock modules it self-fetches via a server action that returns null unless the caller holds
// circle.editSettings, so an unauthorized viewer sees nothing (the dock's role gate is coarse; the
// action is the fine, server-side law). Save also re-checks the capability.

type TextData = NonNullable<Awaited<ReturnType<typeof getCircleTextForEditor>>>

export function CircleTextModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<TextData | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleTextForEditor(slug).then((d) => {
      if (!active) return
      setData(d)
      if (d) setText(d.text)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  const mod = moduleById('circle.text')
  const Icon = mod?.Icon ?? Type

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await saveCircleTextOverride(data!.id, data!.slug, text)
      if (res.error) {
        setErr(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <section>
      <header className="mb-3 space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-primary-strong" />
          {mod?.label ?? 'Page text'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>

      <div className="space-y-2">
        <label className="block space-y-1.5">
          <span className={labelClasses}>Text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            disabled={pending}
            placeholder="Add a welcome, a schedule, a note. Leave blank to use the network default."
            className={`${fieldClasses} resize-y`}
          />
        </label>
        <p className="text-xs text-muted">
          Formatting: <code>**bold**</code>, <code>*italic*</code>, <code>[label](/path)</code>. Place it anywhere from
          Layout below.
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
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  )
}
