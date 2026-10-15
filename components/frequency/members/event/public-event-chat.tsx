'use client'

import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { JoinPrompt } from '../join-prompt'

// THE EVENT CHAT, SIGNED OUT (owner, 2026-10-14: "chat box (pop up to join)"). The member page has the
// event's thread; a visitor sees that it exists and where to say hi, and the first tap on the box asks them
// to join. No message is read or shown here: the page is ISR and public, and a thread is members' talk. The
// bubbles are a shape, not content.

export function PublicEventChat({ title, joinHref, going }: { title: string; joinHref: string; going: number | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

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

      <JoinPrompt
        open={open}
        dialogRef={dialog}
        dismissible
        onDismiss={() => setOpen(false)}
        title={<>Join the <span className="serif">conversation.</span></>}
        joinHref={joinHref}
        joinLabel="Join free"
        loginHref={`/sign-in?next=${encodeURIComponent(pathname ?? '/events')}`}
        secondary={<a href="#rsvp" className="btn lg" onClick={() => setOpen(false)}>RSVP as a guest</a>}
        footer={<button type="button" className="btn txt sm" onClick={() => setOpen(false)}>Not now</button>}
      >
        Chat with everyone going to {title}. Make a free Frequency account to post, see who is coming and get a
        nudge before it starts.
      </JoinPrompt>
    </section>
  )
}
