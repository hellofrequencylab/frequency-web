'use client'

// The two interactive pieces of the Frequency Help front page (templates/website/Help.html): the hero
// search that filters the topic list in place, and the "Write to us" band.
//
// The reference filtered hand-written Q&A; the product's help center is the content/help articles, so
// the search filters THOSE (title and summary), and every row is a link to the real article route.
// The whole list is server-rendered with an empty query, so a crawler and a no-JS visitor see every
// article. The reference's contact form posted nowhere (README: "wire #hpc to the backend") and the
// product has no contact endpoint, so Send opens the visitor's own mail app addressed to the real
// contact address: nothing is submitted on their behalf, and no new endpoint is invented.
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Input, Textarea } from '@/components/ui/field'

export interface HelpTopic {
  slug: string
  title: string
  description: string
  articles: { title: string; description: string; href: string }[]
}

const matches = (q: string, a: { title: string; description: string }) =>
  !q || `${a.title} ${a.description}`.toLowerCase().includes(q)

export function HelpCenter({ topics }: { topics: HelpTopic[] }) {
  const [query, setQuery] = useState('')
  // The help center's index search submits here as `/help?q=…` (HelpIndexSearch). The page is static,
  // so the query is read from the URL after hydration, not from searchParams on the server.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('q')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the URL on arrival
    if (fromUrl) setQuery(fromUrl)
  }, [])
  const q = query.trim().toLowerCase()
  const shown = topics
    .map((t) => ({ ...t, articles: t.articles.filter((a) => matches(q, a)) }))
    .filter((t) => t.articles.length > 0)

  return (
    <>
      <section className="hp-hero" data-energy="flow" data-screen-label="01 Help">
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.35 } as React.CSSProperties} />
        <div className="fq-grain" />
        <span className="rings" aria-hidden="true" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Help</span>
          </nav>
          <h1 className="h-xl">
            How can we <em className="fq-iri-text">help?</em>
          </h1>
          <label className="hp-s">
            <FqIcon name="search" />
            <Input
              type="search"
              placeholder="Search questions"
              aria-label="Search help"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <nav className="hp-tabs" aria-label="Help topics">
            {topics.map((t) => (
              <a key={t.slug} href={`#${t.slug}`}>
                {t.title}
              </a>
            ))}
            <a href="#policies">Policies</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="02 Questions">
        <div className="wrap">
          {shown.map((t) => (
            <div key={t.slug} className="hp-g" id={t.slug}>
              <div>
                <h2>
                  <Link href={`/help/${t.slug}`}>{t.title}</Link>
                </h2>
                {t.description && <p className="hp-d">{t.description}</p>}
              </div>
              <div className="qa">
                {t.articles.map((a) => (
                  <Link key={a.href} className="hp-a" href={a.href}>
                    <span>
                      <b>{a.title}</b>
                      {a.description && <small>{a.description}</small>}
                    </span>
                    <span className="ar" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <p className="hp-none" role="status" style={shown.length === 0 ? { display: 'block' } : undefined}>
            {topics.length === 0
              ? 'Help articles are coming soon. Write to us below in the meantime.'
              : shown.length === 0
                ? 'No questions match. Try another word, or write to us below.'
                : ''}
          </p>
        </div>
      </section>
    </>
  )
}

/** The reference's #hpc: your email, the message, Send, and a thank-you in place of the form. The
 *  "your email" field rides in the message as the reply-to line, so the person answering sees it even
 *  when the visitor sends from another address. The thank-you does not promise a reply time. */
export function HelpContact({ email }: { email: string }) {
  const [from, setFrom] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  if (sent)
    return (
      <div className="hp-c" role="status">
        <p className="hp-ok">Thanks. Your email app should be open with your message, ready to send.</p>
        <small>
          If it didn’t open, write to <a href={`mailto:${email}`}>{email}</a>.{' '}
          <button type="button" className="hp-again" onClick={() => setSent(false)}>
            Edit the message
          </button>
        </small>
      </div>
    )
  return (
    <form
      className="hp-c"
      onSubmit={(e) => {
        e.preventDefault()
        const body = from ? `Reply to: ${from}\n\n${message}` : message
        window.location.href = `mailto:${email}?subject=${encodeURIComponent('Help')}&body=${encodeURIComponent(body)}`
        setSent(true)
      }}
    >
      <Input
        required
        type="email"
        placeholder="Your email"
        aria-label="Your email"
        autoComplete="email"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <Textarea
        required
        placeholder="What’s going on?"
        aria-label="Message"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button className="btn fq-iri-btn" type="submit">
        Send
      </button>
      <small>
        Opens your email app, addressed to <a href={`mailto:${email}`}>{email}</a>.
      </small>
    </form>
  )
}

export interface HelpIndexEntry {
  title: string
  topic: string
  href: string
}

/**
 * The help center index's search box (the inner pages' left column). It filters every article title
 * in place as you type; Enter (or no JavaScript) submits to the front page's search, `/help?q=…`,
 * which filters titles and summaries across every topic.
 */
export function HelpIndexSearch({ entries }: { entries: HelpIndexEntry[] }) {
  const [query, setQuery] = useState('')
  const listId = useId()
  const q = query.trim().toLowerCase()
  const open = q.length >= 2
  const hits = open ? entries.filter((e) => `${e.title} ${e.topic}`.toLowerCase().includes(q)).slice(0, 8) : []
  return (
    <form className="hc-s" role="search" action="/help" method="get">
      <label className="hc-sl">
        <FqIcon name="search" />
        <Input
          type="search"
          name="q"
          placeholder="Search help"
          aria-label="Search help articles"
          aria-controls={open ? listId : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {open && (
        <div className="hc-res" id={listId} role="status">
          {hits.length > 0 ? (
            <ul>
              {hits.map((h) => (
                <li key={h.href}>
                  <Link href={h.href} onClick={() => setQuery('')}>
                    <b>{h.title}</b>
                    <small>{h.topic}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No titles match. Press Enter to search every article.</p>
          )}
        </div>
      )}
    </form>
  )
}
