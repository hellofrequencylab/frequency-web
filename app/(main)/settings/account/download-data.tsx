'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { downloadMyData } from './export-actions'
import { isError } from '@/lib/action-result'

// "Download my data" — the member-facing control (H2-5 export). Calls the server
// action, then turns the returned JSON into a file the browser saves locally. The
// file never leaves the member's machine after download; nothing is emailed.
export function DownloadData() {
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Sections the export could not carry in full (ADR-1599). The file names them under
  // meta.truncated; this line tells the member before they go looking.
  const [short, setShort] = useState(0)
  const [pending, start] = useTransition()

  return (
    <div className="rounded-card border border-border bg-surface-elevated p-4">
      <h3 className="font-semibold text-text">Download your data</h3>
      <p className="mt-1 text-body-sm text-muted">
        Get a copy of the data we hold for you: your profile, posts, practice logs,
        event RSVPs, circle memberships, your Zaps and Gems history, your contacts,
        what Vera remembers, your unfinished drafts, and your consent settings. It also
        has the messages you sent, your friends, your notifications, the Spaces you
        belong to, and the CRM activity you logged. We put it in one JSON file and your
        browser saves it. It only includes your own data, and anyone else in it shows up
        as their handle.
      </p>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null)
              setDone(false)
              setShort(0)
              const r = await downloadMyData()
              if (isError(r)) {
                setErr(r.error)
                return
              }
              try {
                const blob = new Blob([JSON.stringify(r.data.export, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = r.data.filename
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
                setShort(r.data.export.meta.truncated.length)
                setDone(true)
              } catch {
                setErr('Your data was ready, but the download did not start. Please try again.')
              }
            })
          }
          className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-4 py-1.5 text-body-sm font-semibold text-text hover:border-border-strong transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {pending ? 'Putting it together…' : 'Download my data'}
        </button>
        {done && <span className="text-meta text-muted">Saved to your downloads.</span>}
      </div>
      {done && short > 0 && (
        <p className="mt-2 text-meta text-muted">
          {short === 1 ? 'One part of your file stops' : `${short} parts of your file stop`} short
          of everything we hold. The top of the file lists which ones, under truncated. If you
          need the rest, let us know.
        </p>
      )}
      {err && <p className="mt-2 text-meta text-danger">{err}</p>}
    </div>
  )
}
