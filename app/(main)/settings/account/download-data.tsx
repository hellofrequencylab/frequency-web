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
  const [pending, start] = useTransition()

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <h3 className="font-semibold text-text">Download your data</h3>
      <p className="mt-1 text-sm text-muted">
        Get a copy of the data we hold for you: your profile, posts, practice logs,
        event RSVPs, circle memberships, your Zaps and Gems history, your contacts,
        what Vera remembers, and your consent settings. We put it in one JSON file
        and your browser saves it. It only includes your own data.
      </p>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null)
              setDone(false)
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
                setDone(true)
              } catch {
                setErr('Your data was ready, but the download did not start. Please try again.')
              }
            })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-semibold text-text hover:border-border-strong transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {pending ? 'Putting it together…' : 'Download my data'}
        </button>
        {done && <span className="text-xs text-muted">Saved to your downloads.</span>}
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  )
}
