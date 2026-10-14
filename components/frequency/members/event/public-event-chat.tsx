'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// THE EVENT CHAT, SIGNED OUT (owner, 2026-10-14: "chat box (pop up to join)"). The member page has the
// event's thread; a visitor sees that it exists and where to say hi, and the first tap on the box asks them
// to join. No message is read or shown here: the page is ISR and public, and a thread is members' talk. The
// bubbles are a shape, not content.

export function PublicEventChat({ title, joinHref, going }: { title: string; joinHref: string; going: number | null }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <section className="panel stack fqm-pe-chat" aria-label="Event chat">
      <div className="row">
        <span className="fqm-pe-chat-ic" aria-hidden>
          <FqIcon name="message" />
        </span>
        <div className="stack grow">
          <span className="t1">Event chat</span>
          <span className="t2">
            {going && going > 1 ? `${going} people are going. Say hi before you show up.` : 'Say hi before you show up.'}
          </span>
        </div>
      </div>
      <div className="fqm-pe-bubbles" aria-hidden>
        <span className="fqm-pe-b l w60" />
        <span className="fqm-pe-b r w45" />
        <span className="fqm-pe-b l w30" />
      </div>
      <button type="button" className="fqm-pe-say" onClick={() => setOpen(true)}>
        <span>Say hi to the group</span>
        <FqIcon name="arrow" />
      </button>

      <dialog ref={dialog} className="fqm-pe-dialog" aria-label="Join to chat" onClose={() => setOpen(false)}>
        <div className="stack">
          <span className="k">Join the conversation</span>
          <span className="h3">Chat with everyone going to {title}</span>
          <span className="t2">
            Make a free Frequency account to post in the event chat, see who is coming and get a nudge before it
            starts. It takes about 30 seconds.
          </span>
          <div className="row wrap">
            <Link href={joinHref} className="btn pa">
              Join free
            </Link>
            <a href="#rsvp" className="btn" onClick={() => setOpen(false)}>
              RSVP as a guest
            </a>
          </div>
          <button type="button" className="btn txt fqm-pe-x" onClick={() => setOpen(false)}>
            Not now
          </button>
        </div>
      </dialog>
    </section>
  )
}
