'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { labelClasses, fieldClasses } from '@/components/ui/field'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import { getCircleTextForEditor, saveCircleTextOverride } from '@/lib/circles/circle-text-actions'

// The per-circle editor for the movable Page-text block (the `circle-text` layout module). Rendered in the
// circle rail under "Basics" (registry id `circle.text`). It edits ONE circle's override copy; blank falls
// the block back to the network default. Self-fetches via a server action that returns null unless the
// caller holds circle.editSettings; the save re-checks it too. The rail supplies the title ("Page text");
// edits autosave on blur and reflect on the page live.

type TextData = NonNullable<Awaited<ReturnType<typeof getCircleTextForEditor>>>

export function CircleTextModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<TextData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleTextForEditor(slug).then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [slug])

  // Adapt the (id, slug, text) action to the FormData autosave contract; throw on error so the shared
  // save cue shows the reason instead of a false "Saved".
  const id = data?.id
  const dataSlug = data?.slug
  const action = useCallback(
    async (fd: FormData) => {
      const res = await saveCircleTextOverride(id!, dataSlug!, String(fd.get('text') ?? ''))
      if (res.error) throw new Error(res.error)
    },
    [id, dataSlug],
  )

  if (!slug) return null
  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  return (
    <RailAutosaveForm action={action} className="space-y-2">
      <label className="block space-y-1.5">
        <span className={labelClasses}>Text</span>
        <textarea
          name="text"
          defaultValue={data.text}
          rows={5}
          placeholder="Add a welcome, a schedule, a note. Leave blank to use the network default."
          className={`${fieldClasses} resize-y`}
        />
      </label>
      <p className="text-xs text-muted">
        Formatting: <code>**bold**</code>, <code>*italic*</code>, <code>[label](/path)</code>. Place it anywhere from
        Layout below.
      </p>
    </RailAutosaveForm>
  )
}
