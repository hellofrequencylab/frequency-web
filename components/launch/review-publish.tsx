import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { publishReviewFormAction } from '@/lib/launch/actions'
import type { BuildoutDraft } from '@/lib/launch/buildout-contract'
import { citesFor, REVIEW_ERRORS, type ReviewErrorCode } from '@/lib/launch/review'

// REVIEW + PUBLISH (the body; the route wraps it in the Dashboard template). Everything we built from what the person
// told us, on one page, each field with their own words beside it, editable right where it sits. One Publish button
// at the end writes it. Scheduling and photos are listed as things to tick off later, never as a gate. Server-friendly,
// no hooks: the form posts to publishReviewFormAction.

type Slot = BuildoutDraft['cites'][number]['slot']

function Cites({ draft, slot, field }: { draft: BuildoutDraft; slot: Slot; field: string }) {
  const cites = citesFor(draft, slot, field)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {cites.map((c, i) => (
        <figure
          key={i}
          style={{
            margin: 0,
            display: 'grid',
            gap: 4,
            padding: '10px 14px',
            borderRadius: 16,
            background: 'var(--fq-bg-sunken)',
            borderLeft: '3px solid var(--fq-accent)',
          }}
        >
          <figcaption className="eyebrow">From what you wrote</figcaption>
          <blockquote style={{ margin: 0, fontWeight: 600 }}>&ldquo;{c.snippet}&rdquo;</blockquote>
          <span className="t2">{c.origin}</span>
        </figure>
      ))}
    </div>
  )
}

/** One editable field with the person's words beside it. Stacks on a phone, side by side when there is room. */
function Row({ draft, slot, field, children }: { draft: BuildoutDraft; slot: Slot; field: string; children: React.ReactNode }) {
  if (citesFor(draft, slot, field).length === 0) return <div style={{ minWidth: 0 }}>{children}</div>
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ minWidth: 0 }}>
        <Cites draft={draft} slot={slot} field={field} />
      </div>
    </div>
  )
}

function Card({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="panel" aria-labelledby={`${id}-h`} style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 id={`${id}-h`} className="h2">
          {title}
        </h2>
        {note ? <p className="t2">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Later({ title, why }: { title: string; why: string }) {
  return (
    <section className="panel" aria-label={title} style={{ display: 'grid', gap: 4 }}>
      <h2 className="h2">{title}</h2>
      <p className="t2">{why}</p>
    </section>
  )
}

function Circle() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none' }}>
      <circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--fq-border-hair)" strokeWidth="1.5" />
    </svg>
  )
}

const hasWords = (...v: string[]) => v.some((s) => s.trim().length > 0)

export function ReviewPublish({ draft, errorCode }: { draft: BuildoutDraft; errorCode?: ReviewErrorCode }) {
  const error = errorCode ? REVIEW_ERRORS[errorCode] : undefined
  const siteDrafted = hasWords(draft.website.headline, draft.website.intro)
  const emailDrafted = hasWords(draft.email.subject, draft.email.body)
  return (
    <form action={publishReviewFormAction} style={{ display: 'grid', gap: 20 }}>
      <Card id="space" title="Your Space" note="The line under your name and the story on your page.">
        <Row draft={draft} slot="space" field="tagline">
          <Field label="Tagline" hint="One short line, the way you would say it to a friend.">
            <Input name="tagline" defaultValue={draft.space.tagline} maxLength={140} />
          </Field>
        </Row>
        <Row draft={draft} slot="space" field="about">
          <Field label="About" hint="A few sentences about you and what you offer.">
            <Textarea name="about" defaultValue={draft.space.about} maxLength={4000} rows={6} />
          </Field>
        </Row>
      </Card>

      <Card id="spotlight" title="Spotlight" note="The page people land on when they find you.">
        <Row draft={draft} slot="spotlight" field="name">
          <Field label="Your name or your business" error={errorCode === 'name' ? error : undefined}>
            <Input name="sp_name" defaultValue={draft.spotlight.name} maxLength={80} required aria-invalid={errorCode === 'name'} />
          </Field>
        </Row>
        <Row draft={draft} slot="spotlight" field="line">
          <Field label="One line about what you do" error={errorCode === 'line' ? error : undefined}>
            <Textarea name="sp_line" defaultValue={draft.spotlight.line} maxLength={300} rows={3} required aria-invalid={errorCode === 'line'} />
          </Field>
        </Row>
        <Row draft={draft} slot="spotlight" field="link">
          <Field label="A link you want people to find" hint="Optional. A booking page, a site, anything.">
            <Input name="sp_link" type="url" defaultValue={draft.spotlight.link} maxLength={300} inputMode="url" />
          </Field>
        </Row>
      </Card>

      {siteDrafted ? (
        <Card id="website" title="Website" note="Kept as a draft with your Space. Your website goes live when you turn it on from its own page, so Publish here does not.">
          <Row draft={draft} slot="website" field="headline">
            <Field label="Headline">
              <Input name="web_headline" defaultValue={draft.website.headline} maxLength={120} />
            </Field>
          </Row>
          <Row draft={draft} slot="website" field="intro">
            <Field label="Intro">
              <Textarea name="web_intro" defaultValue={draft.website.intro} maxLength={1000} rows={4} />
            </Field>
          </Row>
        </Card>
      ) : (
        <Later title="Website" why="Nothing drafted yet. It stays on your list and Publish does not wait for it." />
      )}

      {emailDrafted ? (
        <Card id="email" title="First email" note="Kept as a draft. Nothing is sent until you send it yourself.">
          <Row draft={draft} slot="email" field="subject">
            <Field label="Subject">
              <Input name="email_subject" defaultValue={draft.email.subject} maxLength={120} />
            </Field>
          </Row>
          <Row draft={draft} slot="email" field="body">
            <Field label="Message">
              <Textarea name="email_body" defaultValue={draft.email.body} maxLength={4000} rows={6} />
            </Field>
          </Row>
        </Card>
      ) : (
        <Later title="First email" why="Nothing drafted yet. It stays on your list and Publish does not wait for it." />
      )}

      <section className="panel" aria-labelledby="later-h" style={{ display: 'grid', gap: 12 }}>
        <h2 id="later-h" className="h2">
          Whenever you like
        </h2>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 12,
          }}
        >
          <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Circle />
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>Put your first event on the calendar</span>
              <span className="t2">Tick it off after you publish. It never holds this up.</span>
            </div>
          </li>
          <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Circle />
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>Add a photo</span>
              <span className="t2">A face or a place makes this feel like yours. Skip it if you like, and change it any time.</span>
            </div>
          </li>
        </ul>
      </section>

      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <p className="t2">Publishing puts your Space and Spotlight live. You can change every word again afterwards.</p>
        {errorCode === 'retry' && error ? (
          <p className="mu-err" role="alert">
            {error}
          </p>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Button type="submit">Publish</Button>
          <Link className="t2" href="/launch">
            Not yet, take me back to my list
          </Link>
        </div>
      </section>
    </form>
  )
}
