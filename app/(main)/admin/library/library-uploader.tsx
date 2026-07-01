'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { uploadLibraryImage } from './actions'

// The upload control for the Library gallery. Picks a file, posts it to the
// janitor-gated server action, and refreshes the grid on success.
export function LibraryUploader() {
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    const fd = new FormData()
    fd.set('file', file)
    start(async () => {
      const res = await uploadLibraryImage(fd)
      if ('error' in res) setErr(res.error)
      else router.refresh()
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label
        className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover ${
          pending ? 'pointer-events-none opacity-70' : ''
        }`}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {pending ? 'Uploading…' : 'Upload image'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          disabled={pending}
        />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}
