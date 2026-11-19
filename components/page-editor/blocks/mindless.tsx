import type { ReactNode } from 'react'
import { ArrowRight, CalendarDays, Coffee, Flame, Heart, MapPin, Moon, Orbit, Sparkles, Sun, Users, Utensils, Wind, type LucideIcon } from 'lucide-react'
import { InlineText } from '@/components/sites/inline-text'
import { LINK_HINT, area, arr, block, cls, hrefOf, image, img, rel, str, text, type Common, type Props } from './midnight'
import type { ComponentConfig } from '@/lib/page-editor/types'
import {
  MINDLESS_CARRY, MINDLESS_CIRCLES, MINDLESS_CTA, MINDLESS_FAQ, MINDLESS_HERO, MINDLESS_OFFERS, MINDLESS_PAGE_HEAD, MINDLESS_PEOPLE,
  MINDLESS_PILLARS, MINDLESS_SPLIT, MINDLESS_WEEKS,
} from '@/lib/sites/mindless-home'

// ── The Mindless block family (the Mindless design system, ui_kits/website, v13) ───────────────────────────────────
// Every section of the design's website is one block here, in the design's own markup (class names and all), so the design's
// sheet (lib/theme/mindless-kit-css.ts, scoped to [data-house-theme="mindless"]) draws them exactly as the design does. The one
// owner change (2026-11-16): the home hero is the colourful blob pattern with the words on the left and a photo on the right.
// Server Components. Copy fields take *stars* for the one key phrase per headline, which the design paints in the accent.

const VOICE = 'Wrap the key phrase in *stars*: it is painted in the accent.'
const alt = text('Photo description', 'For screen readers.')
const pos = text('Photo focus', 'Where the photo is held when cropped, like 50% 30%.')
const label = { num: text('Label number', 'Two digits, like 02.'), label: text('Small label') }
const head = { ...label, title: area('Heading', VOICE), lead: area('Line under the heading') }
const row = (fields: Record<string, unknown>, summary = 'title') => ({ type: 'array', label: 'Rows', arrayFields: fields, getItemSummary: (it: Props) => str(it[summary]) || str(it.title) || 'Row' }) as const
const btn = (n: string, what = 'Button') => ({ [`${n}Label`]: text(what), [`${n}Href`]: text(`${what}: where it goes`, LINK_HINT) })
const toneField = { type: 'select', label: 'Paint', options: [['accent', 'Accent'], ['pink', 'Pink'], ['blue', 'Blue'], ['violet', 'Violet']].map(([value, l]) => ({ label: l, value })) } as const
const groundField = { type: 'select', label: 'Ground', options: [['', 'Ground'], ['pit', 'Pit (darkest)'], ['raised', 'Raised']].map(([value, l]) => ({ label: l, value })) } as const

const ICONS: Record<string, LucideIcon> = { wind: Wind, utensils: Utensils, users: Users, orbit: Orbit, heart: Heart, sun: Sun, moon: Moon, flame: Flame, coffee: Coffee, pin: MapPin, calendar: CalendarDays, sparkles: Sparkles }
const iconField = { type: 'select', label: 'Icon', options: Object.keys(ICONS).map((v) => ({ label: v, value: v })) } as const
const TONE_CLASS: Record<string, string> = { pink: 'ml-tone--pink', blue: 'ml-tone--blue', violet: 'ml-tone--violet', noise1: 'ml-tone--pink', noise2: 'ml-tone--blue' }
const STICKER_TONES = ['accent', 'noise1', 'noise2', 'violet']

function Btn({ label: l, href, kind = 'primary', size = 'lg', metadata, arrow = false }: { label: string; href: string; kind?: 'primary' | 'ghost' | 'ink'; size?: 'sm' | 'md' | 'lg'; metadata?: Props; arrow?: boolean }) {
  const to = l ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={`ml-btn ml-btn--${kind} ml-btn--${size}`} href={to} {...rel(to)}>
      {l}
      {arrow && <ArrowRight className="ml-icon" width={18} height={18} strokeWidth={2} aria-hidden="true" />}
    </a>
  )
}

/** The section label: torn bone tape with its number in the offset paint. */
function Tape({ p }: { p: Props }) {
  if (!str(p.label)) return null
  return <p className="ml-eyebrow-x ml-eyebrow-x--tape">{str(p.num) && <b>{str(p.num)}</b>}{str(p.label)}</p>
}

function Title({ text: t, as: As = 'h2', className = 'hd hd-lg' }: { text: string; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  if (!t) return null
  return <As className={className}><InlineText text={t} /></As>
}

/** A photo slab. The design draws photos as backgrounds so they crop to the slab. */
function Photo({ src, alt: a, pos: at, className }: { src: string | null; alt: string; pos?: string; className: string }) {
  if (!src) return null
  return <div className={`ph ${className}`} role="img" aria-label={a || undefined} style={{ ['--img' as string]: `url("${src}")`, ['--pos' as string]: at || '50% 50%' }} />
}

function Sec({ p, pad, vis, ground, className, children }: { p: Props; pad?: string; vis?: string; ground?: string; className?: string; children: ReactNode }) {
  const g = str(p.ground) || ground || ''
  return (
    <section className={cls('sec', g && `sec--${g}`, className, pad, vis)}>
      <div className="wrap">{children}</div>
    </section>
  )
}

function SecHead({ p, metadata, center }: { p: Props; metadata?: Props; center?: boolean }) {
  return (
    <header className={cls('sh', center && 'sh--center')}>
      <div className="sh-text">
        <Tape p={p} />
        <Title text={str(p.title)} />
        {str(p.lead) && <p className="lede">{str(p.lead)}</p>}
      </div>
      {str(p.actionLabel) && <div className="sh-act"><Btn label={str(p.actionLabel)} href={str(p.actionHref)} kind="ghost" size="md" metadata={metadata} arrow /></div>}
    </header>
  )
}

// ── Home hero: the blob pattern, words left, photo right ─────────────────────────────────────────────────────────

function Hero({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <section className={cls('hero hero--blob', pad, vis)}>
      <div className="wrap hero-blob-grid">
        <div className="hero-copy">
          <p className="hero-eb">{str(p.eyebrow)}{str(p.sticker) && <span className="hero-stk">{str(p.sticker)}</span>}</p>
          <Title text={str(p.title)} as="h1" className="hd hd-xl" />
          {str(p.lead) && <p className="lede hero-body">{str(p.lead)}</p>}
          <div className="acts">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="ghost" metadata={metadata} />
          </div>
        </div>
        {src && <Photo src={src} alt={str(p.alt)} pos={str(p.pos)} className="ph-tall ph-sticker hero-blob-photo" />}
      </div>
    </section>
  )
}

// ── Inner page header ───────────────────────────────────────────────────────────────────────────────────────────

function PageHead({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <>
      <section className={cls('ph-head', pad, vis)}>
        <div className="wrap ph-head-grid">
          <div>
            {str(p.eyebrow) && <p className="ml-eyebrow-x ml-eyebrow-x--plain">{str(p.eyebrow)}</p>}
            <Title text={str(p.title)} as="h1" className="hd hd-xl" />
            {str(p.lead) && <p className="lede">{str(p.lead)}</p>}
            <div className="acts">
              <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} size="md" metadata={metadata} />
              <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="ghost" size="md" metadata={metadata} />
            </div>
          </div>
          {src && <Photo src={src} alt={str(p.alt)} pos={str(p.pos)} className="ph-tall ph-sticker" />}
        </div>
      </section>
      {p.drip !== false && <div className="ml-divider ml-divider--drip drip-band" role="separator"><span className="ml-drip" /></div>}
    </>
  )
}

// ── The quiet part: photo, then the case in four lines ──────────────────────────────────────────────────────────

function Split({ p, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <Sec p={p} pad={pad} vis={vis} ground="pit">
      <div className="split">
        {src && <Photo src={src} alt={str(p.alt)} pos={str(p.pos)} className="ph-tall ph-sticker" />}
        <div className="split-text">
          <Tape p={p} />
          <Title text={str(p.title)} />
          {str(p.lead) && <p className="lede">{str(p.lead)}</p>}
          {arr(p.rows).length > 0 && (
            <ul className="manifesto">
              {arr(p.rows).map((r, i) => <li key={i}>{str(r.title) && <b>{str(r.title)}</b>} {str(r.body)}</li>)}
            </ul>
          )}
          {str(p.signoff) && <p className="signoff signoff--type">{str(p.signoff)}</p>}
        </div>
      </div>
    </Sec>
  )
}

// ── What we teach: four pillars with icon stickers, then the drills ─────────────────────────────────────────────

function Player({ d, i, metadata }: { d: Props; i: number; metadata?: Props }) {
  const to = hrefOf(str(d.href), metadata)
  const play = <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
  return (
    <section className={`ml-player ml-player--${i === 0 ? 'yellow' : 'raised'}`}>
      <div className="ml-player__top">
        <div>
          {str(d.label) && <p className="ml-eyebrow">{str(d.label)}</p>}
          <h3 className="ml-player__title">{str(d.title)}</h3>
          {str(d.guide) && <p className="ml-player__guide">{str(d.guide)}</p>}
        </div>
        {to ? <a className="ml-player__play" href={to} aria-label={`Play ${str(d.title)}`} {...rel(to)}>{play}</a> : <span className="ml-player__play" aria-hidden="true">{play}</span>}
      </div>
      <div className="ml-player__bar" aria-hidden="true"><span style={{ width: '0%' }} /></div>
      <div className="ml-player__times"><span>0:00</span><span>{str(d.length)}</span></div>
    </section>
  )
}

function Pillars({ p, metadata, pad, vis }: Common) {
  const drills = arr(p.drills)
  return (
    <Sec p={p} pad={pad} vis={vis}>
      <SecHead p={p} metadata={metadata} />
      <div className="pillars ml-rotate">
        {arr(p.rows).map((r, i) => {
          const I = ICONS[str(r.icon)] ?? Sparkles
          return (
            <article key={i} className="pillar">
              <span className={`ml-icon-sticker ml-tone--${STICKER_TONES[i % 4]}`} aria-hidden="true"><I className="ml-icon" width={22} height={22} strokeWidth={2} /></span>
              <h3 className="h-sm">{str(r.title)}</h3>
              <p>{str(r.body)}</p>
            </article>
          )
        })}
      </div>
      {drills.length > 0 && (
        <div className="drills">
          <div className="drills-text">
            <Title text={str(p.drillsTitle)} as="h3" className="hd hd-md" />
            {str(p.drillsLead) && <p className="muted">{str(p.drillsLead)}</p>}
          </div>
          {drills.slice(0, 2).map((d, i) => <Player key={i} d={d} i={i} metadata={metadata} />)}
        </div>
      )}
    </Sec>
  )
}

// ── The eight weeks ─────────────────────────────────────────────────────────────────────────────────────────────

function Weeks({ p, metadata, pad, vis }: Common) {
  return (
    <Sec p={p} pad={pad} vis={vis}>
      <SecHead p={p} metadata={metadata} />
      <div className="pweeks ml-rotate">
        {arr(p.rows).map((r, i) => (
          <article key={i} className="pweek">
            <span className="pweek-n">{i + 1}</span>
            <div><h3 className="h-sm">{str(r.title)}</h3>{str(r.body) && <p className="muted">{str(r.body)}</p>}</div>
          </article>
        ))}
      </div>
    </Sec>
  )
}

// ── This week: circle cards with drip dates, then the live sits ─────────────────────────────────────────────────

function Circles({ p, metadata, pad, vis }: Common) {
  const live = arr(p.live)
  return (
    <Sec p={p} pad={pad} vis={vis}>
      <SecHead p={p} metadata={metadata} />
      <div className="circles">
        {arr(p.rows).map((r, i) => (
          <article key={i} className={cls('ml-circle', TONE_CLASS[str(r.tone)])}>
            <div className={cls('ml-circle__date', !str(r.day) && 'ml-circle__date--word')}><span className="ml-circle__month">{str(r.month)}</span>{str(r.day) && <span className="ml-circle__day">{str(r.day)}</span>}</div>
            <div className="ml-circle__main">
              {str(r.host) && <p className="ml-eyebrow">{str(r.host)}</p>}
              <h3 className="ml-circle__title">{str(r.title)}</h3>
              {str(r.meta) && <p className="ml-circle__meta">{str(r.meta)}</p>}
              <div className="ml-circle__foot">
                <span className="ml-circle__spots">{str(r.spots)}</span>
                <Btn label={str(r.buttonLabel)} href={str(r.href)} size="sm" metadata={metadata} />
              </div>
            </div>
          </article>
        ))}
      </div>
      {live.length > 0 && (
        <div className="live">
          <div className="live-head">
            {str(p.liveLabel) && <p className="ml-eyebrow-x ml-eyebrow-x--plain">{str(p.liveLabel)}</p>}
            <Title text={str(p.liveTitle)} as="h3" className="hd hd-md" />
            {str(p.liveLead) && <p className="muted">{str(p.liveLead)}</p>}
          </div>
          <div className="tickets">
            {live.map((t, i) => (
              <article key={i} className={cls('ml-ticket', i === 0 ? 'is-lit' : TONE_CLASS[i % 2 ? 'pink' : 'blue'])}>
                <div className={cls('ml-ticket__stub', !str(t.time) && 'ml-ticket__stub--word')}><span className="ml-ticket__day">{str(t.day)}</span>{str(t.time) && <span className="ml-ticket__date">{str(t.time)}<small>{str(t.ampm)}</small></span>}</div>
                <div className="ml-ticket__main">
                  <div>
                    {str(t.badge) && <span className={cls('ml-badge', i === 0 ? 'ml-badge--sticker ml-badge--accent' : 'ml-badge--outline ml-badge--bone')}>{str(t.badge)}</span>}
                    <h3 className="ml-ticket__title">{str(t.title)}</h3>
                    {str(t.body) && <p className="ml-ticket__body">{str(t.body)}</p>}
                  </div>
                  <div className="ml-ticket__action"><Btn label={str(t.buttonLabel)} href={str(t.href)} kind={i === 0 ? 'primary' : 'ghost'} size="sm" metadata={metadata} /></div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Sec>
  )
}

// ── Real people: the photo mosaic and the quote stickers ────────────────────────────────────────────────────────

const QUOTE_TONES = ['bone', 'accent', 'blue', 'pink']
const QUOTE_TILT = [-1.5, 1, -0.5, 1.5]

function People({ p, metadata, pad, vis }: Common) {
  const photos = arr(p.photos).slice(0, 4)
  return (
    <Sec p={p} pad={pad} vis={vis} className="sec--people">
      <SecHead p={p} metadata={metadata} />
      {photos.length > 0 && (
        <div className="gallery">
          {photos.map((ph, i) => <Photo key={i} src={img(ph.image)} alt={str(ph.alt)} pos={str(ph.pos)} className={`g-${'abcd'[i]}`} />)}
        </div>
      )}
      {arr(p.quotes).length > 0 && (
        <div className="overheard">
          {arr(p.quotes).slice(0, 4).map((q, i) => (
            <figure key={i} className={`ml-review ml-review--${QUOTE_TONES[i % 4]}`} style={{ transform: `rotate(${QUOTE_TILT[i % 4]}deg)` }}>
              <span className="ml-review__mark" aria-hidden="true">“</span>
              <blockquote>{str(q.quote)}</blockquote>
              <figcaption><b>{str(q.name)}</b>{str(q.where) && <span>{str(q.where)}</span>}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </Sec>
  )
}

// ── Carry it: host or guide, a photo, and the guides ────────────────────────────────────────────────────────────

function Offer({ o, i, metadata, featured }: { o: Props; i: number; metadata?: Props; featured?: boolean }) {
  return (
    <article className={cls('ml-offer', featured ? 'is-featured' : TONE_CLASS[str(o.tone)])}>
      {featured && str(o.badge) && <span className="ml-badge ml-badge--sticker ml-badge--bone ml-badge--lg ml-offer__badge">{str(o.badge)}</span>}
      <div className="ml-offer__body">
        <span className="ml-offer__index">{String(i + 1).padStart(2, '0')}</span>
        <h3 className="ml-offer__title">{str(o.title)}</h3>
        {str(o.body) && <p className="ml-offer__text">{str(o.body)}</p>}
        <div className="ml-offer__foot">
          {str(o.price) && <span className="ml-offer__price">{str(o.price)}</span>}
          <Btn label={str(o.buttonLabel)} href={str(o.href)} kind={featured ? 'ink' : 'ghost'} size="sm" metadata={metadata} />
        </div>
      </div>
    </article>
  )
}

function Carry({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const guides = arr(p.guides)
  return (
    <Sec p={p} pad={pad} vis={vis} ground="pit">
      <div className="carry">
        <div className="carry-text">
          <Tape p={p} />
          <Title text={str(p.title)} />
          {str(p.lead) && <p className="lede">{str(p.lead)}</p>}
          <div className="carry-offers">{arr(p.offers).slice(0, 2).map((o, i) => <Offer key={i} o={{ ...o, tone: o.tone || (i ? 'blue' : 'pink') }} i={i} metadata={metadata} />)}</div>
        </div>
        {src && <Photo src={src} alt={str(p.alt)} pos={str(p.pos)} className="ph-tall ph-sticker ph--guide" />}
      </div>
      {guides.length > 0 && (
        <div className="guides">
          {guides.map((g, i) => {
            const initials = str(g.name).split(/\s+/).map((w) => w[0] ?? '').join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
            const photo = img(g.image)
            return (
              <article key={i} className="guide">
                {photo ? <span className={`guide-av guide-av--${i % 3} guide-av--photo`} style={{ backgroundImage: `url("${photo}")` }} aria-hidden="true" /> : <span className={`guide-av guide-av--${i % 3}`} aria-hidden="true">{initials}</span>}
                <div>{str(g.where) && <p className="ml-eyebrow">{str(g.where)}</p>}<h3 className="h-sm">{str(g.name)}</h3>{str(g.body) && <p className="muted">{str(g.body)}</p>}</div>
              </article>
            )
          })}
        </div>
      )}
    </Sec>
  )
}

// ── Ways in: the doors, one featured ────────────────────────────────────────────────────────────────────────────

function Offers({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows)
  const feature = Number(p.featured ?? 2) - 1
  return (
    <Sec p={p} pad={pad} vis={vis}>
      <SecHead p={p} metadata={metadata} />
      <div className="offers">{rows.map((o, i) => <Offer key={i} o={{ ...o, tone: o.tone || ['blue', '', 'pink', 'violet'][i % 4] }} i={i} metadata={metadata} featured={i === feature} />)}</div>
      {str(p.note) && <aside className="ml-card ml-card--note safety"><p className="ml-eyebrow">{str(p.noteLabel) || 'Real talk'}</p><div className="ml-card__body"><p>{str(p.note)}</p></div></aside>}
    </Sec>
  )
}

// ── Fair questions ──────────────────────────────────────────────────────────────────────────────────────────────

function Faq({ p, pad, vis }: Common) {
  return (
    <Sec p={p} pad={pad} vis={vis}>
      <div className="faq">
        <div>
          <Tape p={p} />
          <Title text={str(p.title)} />
          {str(p.lead) && <p className="muted faq-lead">{str(p.lead)}</p>}
        </div>
        <div className="ml-accordion">
          {arr(p.rows).map((r, i) => (
            <details key={i} className="ml-accordion__item" open={i === 0}>
              <summary className="ml-accordion__q"><span>{str(r.question)}</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-icon ml-accordion__icon"><path d="M5 12h14" /><path d="M12 5v14" /></svg></summary>
              <div className="ml-accordion__a">{str(r.answer)}</div>
            </details>
          ))}
        </div>
      </div>
    </Sec>
  )
}

// ── One breath: the closing call ────────────────────────────────────────────────────────────────────────────────

function Cta({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <Sec p={p} pad={pad} vis={vis} className="cta2">
      <div className="cta2-grid">
        <div className="cta2-text">
          <h2 className="hd hd-lg cta2-hd"><span>{str(p.title)}</span>{str(p.em) && <span className="cta2-em">{str(p.em)}</span>}</h2>
          {str(p.lead) && <p className="lede">{str(p.lead)}</p>}
          <div className="acts">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="ghost" metadata={metadata} />
          </div>
        </div>
        {src ? <div className="cta2-photo" role="img" aria-label={str(p.alt) || undefined} style={{ background: `url("${src}") ${str(p.pos) || '50% 55%'} / cover no-repeat, var(--neutral-ground)` }} /> : <div className="cta2-photo" aria-hidden="true" />}
      </div>
    </Sec>
  )
}

// ── Registration ────────────────────────────────────────────────────────────────────────────────────────────────

const photoRow = { image, alt, pos }

export const mindlessBlocks: Record<string, ComponentConfig> = {
  MindlessHero: block('Mindless hero (blob)', {
    eyebrow: text('Small label'), sticker: text('Sticker beside the label'), title: area('Heading', VOICE), lead: area('Intro'),
    ...btn('primary', 'Main button'), ...btn('secondary', 'Second button'), image, alt, pos,
  }, MINDLESS_HERO, Hero),
  MindlessPageHead: block('Mindless page header', {
    eyebrow: text('Small label'), title: area('Heading', VOICE), lead: area('Intro'), ...btn('primary', 'Main button'), ...btn('secondary', 'Second button'),
    image, alt, pos, drip: { type: 'radio', label: 'Drip band under it', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
  }, MINDLESS_PAGE_HEAD, PageHead),
  MindlessSplit: block('Mindless photo and statement', {
    ground: groundField, ...head, image, alt, pos, rows: row({ title: text('Bold start'), body: text('The rest of the line') }), signoff: text('Sign-off in the drip'),
  }, MINDLESS_SPLIT, Split),
  MindlessPillars: block('Mindless what we teach', {
    ground: groundField, ...head, ...btn('action', 'Button beside the heading'), rows: row({ icon: iconField, title: text('Title'), body: area('Line') }),
    drillsTitle: text('Drills heading', VOICE), drillsLead: text('Drills line'),
    drills: { ...row({ label: text('Small label'), title: text('Title'), guide: text('With'), length: text('Length', 'Like 1:00.'), href: text('Link', LINK_HINT) }), label: 'Drills' },
  }, MINDLESS_PILLARS, Pillars),
  MindlessWeeks: block('Mindless weeks', {
    ground: groundField, ...head, rows: row({ title: text('Title'), body: text('Line') }),
  }, MINDLESS_WEEKS, Weeks),
  MindlessCircles: block('Mindless circles and live sits', {
    ground: groundField, ...head, ...btn('action', 'Button beside the heading'),
    rows: { ...row({ month: text('Month or day word', 'Like Dec, or Weekly.'), day: text('Big date', 'Like 4, or Thu.'), host: text('Small label'), title: text('Name'), meta: text('When and where'), spots: text('Line in the corner'), buttonLabel: text('Button'), href: text('Button: where it goes', LINK_HINT), tone: toneField }), label: 'Circles' },
    liveLabel: text('Live: small label'), liveTitle: text('Live: heading', VOICE), liveLead: text('Live: line'),
    live: { ...row({ day: text('Day', 'Like Sun.'), time: text('Hour', 'Like 8.'), ampm: text('am or pm'), badge: text('Badge'), title: text('Title'), body: text('Line'), buttonLabel: text('Button'), href: text('Button: where it goes', LINK_HINT) }), label: 'Live sits' },
  }, MINDLESS_CIRCLES, Circles),
  MindlessPeople: block('Mindless real people', {
    ground: groundField, ...head, photos: { ...row(photoRow, 'alt'), label: 'Four photos' },
    quotes: { ...row({ quote: area('Quote'), name: text('Name'), where: text('Where from') }, 'name'), label: 'Quotes' },
  }, MINDLESS_PEOPLE, People),
  MindlessCarry: block('Mindless start a circle', {
    ground: groundField, ...head, image, alt, pos,
    offers: { ...row({ title: text('Title'), body: text('Line'), price: text('Price'), buttonLabel: text('Button'), href: text('Button: where it goes', LINK_HINT), tone: toneField }), label: 'Two ways in' },
    guides: { ...row({ name: text('Name'), where: text('Small label'), body: text('Line'), image }, 'name'), label: 'Guides' },
  }, MINDLESS_CARRY, Carry),
  MindlessOffers: block('Mindless ways in', {
    ground: groundField, ...head, ...btn('action', 'Button beside the heading'),
    rows: row({ title: text('Title'), body: text('Line'), price: text('Price'), badge: text('Badge (featured only)'), buttonLabel: text('Button'), href: text('Button: where it goes', LINK_HINT), tone: toneField }),
    featured: { type: 'number', label: 'Featured door', min: 0, max: 6 }, noteLabel: text('Note label'), note: area('Note under the doors'),
  }, MINDLESS_OFFERS, Offers),
  MindlessFaq: block('Mindless questions', {
    ground: groundField, ...head, rows: row({ question: text('Question'), answer: area('Answer') }, 'question'),
  }, MINDLESS_FAQ, Faq),
  MindlessCta: block('Mindless closing call', {
    ground: groundField, title: text('Heading'), em: text('Second line, in the accent'), lead: text('Line'), ...btn('primary', 'Main button'), ...btn('secondary', 'Second button'), image, alt, pos,
  }, MINDLESS_CTA, Cta),
}
