import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { InlineText } from '@/components/sites/inline-text'
import { NetworkKitContactForm } from '@/components/sites/network-kit-contact-form'
import { NkGlyph, NETWORK_KIT_GLYPH_NAMES } from '@/components/sites/network-kit-glyph'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { storedWallClock } from '@/lib/sites/site-events'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import {
  NETWORK_KIT_CALENDAR, NETWORK_KIT_CHAPTERS, NETWORK_KIT_CIRCLES, NETWORK_KIT_CONTACT, NETWORK_KIT_FEATURED, NETWORK_KIT_MERCH, NETWORK_KIT_NOTE,
  NETWORK_KIT_PILLARS, NETWORK_KIT_PODCAST, NETWORK_KIT_ROOMS, NETWORK_KIT_SOCIAL, NETWORK_KIT_STATS, NETWORK_KIT_VENUE,
} from '@/lib/sites/network-kit-extras'
import {
  Band, Btn, DateTile, Head, MONTHS, Section, Tap, arr, block, clock, countField, eventHref, hrefOf, img, spaceOf, str, upcoming, whenOf, type Common,
} from './network-kit'

// ── The Network kit's thirteen extra home blocks (Network design system, ui_kits/site/NetworkBlocks.jsx) ───────────
// Featured event, where and when, events calendar, chapters, circles, stats, organizer note, what we stand for, host
// here, podcast, Instagram, shop strip, and coffee and contact. They sit beside the fourteen base blocks
// (network-kit.tsx), share its head, band, button and link pieces, and wear the same sheet
// (components/sites/network-kit-more-css.ts), tokens only. The design gives them one view each, so the only choice
// they carry is which side the photo sits on. Server Components, except the contact form. The live ones read the
// Space's own rows from `puck.metadata.space` (next event, events, counts); the cards in the defaults are only the
// empty state. The design's ticking countdown is left out on purpose: a site is cached, so a clock would freeze at
// the minute it was drawn. The date and time say the same thing and stay true.

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
const photo = (src: string | null, alt: string, className?: string) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
    <img className={className} src={src} alt={alt} loading="lazy" />
  ) : null

/** One line for an event: "Friday morning table · Thu 30 Oct · 10:00am · The courtyard". */
const eventLine = (e: { title: string; startsAt: string; location?: string | null }) => [e.title, whenOf(e.startsAt), e.location ?? ''].filter(Boolean).join(' · ')

// ── Featured event ──────────────────────────────────────────────────────────────────────────

function NetworkKitFeaturedBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const src = img(p.image)
  const next = p.showWhen !== false ? upcoming(metadata, now)[0] : undefined
  const at = next ? storedWallClock(next.startsAt) : null
  const to = next ? eventHref(next, metadata) : null
  return (
    <Band kind="featured" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-featured nk-grain" data-flip={p.flip === true ? '' : undefined}>
          <div className="nk-featured-copy">
            {str(p.eyebrow) && <div className="nk-eyebrow">{str(p.eyebrow)}</div>}
            <h2 className="nk-display nk-display--h2"><InlineText text={str(p.title)} /></h2>
            {str(p.lead) && <p className="nk-featured-lead">{str(p.lead)}</p>}
            {next && (
              <Tap to={to} className="nk-featured-when">
                <DateTile month={at ? MONTHS[at.getUTCMonth()] : ''} day={at ? String(at.getUTCDate()) : ''} />
                <span className="nk-featured-when-text">{eventLine(next)}</span>
              </Tap>
            )}
            <div className="nk-actions">
              <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} kind="dark" metadata={metadata} size="lg" arrow />
              <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} size="lg" />
            </div>
          </div>
          {src && <div className="nk-featured-media nk-photo" data-grade="">{photo(src, str(p.alt))}</div>}
        </div>
      </Section>
    </Band>
  )
}

// ── Where and when ──────────────────────────────────────────────────────────────────────────

function NetworkKitVenueBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const facts = arr(p.facts).filter((f) => str(f.label) && (str(f.value) || str(f.note)))
  return (
    <Band kind="venue" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-split nk-split--stretch nk-venue" data-flip={p.flip === true ? '' : undefined}>
          {src && <div className="nk-venue-media nk-photo" data-grade="">{photo(src, str(p.alt))}</div>}
          <div className="nk-venue-copy">
            <Head p={p} metadata={metadata} button={null} />
            {facts.length > 0 && (
              <div className="nk-facts">
                {facts.map((f, i) => (
                  <div key={i} className="nk-fact nk-grain">
                    <span className="nk-fact-label"><NkGlyph name={str(f.glyph) || 'pin'} size={16} />{str(f.label)}</span>
                    {str(f.value) && <b>{str(f.value)}</b>}
                    {str(f.note) && <span>{str(f.note)}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="nk-actions">
              <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} arrow />
              <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} />
            </div>
          </div>
        </div>
      </Section>
    </Band>
  )
}

// ── Events calendar ─────────────────────────────────────────────────────────────────────────

function NetworkKitCalendarBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const count = Math.max(1, Math.min(12, Number(p.count) || 8))
  const events = upcoming(metadata, now).slice(0, count)
  const rows = (events.length
    ? events.map((e) => {
        const d = storedWallClock(e.startsAt)
        return { month: d ? MONTHS[d.getUTCMonth()] : '', day: d ? String(d.getUTCDate()) : '', title: e.title, time: d ? clock(d) : '', where: e.location ?? '', href: eventHref(e, metadata) ?? '' }
      })
    : arr(p.rows).slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), title: str(r.title), time: str(r.time), where: str(r.where), href: hrefOf(str(r.href), metadata) ?? '' }))
  ).filter((r) => r.title)
  return (
    <Band kind="calendar" p={p} pad={pad} vis={vis}>
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {rows.map((r, i) => (
            <Tap key={i} to={r.href || null} className="nk-card nk-card--lift nk-cal-card">
              <span className="nk-between">
                <span className="nk-date" data-tint=""><b>{r.month}</b><span>{r.day}</span></span>
                {r.where && <span className="nk-badge">{r.where}</span>}
              </span>
              <span className="nk-cal-card-text">
                <b>{r.title}</b>
                {r.time && <span className="nk-cal-card-time"><NkGlyph name="clock" size={15} />{r.time}</span>}
              </span>
            </Tap>
          ))}
        </div>
        {!rows.length && str(p.empty) && <p className="nk-row-body nk-empty">{str(p.empty)}</p>}
      </Section>
    </Band>
  )
}

// ── Chapters ────────────────────────────────────────────────────────────────────────────────

function NetworkKitChaptersBlock({ p, metadata, pad, vis }: Common) {
  const chapters = arr(p.chapters).filter((c) => str(c.name))
  return (
    <Band kind="chapters" p={p} pad={pad} vis={vis} className="nk-band--ink">
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {chapters.map((c, i) => {
            const src = img(c.image)
            return (
              <Tap key={i} to={hrefOf(str(c.href), metadata)} className="nk-card nk-card--lift nk-chapter">
                {src && <div className="nk-chapter-cover nk-photo" data-grade="">{photo(src, '')}</div>}
                <div className="nk-chapter-body">
                  {str(c.when) && <span className="nk-chapter-when"><NkGlyph name="pin" size={14} />{str(c.when)}</span>}
                  <b className="nk-display nk-chapter-name">{str(c.name)}</b>
                  {(str(c.where) || str(c.members)) && <span className="nk-row-body">{[str(c.where), str(c.members) && `${str(c.members)} members`].filter(Boolean).join(' · ')}</span>}
                </div>
              </Tap>
            )
          })}
        </div>
      </Section>
    </Band>
  )
}

// ── Circles ─────────────────────────────────────────────────────────────────────────────────

function NetworkKitCirclesBlock({ p, metadata, pad, vis }: Common) {
  const circles = arr(p.circles).filter((c) => str(c.name))
  return (
    <Band kind="circles" p={p} pad={pad} vis={vis}>
      <Section>
        <Head p={p} metadata={metadata} button={null} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {circles.map((c, i) => (
            <Tap key={i} to={hrefOf(str(c.href), metadata)} className="nk-card nk-card--lift nk-circle">
              <span className="nk-circle-mark"><NkGlyph name={str(c.glyph) || 'circle'} size={22} /></span>
              <b>{str(c.name)}</b>
              {str(c.blurb) && <span className="nk-circle-blurb">{str(c.blurb)}</span>}
              {str(c.note) && <span className="nk-meta nk-push">{str(c.note)}</span>}
            </Tap>
          ))}
        </div>
      </Section>
    </Band>
  )
}

// ── Stats ───────────────────────────────────────────────────────────────────────────────────

function NetworkKitStatsBlock({ p, metadata, pad, vis }: Common) {
  const own = arr(p.items).filter((s) => str(s.value) && str(s.label)).map((s) => ({ glyph: str(s.glyph) || 'users', value: str(s.value), label: str(s.label) }))
  const live = (spaceOf(metadata)?.highlights ?? []).filter((h) => h.label && Number.isFinite(h.value)).map((h) => ({ glyph: /event|meet/i.test(h.label) ? 'calendar' : 'users', value: String(h.value), label: h.label }))
  const items = (own.length ? own : live).slice(0, 4)
  if (!items.length) return null
  // The `photo` layout (the About page's figures): a photo beside the numbers, set bare on the page.
  if (p.variant === 'photo') {
    const src = img(p.image)
    return (
      <Band kind="stats" p={p} variant="photo" pad={pad} vis={vis}>
        <Section>
          <div className="nk-split nki-figures" data-solo={src ? undefined : ''}>
            {src && <div className="nki-figures-media nk-photo" data-grade="">{photo(src, str(p.alt))}</div>}
            <dl className="nki-figure-grid">
              {items.map((s, i) => (
                <div key={i}>
                  <dt className="nk-display nk-stat-value">{s.value}</dt>
                  <dd className="nk-stat-label">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </Band>
    )
  }
  return (
    <Band kind="stats" p={p} pad={pad} vis={vis}>
      <div className="nk-section nk-section--stats">
        <div className="nk-grid-cards">
          {items.map((s, i) => (
            <div key={i} className="nk-card nk-stat-tile" data-i={i}>
              <span className="nk-stat-mark"><NkGlyph name={s.glyph} size={20} /></span>
              <b className="nk-display nk-stat-big">{s.value}</b>
              <span className="nk-stat-caption">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Band>
  )
}

// ── Organizer note ──────────────────────────────────────────────────────────────────────────

function NetworkKitNoteBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const hosts = arr(p.hosts).filter((h) => str(h.name))
  return (
    <Band kind="note" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-split nk-note" data-flip={p.flip === true ? '' : undefined}>
          {src && <div className="nk-note-media nk-photo" data-grade="">{photo(src, str(p.alt))}</div>}
          <div>
            {str(p.eyebrow) && <div className="nk-eyebrow">{str(p.eyebrow)}</div>}
            <blockquote className="nk-display nk-note-quote">“<InlineText text={str(p.quote)} />”</blockquote>
            {str(p.lead) && <p className="nk-lead nk-note-lead">{str(p.lead)}</p>}
            {hosts.length > 0 && (
              <div className="nk-hosts">
                {hosts.map((h, i) => {
                  const face = img(h.image)
                  return (
                    <span key={i} className="nk-host">
                      <span className="nk-avatar">{face ? photo(face, '') : initials(str(h.name))}</span>
                      <span><b>{str(h.name)}</b>{str(h.role) && <span>{str(h.role)}</span>}</span>
                    </span>
                  )
                })}
              </div>
            )}
            <div className="nk-after"><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} arrow /></div>
          </div>
        </div>
      </Section>
    </Band>
  )
}

// ── What we stand for ───────────────────────────────────────────────────────────────────────

function NetworkKitPillarsBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const pillars = arr(p.pillars).filter((x) => str(x.title))
  return (
    <Band kind="pillars" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-split">
          {src && <div className="nk-pillars-media nk-photo" data-grade="">{photo(src, str(p.alt))}</div>}
          <Head p={p} metadata={metadata} button={null} />
        </div>
        <div className="nk-grid-cards nk-grid-cards--after">
          {pillars.map((x, i) => (
            <div key={i} className="nk-card nk-pillar">
              <b className="nk-display">{str(x.title)}</b>
              {str(x.body) && <p>{str(x.body)}</p>}
            </div>
          ))}
        </div>
        {str(p.closing) && <p className="nk-pillars-closing">“{str(p.closing)}”</p>}
      </Section>
    </Band>
  )
}

// ── Host here ───────────────────────────────────────────────────────────────────────────────

function NetworkKitRoomsBlock({ p, metadata, pad, vis }: Common) {
  const rooms = arr(p.rooms).filter((r) => str(r.name))
  return (
    <Band kind="rooms" p={p} pad={pad} vis={vis}>
      <Section>
        <Head p={p} metadata={metadata} button={null} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {rooms.map((r, i) => (
            <div key={i} className="nk-card nk-room" data-ink={i === 1 ? '' : undefined}>
              <span className="nk-room-name">{str(r.name)}</span>
              {str(r.price) && <span><b className="nk-display nk-room-price">{str(r.price)}</b>{str(r.unit) && <span className="nk-room-unit"> / {str(r.unit)}</span>}</span>}
              {str(r.blurb) && <p>{str(r.blurb)}</p>}
              <div className="nk-room-foot"><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind={i === 1 ? 'primary' : 'secondary'} metadata={metadata} /></div>
            </div>
          ))}
        </div>
      </Section>
    </Band>
  )
}

// ── Podcast ─────────────────────────────────────────────────────────────────────────────────

function NetworkKitPodcastBlock({ p, metadata, pad, vis }: Common) {
  const episodes = arr(p.episodes).filter((e) => str(e.title))
  return (
    <Band kind="podcast" p={p} pad={pad} vis={vis} className="nk-band--ink">
      <Section>
        <Head p={p} metadata={metadata} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {episodes.map((e, i) => {
            const src = img(e.image)
            return (
              <Tap key={i} to={hrefOf(str(e.href), metadata)} className="nk-episode nk-card--lift">
                <span className="nk-episode-cover nk-photo" data-grade="">
                  {photo(src, '')}
                  <span className="nk-play"><NkGlyph name="play" size={20} /></span>
                </span>
                <span className="nk-episode-body"><b>{str(e.title)}</b>{str(e.meta) && <span>{str(e.meta)}</span>}</span>
              </Tap>
            )
          })}
        </div>
      </Section>
    </Band>
  )
}

// ── Instagram ───────────────────────────────────────────────────────────────────────────────

function NetworkKitSocialBlock({ p, metadata, pad, vis }: Common) {
  const photos = arr(p.photos).map((x) => ({ src: img(x.image), alt: str(x.alt) })).filter((x) => x.src).slice(0, 4)
  const follow = str(p.handle) && str(p.url) ? <Btn label={str(p.handle)} href={str(p.url)} kind="secondary" metadata={metadata} arrow /> : null
  return (
    <Band kind="social" p={p} pad={pad} vis={vis}>
      <Section>
        <Head p={p} metadata={metadata} button={follow} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {photos.map((x, i) => <div key={i} className="nk-social-tile nk-photo" data-grade="">{photo(x.src, x.alt)}</div>)}
        </div>
      </Section>
    </Band>
  )
}

// ── Shop strip ──────────────────────────────────────────────────────────────────────────────

function NetworkKitMerchBlock({ p, metadata, pad, vis }: Common) {
  const products = arr(p.products).filter((x) => str(x.name)).slice(0, 4)
  return (
    <Band kind="merch" p={p} pad={pad} vis={vis}>
      <Section>
        <Head p={p} metadata={metadata} kicker={false} />
        <div className="nk-grid-cards nk-grid-cards--after">
          {products.map((x, i) => {
            const src = img(x.image)
            const to = hrefOf(str(x.href), metadata)
            return (
              <div key={i} className="nk-card nk-merch">
                <Tap to={to} className="nk-merch-cover nk-photo">
                  {src ? photo(src, '') : <span className="nk-tile-icon"><NkGlyph name={str(x.glyph) || 'shop'} size={40} /></span>}
                </Tap>
                <div className="nk-merch-body">
                  <b>{str(x.name)}</b>
                  {str(x.variants) && <span className="nk-row-body">{str(x.variants)}</span>}
                  {str(x.price) && <span className="nk-display nk-merch-price">{str(x.price)}</span>}
                  <div className="nk-push"><Btn label={str(p.buttonLabel) || 'View'} href={str(x.href)} metadata={metadata} size="sm" /></div>
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </Band>
  )
}

// ── Coffee and contact ──────────────────────────────────────────────────────────────────────

function NetworkKitContactBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  const src = img(p.coffeeImage)
  const email = str(p.email) || links?.email || ''
  const phone = str(p.phone)
  const insta = str(p.instagram)
  const row = (glyph: string, node: ReactNode) => <div className="nk-contact-row"><span><NkGlyph name={glyph} size={16} /></span>{node}</div>
  return (
    <Band kind="contact" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-split nk-split--stretch nk-contact">
          <div className="nk-contact-coffee">
            {src && <div className="nk-contact-photo nk-photo" data-grade="">{photo(src, str(p.coffeeAlt))}</div>}
            {str(p.coffeeHand) && <span className="nk-hand">{str(p.coffeeHand)}</span>}
            <h3 className="nk-display nk-display--h3"><InlineText text={str(p.coffeeTitle)} /></h3>
            {str(p.coffeeBody) && <p>{str(p.coffeeBody)}</p>}
            <div><Btn label={str(p.coffeeLabel)} href={str(p.coffeeHref)} metadata={metadata} arrow /></div>
          </div>
          <div className="nk-contact-card">
            <h3 className="nk-display nk-display--h3">{str(p.title)}</h3>
            {str(p.lead) && <p>{str(p.lead)}</p>}
            {email && row('mail', <a href={`mailto:${email}`}>{email}</a>)}
            {phone && row('phone', <a href={`tel:${phone.replace(/[^0-9+() -]/g, '')}`}>{phone}</a>)}
            {insta && row('heart', <span>{insta}</span>)}
            <NetworkKitContactForm slug={links?.slug ?? null} buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
          </div>
        </div>
      </Section>
    </Band>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────

const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap a word in *stars* to set it in the italic.'
const LINK_HINT = 'Start with ~/ for a page of this site, like ~/book.'
const glyph = { type: 'select', label: 'Mark', options: NETWORK_KIT_GLYPH_NAMES.map((v) => ({ label: v, value: v })) } as const
const head = { eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading') }
const action = { actionLabel: text('Button beside the heading'), actionHref: text('Button beside the heading: where it goes', LINK_HINT) }
const flip = { type: 'radio', label: 'Photo side', options: [{ label: 'Right', value: false }, { label: 'Left', value: true }] } as const
const alt = text('Photo description', 'For screen readers.')

export const networkKitMoreComponents: Record<string, ComponentConfig> = {
  NetworkKitFeatured: block('Network featured event (live)', {
    flip, eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'),
    showWhen: { type: 'radio', label: 'Show the Space\'s next event', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT), image, alt,
  }, { ...NETWORK_KIT_FEATURED }, NetworkKitFeaturedBlock),
  NetworkKitVenue: block('Network where and when', {
    flip, ...head,
    facts: { type: 'array', label: 'Facts', arrayFields: { glyph, label: text('Label'), value: text('Words'), note: text('Small line') } },
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT), image, alt,
  }, { ...NETWORK_KIT_VENUE }, NetworkKitVenueBlock),
  NetworkKitCalendar: block('Network events calendar (live)', {
    ...head, ...action, count: countField, empty: area('Line when there are no dates yet'),
    rows: { type: 'array', label: 'Rows', hint: 'Used when the Space has no upcoming events of its own.', arrayFields: { month: text('Month'), day: text('Day'), title: text('Name'), time: text('Time'), where: text('Place'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_CALENDAR }, NetworkKitCalendarBlock),
  NetworkKitChapters: block('Network chapters', {
    ...head, ...action,
    chapters: { type: 'array', label: 'Chapters', arrayFields: { image, name: text('Name'), when: text('When it meets'), where: text('Where'), members: text('Members', 'Real numbers only. Leave empty to show none.'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_CHAPTERS }, NetworkKitChaptersBlock),
  NetworkKitCircles: block('Network circles', {
    ...head,
    circles: { type: 'array', label: 'Circles', arrayFields: { glyph, name: text('Name'), blurb: area('Line under the name'), note: text('Small line'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_CIRCLES }, NetworkKitCirclesBlock),
  NetworkKitStats: block('Network figures (live)', {
    variant: { type: 'select', label: 'Layout', options: [{ label: 'Cards', value: 'tiles' }, { label: 'Photo beside the numbers', value: 'photo' }] },
    image, alt,
    items: { type: 'array', label: 'Figures', hint: 'Real numbers only. With none written, the Space\'s own counts are used, and with none of those the block is left out.', arrayFields: { glyph, value: text('Number'), label: text('What it counts') } },
  }, { ...NETWORK_KIT_STATS }, NetworkKitStatsBlock),
  NetworkKitNote: block('Network organizer note', {
    flip, eyebrow: text('Small label'), quote: area('Quote', VOICE_HINT), lead: area('Line under the quote'),
    hosts: { type: 'array', label: 'Hosts', arrayFields: { image, name: text('Name'), role: text('Role') } },
    buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT), image, alt,
  }, { ...NETWORK_KIT_NOTE }, NetworkKitNoteBlock),
  NetworkKitPillars: block('Network what we stand for', {
    ...head, pillars: { type: 'array', label: 'Pillars', arrayFields: { title: text('Name'), body: area('Words') } },
    closing: area('Closing line'), image, alt,
  }, { ...NETWORK_KIT_PILLARS }, NetworkKitPillarsBlock),
  NetworkKitRooms: block('Network host here', {
    ...head, buttonLabel: text('Button on each card'), buttonHref: text('Button link', LINK_HINT),
    rooms: { type: 'array', label: 'Rooms', arrayFields: { name: text('Name'), price: text('Price'), unit: text('Per', 'Like hour or session.'), blurb: area('Line under the name') } },
  }, { ...NETWORK_KIT_ROOMS }, NetworkKitRoomsBlock),
  NetworkKitPodcast: block('Network podcast', {
    ...head, ...action,
    episodes: { type: 'array', label: 'Episodes', arrayFields: { image, title: text('Name'), meta: text('Small line'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_PODCAST }, NetworkKitPodcastBlock),
  NetworkKitSocial: block('Network Instagram', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), handle: text('Handle', 'Like @yournetwork. The button shows when the link below is set too.'), url: text('Profile link'),
    photos: { type: 'array', label: 'Photos (four)', arrayFields: { image, alt } },
  }, { ...NETWORK_KIT_SOCIAL }, NetworkKitSocialBlock),
  NetworkKitMerch: block('Network shop strip', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), ...action, buttonLabel: text('Button on each card'),
    products: { type: 'array', label: 'Products (four)', arrayFields: { image, glyph, name: text('Name'), variants: text('Small line'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { ...NETWORK_KIT_MERCH }, NetworkKitMerchBlock),
  NetworkKitContact: block('Network coffee and contact', {
    coffeeImage: { ...image, label: 'Coffee card photo' }, coffeeAlt: alt, coffeeHand: text('Handwritten line'), coffeeTitle: area('Coffee card heading', VOICE_HINT), coffeeBody: area('Coffee card words'),
    coffeeLabel: text('Coffee card button'), coffeeHref: text('Coffee card button link', LINK_HINT),
    title: text('Contact heading'), lead: area('Line under the heading'),
    email: text('Email', 'Leave empty to use the Space\'s own.'), phone: text('Phone'), instagram: text('Instagram'), buttonLabel: text('Send button'), successMessage: text('Thank-you line'),
  }, { ...NETWORK_KIT_CONTACT }, NetworkKitContactBlock),
}

/** The thirteen extra blocks, in the design's order (kits.js BLOCKS). Kept apart from the base fourteen so each list stays the one its test pins. */
export const NETWORK_KIT_MORE_CATEGORY_COMPONENTS = Object.keys(networkKitMoreComponents)

