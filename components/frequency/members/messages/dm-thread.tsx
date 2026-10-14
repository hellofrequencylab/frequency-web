'use client'

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { markConversationRead, sendMessage } from '@/app/(main)/messages/actions'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/messages/typing-indicator'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'
import type { Message } from '@/components/messages/thread'
import { Textarea } from '@/components/ui/field'
import { FqIcon } from '@/components/frequency/icon'

// HOME_TZ from lib/time/zone.ts, written out: that module carries tz-lookup, too heavy for a client bundle.
const HOME_TZ = 'America/Los_Angeles'

// The Frequency DM transcript and composer (Messages.html): their bubble left on white, yours right
// on the accent gradient, the time under each, a pill input and Send. The behaviour is the
// platform's MessageThread, unchanged: the realtime insert subscription, the typing broadcast, the
// optimistic bubble rolled back with the draft restored on a refused send, and the scroller that
// stays pinned to the newest message without scrolling the page behind it.
//
// The composer keeps the shared chat contract (components/ui/chat-composer.tsx) in the kit's pill:
// Enter sends, Shift+Enter is a new line, the box grows to a cap, and a failed send puts the words
// back. The transcript is a log region, so a screen reader hears a new message as it lands. A message
// that arrives while the thread is open moves the read mark (markConversationRead), and being offline
// is said before a send, not discovered after it fails.
//
// The reference's two composer icons (Add photo, Share event) and its shared-event card are not drawn:
// a direct message is text only (messages.body), so there is nothing behind them yet.

type Participant = { id: string; display_name: string }

// Days and times read in the home zone (lib/time/zone.ts), not the runtime's: the server renders in UTC and
// the browser in local time, so a local read could put a day line on one side of hydration and not the other.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const TIME_FMT = new Intl.DateTimeFormat('en-US', { timeZone: HOME_TZ, hour: 'numeric', minute: '2-digit' })
const DATE_TIME_FMT = new Intl.DateTimeFormat('en-US', { timeZone: HOME_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const DAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: HOME_TZ, weekday: 'long', month: 'short', day: 'numeric' })
const DAY_MS = 86_400_000
const MAX_COMPOSER_PX = 160
const OFFLINE_DRAFT = 'You are offline. Your message is still here; send it when you are back.'

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return DAY_KEY.format(d) === DAY_KEY.format(new Date())
    ? TIME_FMT.format(d).replace(' ', '').toLowerCase()
    : DATE_TIME_FMT.format(d)
}

/** The reference's centred day line ("Today") between messages from different days. */
function dayLine(iso: string): string {
  const d = new Date(iso)
  const key = DAY_KEY.format(d)
  const now = Date.now()
  if (key === DAY_KEY.format(now)) return 'Today'
  if (key === DAY_KEY.format(now - DAY_MS)) return 'Yesterday'
  return DAY_FMT.format(d)
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function FqDmThread({
  conversationId,
  initialMessages,
  myProfileId,
  participants,
  peerFirstName,
}: {
  conversationId: string
  initialMessages: Message[]
  myProfileId: string
  participants: Participant[]
  peerFirstName: string | null
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // The server cannot know; it renders online, and the browser corrects it after hydration.
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const boxRef = useRef<HTMLTextAreaElement | null>(null)
  const byId = Object.fromEntries(participants.map((p) => [p.id, p]))
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `conv:${conversationId}`,
    userId: myProfileId,
    displayName: byId[myProfileId]?.display_name,
  })
  const { ref, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as Message
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev
          if (m.sender_id === myProfileId) {
            const i = prev.findIndex((x) => x.id.startsWith('optimistic-') && x.body === m.body)
            if (i !== -1) {
              const next = prev.slice()
              next[i] = m
              return next
            }
          }
          return [...prev, m]
        })
        // Read while it is on screen: move the mark so the inbox does not count it as new.
        if (m.sender_id !== myProfileId && document.visibilityState === 'visible') {
          void markConversationRead(conversationId).catch(() => {})
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, myProfileId])

  // Grow the box to what has been typed, capped (measured from auto, so it also shrinks back).
  useEffect(() => {
    const ta = boxRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_COMPOSER_PX)}px`
  }, [body])

  // Focus the composer on open, but never on a touch screen: raising the keyboard over a thread the
  // member has not read yet costs more than the tap it saves.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) boxRef.current?.focus()
  }, [conversationId])

  function send() {
    const text = body.trim()
    if (!text || pending) return
    if (!online) {
      setError(OFFLINE_DRAFT)
      return
    }
    setError(null)
    const optimistic: Message = { id: `optimistic-${Date.now()}`, conversation_id: conversationId, sender_id: myProfileId, body: text, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, optimistic])
    setBody('')
    stopTyping()
    stickNow()
    const fd = new FormData()
    fd.set('body', text)
    start(async () => {
      try {
        await sendMessage(conversationId, fd)
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setBody((cur) => cur || text)
        setError(
          !navigator.onLine
            ? OFFLINE_DRAFT
            : err instanceof Error && err.message
              ? `${err.message}. Your message is still here.`
              : 'That did not send. Your message is still here; try again.',
        )
        boxRef.current?.focus()
      }
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    send()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a new line; never mid-composition (an IME's Enter picks a word).
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    send()
  }

  return (
    <>
      <div ref={ref} className="fa-pane-b">
        {messages.length === 0 && <p className="why fqm-text-center">No messages yet. Say hello.</p>}
        <div className="fqm-log" role="log" aria-label="Messages">
          {messages.map((m, i) => {
            const mine = m.sender_id === myProfileId
            const who = !mine && participants.length > 2 ? byId[m.sender_id]?.display_name : null
            const day = dayLine(m.created_at)
            const newDay = i === 0 || dayLine(messages[i - 1].created_at) !== day
            const sending = m.id.startsWith('optimistic-')
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <span className="t2 fqm-daysep" suppressHydrationWarning>
                    {day}
                  </span>
                )}
                <div className={mine ? 'fa-bub me' : 'fa-bub'}>
                  <span>
                    <span className="sr-only">{mine ? 'You: ' : `${byId[m.sender_id]?.display_name ?? 'Them'}: `}</span>
                    {m.body}
                  </span>
                  <small>
                    {who ? `${who} · ` : ''}
                    {sending ? (
                      'Sending'
                    ) : (
                      <time dateTime={m.created_at} suppressHydrationWarning>
                        {timeLabel(m.created_at)}
                      </time>
                    )}
                  </small>
                </div>
              </Fragment>
            )
          })}
        </div>
        <TypingIndicator names={typingNames} />
      </div>
      {!online && (
        <p className="t2 fqm-pane-note" role="status">
          You are offline. New messages will show when you are back.
        </p>
      )}
      {error && (
        <p className="t2 fqm-pane-note fqm-danger" role="alert">
          {error}
        </p>
      )}
      <form className="row fa-pane-f" onSubmit={submit}>
        <Textarea
          ref={boxRef}
          className="grow fqm-composer"
          rows={1}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            notifyTyping()
          }}
          onKeyDown={onKeyDown}
          placeholder={peerFirstName ? `Write to ${peerFirstName}` : 'Write a message'}
          aria-label={peerFirstName ? `Message ${peerFirstName}` : 'Message'}
          aria-keyshortcuts="Enter"
          aria-invalid={error ? true : undefined}
          maxLength={4000}
        />
        <button type="submit" className="btn pa" disabled={pending || !body.trim()}>
          <FqIcon name="send" />
          Send
        </button>
      </form>
    </>
  )
}
