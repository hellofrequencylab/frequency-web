'use client'

import { useState } from 'react'
import { Copy, Check, HeartHandshake, CalendarClock, Gift, Contact } from 'lucide-react'
import { createWarmIntroLink, makeEventLink, makeMagnetLink, makeExchangeLink, type LinkResult } from './actions'

// The four door-link makers for the Space team. Each mints a shareable capture link (and, for the warm
// intro, seals the lead now); the operator copies the link into an email, a DM, a flyer QR, or a
// link-in-bio. Kept in the CRM, gated server-side in the actions.

export function DoorLinks({ slug }: { slug: string }) {
  return (
    <div className="space-y-8">
      <IntroMaker slug={slug} />
      <EventMaker slug={slug} />
      <MagnetMaker slug={slug} />
      <ExchangeMaker slug={slug} />
    </div>
  )
}

function useMaker(run: () => Promise<LinkResult>) {
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    setError(null)
    setUrl(null)
    setStatus('loading')
    const res = await run()
    setStatus('idle')
    if (res.ok) setUrl(res.url)
    else setError(res.error)
  }
  return { status, url, error, go }
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  optional,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  optional?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
        {optional && <span className="font-normal text-subtle"> (optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-border-strong"
      />
    </div>
  )
}

function MakeButton({ status, children }: { status: 'idle' | 'loading'; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={status === 'loading'}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {status === 'loading' ? 'Making it…' : children}
    </button>
  )
}

function LinkResultRow({ url, error }: { url: string | null; error: string | null }) {
  const [copied, setCopied] = useState(false)
  if (error) {
    return (
      <p className="mt-3 text-sm text-danger" role="alert">
        {error}
      </p>
    )
  }
  if (!url) return null
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-canvas p-3">
      <input
        readOnly
        value={url}
        aria-label="Your capture link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent text-sm text-muted outline-none"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          } catch {
            /* clipboard blocked — the field is selectable as a fallback */
          }
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-elevated/70"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Card({
  Icon,
  title,
  blurb,
  children,
}: {
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{blurb}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function IntroMaker({ slug }: { slug: string }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const { status, url, error, go } = useMaker(() => createWarmIntroLink(slug, { email, name }))
  return (
    <Card
      Icon={HeartHandshake}
      title="Warm intro"
      blurb="Introduce someone to this space. We seal them as a lead now, but they hear nothing until they open the link and say yes. That yes is the opt-in."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="intro-name" label="Their name" optional value={name} onChange={setName} placeholder="Alex" />
          <Field id="intro-email" label="Their email" type="email" value={email} onChange={setEmail} placeholder="alex@email.com" />
        </div>
        <MakeButton status={status}>Make the intro link</MakeButton>
      </form>
      <LinkResultRow url={url} error={error} />
    </Card>
  )
}

function EventMaker({ slug }: { slug: string }) {
  const [title, setTitle] = useState('')
  const [tier, setTier] = useState('attended')
  const { status, url, error, go } = useMaker(() => makeEventLink(slug, { eventTitle: title, tier }))
  return (
    <Card
      Icon={CalendarClock}
      title="Event check-in"
      blurb="Point attendees here (a QR on the screen, a link in the invite). Checking in drops them into your CRM with the event as their entry point. No email promised."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="event-title" label="Event name" optional value={title} onChange={setTitle} placeholder="Sunday Sit" />
          <div>
            <label htmlFor="event-tier" className="mb-1.5 block text-sm font-semibold text-text">
              Attendance
            </label>
            <select
              id="event-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-border-strong"
            >
              <option value="attended">Attended</option>
              <option value="rsvp">RSVP</option>
              <option value="vip">VIP</option>
            </select>
          </div>
        </div>
        <MakeButton status={status}>Make the check-in link</MakeButton>
      </form>
      <LinkResultRow url={url} error={error} />
    </Card>
  )
}

function MagnetMaker({ slug }: { slug: string }) {
  const [label, setLabel] = useState('')
  const [resource, setResource] = useState('')
  const { status, url, error, go } = useMaker(() => makeMagnetLink(slug, { label, resourceUrl: resource }))
  return (
    <Card
      Icon={Gift}
      title="Lead magnet"
      blurb="Give something away, a guide, a discount, a checklist. The download is the opt-in, so people who unlock it join your list. The page says so plainly."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
        className="space-y-3"
      >
        <Field id="magnet-label" label="What they get" value={label} onChange={setLabel} placeholder="The 5-minute calm-down guide" />
        <Field
          id="magnet-resource"
          label="Link to the resource"
          optional
          type="url"
          value={resource}
          onChange={setResource}
          placeholder="https://…"
        />
        <MakeButton status={status}>Make the unlock link</MakeButton>
      </form>
      <LinkResultRow url={url} error={error} />
    </Card>
  )
}

function ExchangeMaker({ slug }: { slug: string }) {
  const [tagline, setTagline] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const { status, url, error, go } = useMaker(() => makeExchangeLink(slug, { tagline, profileUrl }))
  return (
    <Card
      Icon={Contact}
      title="Card swap"
      blurb="A two-way handshake. Share this and the other person leaves their details, then gets your card back. A swap, not a sign-up."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
        className="space-y-3"
      >
        <Field id="swap-tagline" label="One line about you" optional value={tagline} onChange={setTagline} placeholder="Breathwork and cold plunges in Encinitas" />
        <Field id="swap-url" label="A page to send them to" optional type="url" value={profileUrl} onChange={setProfileUrl} placeholder="https://…" />
        <MakeButton status={status}>Make the swap link</MakeButton>
      </form>
      <LinkResultRow url={url} error={error} />
    </Card>
  )
}
