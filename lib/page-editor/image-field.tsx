'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { uploadSiteMedia } from './upload-action'

// Custom Puck field: upload an image (→ Supabase Storage) or paste a URL.
export function ImageField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await uploadSiteMedia(fd)
    setBusy(false)
    if ('url' in res) onChange(res.url)
    else setErr(res.error)
  }

  return (
    <div className="space-y-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="w-full max-h-40 object-cover rounded-md border border-border" />
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Image URL"
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <label className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-sm cursor-pointer hover:bg-surface-elevated">
          <Upload className="w-3.5 h-3.5" />
          {busy ? '…' : 'Upload'}
          <input type="file" accept="image/*" hidden onChange={onFile} disabled={busy} />
        </label>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}
