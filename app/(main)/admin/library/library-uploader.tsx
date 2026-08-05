'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { prepareImageForUpload, SERVER_MAX_BYTES } from '@/lib/library/image-shrink'
import { uploadLibraryImage } from './actions'

// The upload control for the Library gallery. Picks a file, posts it to the
// janitor-gated server action, and refreshes the grid on success.
export function LibraryUploader() {
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setErr(null)
    start(async () => {
      // Prep in the browser first (the shared seam): an iPhone HEIC is converted to JPEG (a raw HEIC
      // stores fine but renders broken in every browser but Safari), then a big photo is downscaled
      // so the server action stays under the platform body limit. An unconvertible HEIC gets an
      // inline message instead of a broken upload.
      const prepared = await prepareImageForUpload(raw)
      if ('error' in prepared) {
        setErr(prepared.error)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      const file = prepared.file
      if (file.size > SERVER_MAX_BYTES) {
        setErr(`That image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Try a smaller one.`)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      const fd = new FormData()
      fd.set('file', file)
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
      {err && <p className="text-meta text-danger">{err}</p>}
    </div>
  )
}
