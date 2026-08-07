'use client'

// The PUBLIC contact dock (chat consolidation P3+P4, on ADR-816's spine plumbing). One floating
// launcher + panel on every public page, leading with CONTACT US: a send-us-a-message form (name +
// email + message), form-first — submitting shows a confirmation, never auto-opens a live session
// (the owner's directive: a support-request form, not a live-response widget). The request becomes a
// ticketed conversation on the comms spine (the operator answers in CRM Conversations; a signed-in
// sender is member-bound so it also shows in their in-app inbox). The visitor can explicitly open
// "View conversation" — only THEN does the Broadcast live thread (typing, instant delivery) spin up.
//
// The SECOND section is the member doorway: signed-out visitors get a log in / register prompt
// (magic-link sign-in IS registration); a signed-in member on a public page gets a pointer into the
// app, where the full dock (Messages + Vera) lives. Auth detection mirrors the marketing header's
// getSession() pattern (cookie read, no network). Off unless NEXT_PUBLIC_SUPPORT_CHAT is enabled.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X, Send, Loader2, ArrowLeft, CheckCircle2, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isError } from '@/lib/action-result'
import {
  startSupportChatAction,
  postSupportChatMessageAction,
  loadSupportChatHistoryAction,
} from '@/app/support-chat/actions'
import { useSupportChat } from './use-support-chat'
import { Input, Textarea } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'

interface Session {
  ref: string
  token: string
  name: string
}

const SESSION_KEY = 'freq.support-chat.session'
const VIEWER_KEY = 'freq.support-chat.viewer'

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.ref && s?.token ? (s as Session) : null
  } catch {
    return null
  }
}

function readViewerId(): string {
  try {
    let id = localStorage.getItem(VIEWER_KEY)
    if (!id) {
      id = `v-${crypto.randomUUID()}`
      localStorage.setItem(VIEWER_KEY, id)
    }
    return id
  } catch {
    return 'v-anon'
  }
}

/** The views the panel can show: the contact form, the post-submit confirmation, or the open thread. */
type View = 'form' | 'sent' | 'thread'

export function SupportChatWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('form')
  const [hydrated, setHydrated] = useState<{ ready: boolean; session: Session | null; viewerId: string }>({
    ready: false,
    session: null,
    viewerId: 'v-anon',
  })
  const { ready, session, viewerId } = hydrated
  // Signed-in? (cookie read, no network — the marketing-header pattern). Default signed-out.
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    // One-time hydrate from localStorage (client-only; SSR renders the loader).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated({ ready: true, session: readSession(), viewerId: readViewerId() })
    let live = true
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setAuthed(!!data.session)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  function onStarted(s: Session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
    setHydrated((h) => ({ ...h, session: s }))
    // FORM-FIRST (P4): a submitted request shows the confirmation. The live thread opens only on the
    // explicit "View conversation" tap, so the entry is a message form, not a live-response widget.
    setView('sent')
  }

  const body = !ready ? (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted" />
    </div>
  ) : view === 'thread' && session ? (
    <ChatSession session={session} viewerId={viewerId} onBack={() => setView('sent')} />
  ) : view === 'sent' || (session && view === 'form') ? (
    <SentConfirmation onView={() => setView('thread')} onNew={() => setView('form')} sessionExists={!!session} />
  ) : (
    <>
      <StartForm onStarted={onStarted} />
      <MemberDoorway authed={authed} nextPath={pathname ?? '/'} />
    </>
  )

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 print:hidden">
      {open && (
        <div className="mb-3 flex h-[32rem] max-h-[calc(100dvh-6rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">Contact us</p>
              <p className="text-2xs text-muted">Send us a message. We reply by email and right here.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {body}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close contact panel' : 'Contact us'}
        className="flex h-14 w-14 items-center justify-center rounded-pill bg-primary text-on-primary shadow-pop transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  )
}

/** The post-submit confirmation (form-first): the request is in; the live thread is one tap away. */
function SentConfirmation({
  onView,
  onNew,
  sessionExists,
}: {
  onView: () => void
  onNew: () => void
  sessionExists: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
      <p className="text-body-sm font-semibold text-text">Your message is in.</p>
      <p className="text-meta text-muted">
        We will reply to your email, and the conversation stays right here whenever you want to check it.
      </p>
      {sessionExists && (
        <button
          type="button"
          onClick={onView}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          View conversation
        </button>
      )}
      <button type="button" onClick={onNew} className="text-meta font-medium text-muted hover:text-text">
        Send another message
      </button>
    </div>
  )
}

/** The member doorway (second section): sign in / register for Messages + Vera; members get a pointer
 *  into the app, where the full dock lives. */
function MemberDoorway({ authed, nextPath }: { authed: boolean; nextPath: string }) {
  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      {authed ? (
        <a
          href="/feed"
          className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary"
        >
          <UserRound className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-text">Open the app</span>
            <span className="block truncate text-meta text-muted">Your Messages and Vera live inside.</span>
          </span>
        </a>
      ) : (
        <a
          href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
          className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary"
        >
          <UserRound className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          <span className="min-w-0">
            <span className="block text-body-sm font-medium text-text">Log in or register</span>
            <span className="block truncate text-meta text-muted">Message members and chat with Vera inside.</span>
          </span>
        </a>
      )}
    </div>
  )
}

function StartForm({ onStarted }: { onStarted: (s: { ref: string; token: string; name: string }) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    const r = await startSupportChatAction({ name, email, message })
    setPending(false)
    if (isError(r)) {
      setError(r.error)
      return
    }
    onStarted({ ref: r.data.ref, token: r.data.token, name: name.trim() || 'Visitor' })
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      <Input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        type="email"
        aria-label="Your email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Textarea
        className="min-h-[5rem] resize-none"
        aria-label="How can we help?"
        placeholder="How can we help?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Send message
      </button>
    </form>
  )
}

function ChatSession({ session, viewerId, onBack }: { session: Session; viewerId: string; onBack: () => void }) {
  const { messages, loading, error, send, typingNames, notifyTyping } = useSupportChat({
    token: session.token,
    viewerId,
    viewerName: session.name,
    role: 'visitor',
    persist: (body) => postSupportChatMessageAction({ ref: session.ref, token: session.token, body }),
    loadHistory: () => loadSupportChatHistoryAction({ ref: session.ref, token: session.token }),
  })
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, typingNames.length])

  function onSend() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    void send(body)
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-lg p-1 text-muted hover:bg-surface-elevated hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-meta font-medium text-muted">Your conversation</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {loading && <p className="text-center text-2xs text-muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-2xs text-muted">Your messages show here, along with our replies.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.author === 'visitor' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-body-sm ${
                m.author === 'visitor' ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-text'
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
        {typingNames.length > 0 && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-1 rounded-2xl bg-surface-elevated px-3 py-2">
              <span className="size-1.5 animate-bounce rounded-pill bg-muted [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-pill bg-muted [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-pill bg-muted" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="px-3 pb-1 text-2xs text-danger">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2 border-t border-border p-2">
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            notifyTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          rows={1}
          aria-label="Write a message"
          placeholder="Write a message…"
          className="max-h-24 flex-1 resize-none"
        />
        <IconButton label="Send" variant="filled" onClick={onSend} className="shrink-0">
          <Send className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </>
  )
}
