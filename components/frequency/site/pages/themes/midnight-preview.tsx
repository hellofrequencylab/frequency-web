'use client'

// THE LIVE PREVIEW on the Midnight feature page (LIVE-1382): the sample Midnight site in a frame, desktop or
// phone width, with a door to open it in its own tab. Native Dialog from the kit; no site code runs here, the
// frame only points at /themes/nocturne/demo.
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'

export const MIDNIGHT_DEMO_HREF = '/themes/nocturne/demo'

export function MidnightPreview() {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-ghost fq-iri-rim" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Live preview
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Nocturne live preview" align="center" className="max-w-5xl">
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4 text-text">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2" role="group" aria-label="Preview width">
              <button type="button" className="btn btn-ghost fq-iri-rim" aria-pressed={!phone} onClick={() => setPhone(false)}>
                Desktop
              </button>
              <button type="button" className="btn btn-ghost fq-iri-rim" aria-pressed={phone} onClick={() => setPhone(true)}>
                Phone
              </button>
            </div>
            <div className="flex gap-2">
              <a className="btn btn-ghost fq-iri-rim" href={MIDNIGHT_DEMO_HREF} target="_blank" rel="noopener">
                Open in a new tab
              </a>
              <button type="button" className="btn btn-ghost fq-iri-rim" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
          <iframe
            title="Nocturne sample website"
            src={MIDNIGHT_DEMO_HREF}
            className={`mx-auto h-[70vh] w-full rounded-control border border-border ${phone ? 'max-w-sm' : ''}`}
          />
        </div>
      </Dialog>
    </>
  )
}
