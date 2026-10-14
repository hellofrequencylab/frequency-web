'use client'

import '@/app/themes/active/members-a'
import '@/app/themes/active/members-b'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// The Messages route states under Frequency: the two-pane frame holding its place while the inbox
// loads, and the same frame saying it did not load. app/(main)/messages/loading.tsx,
// [id]/loading.tsx and error.tsx render these when SITE_DESIGN is frequency, so the member never
// sees the DAWN skeleton flash inside the kit.

/** The frame while it loads: the list's head, quiet rows and an empty pane (a status, not a spinner). */
export function FqMessagesLoading({ inThread = false }: { inThread?: boolean }) {
  return (
    <div className={inThread ? 'ap-cols l fa-msg in-thread' : 'ap-cols l fa-msg'} aria-busy="true">
      <aside className="side">
        <span className="h2">Messages</span>
        <div className="stack fa-threads" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="fqm-skel-row">
              <span className="fqm-skel fqm-skel-av" />
              <span className="grow stack fqm-gap-sm">
                <span className="fqm-skel fqm-skel-line" />
                <span className="fqm-skel fqm-skel-line short" />
              </span>
            </span>
          ))}
        </div>
      </aside>
      <section className="panel fa-pane">
        <div className="fa-pane-empty">
          <p className="t2" role="status">
            {inThread ? 'Opening the conversation' : 'Loading your conversations'}
          </p>
        </div>
      </section>
    </div>
  )
}

/** The frame when a read failed: say so, offer the retry and the way back. */
export function FqMessagesError({ reset }: { reset: () => void }) {
  return (
    <div className="fa-msg">
      <section className="panel">
        <div className="fa-pane-empty" role="alert">
          <span className="ic" aria-hidden>
            <FqIcon name="message" />
          </span>
          <span className="h3">Messages did not load</span>
          <span className="t2">This part of Messages hit a snag. Try again, or head back to all your conversations.</span>
          <span className="row fqm-gap-sm">
            <button type="button" className="btn" onClick={reset}>
              Try again
            </button>
            <Link className="btn pa" href="/messages">
              Back to messages
            </Link>
          </span>
        </div>
      </section>
    </div>
  )
}
