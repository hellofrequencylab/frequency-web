import type { ComponentConfig } from '@/lib/page-editor/types'
import { storedWallClock } from '@/lib/sites/site-events'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { InlineText } from '@/components/sites/inline-text'
import { MidnightArchive } from '@/components/sites/midnight-archive'
import { MidnightContactForm } from '@/components/sites/midnight-contact-form'
import { MIDNIGHT_GLYPH_NAMES, MidnightGlyph, MidnightGlyphSeal } from '@/components/sites/midnight-glyph'
import { MidnightLetterForm } from '@/components/sites/midnight-letter-form'
import { Arch, Btn, Head, LINK_HINT, VOICE_HINT, action, area, arr, block, cls, head, hrefOf, image, img, rel, str, text, type Common, type Props } from './midnight'

// ── The Midnight practice sections (House of Fates design, the Hypnotist kit, 2026-10) ────────────────────────
// What a one-person practice needs beyond the Midnight Home: an inner-page hero with a photo, a jump bar, a
// welcome with the logo, a host portrait, four pillars, a modality section with its priced options, a custom-
// recording panel, a recording grid, a four-week program with what it includes, event rows, a closing band, the
// letter archive and a contact page split over a photo. Same rules as the Home family (./midnight.tsx): Server
// Components except the two forms, copy resolves saved content > kit copy > block default, `~/page` is a page of
// this Space's site, and every look is the Midnight skin's (components/sites/midnight-practice-css.ts), tokens only.
// A block that takes a photo can wear the soft colour tone (`tone: soft`); Midnight's black and white is the default.

const glyph = { type: 'select', label: 'Symbol', options: MIDNIGHT_GLYPH_NAMES.map((v) => ({ label: v, value: v })) } as const
const tone = { type: 'select', label: 'Photo tone', options: [{ label: 'Black and white', value: 'mono' }, { label: 'Soft colour', value: 'soft' }] } as const
const LINES_HINT = 'One per line.'
const PARA_HINT = 'A blank line starts a new paragraph.'

/** Paragraphs from a textarea: a blank line between them. */
const paras = (v: unknown) => str(v).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
const lines = (v: unknown) => str(v).split('\n').map((x) => x.trim()).filter(Boolean)
const soft = (v: unknown) => str(v) === 'soft'
/** A CSS anchor id: letters, digits and hyphens only, so a typo cannot break the page. */
const anchor = (v: unknown) => (/^[a-z][a-z0-9-]{0,40}$/i.test(str(v)) ? str(v) : undefined)

// ── Page hero ──────────────────────────────────────────────────────────────────────────────

function MidnightPageHeroBlock({ p, pad, vis }: Common) {
  const src = img(p.image)
  const pos = /^[a-z0-9% .-]{1,30}$/i.test(str(p.pos)) ? str(p.pos) : ''
  const minHeight = Math.max(280, Math.min(720, Number(p.height) || 460))
  return (
    <section data-mn="pagehero" className={cls('mn-pagehero mn-grain', pad, vis)} style={{ minHeight }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="mn-pagehero-photo" src={src} alt={str(p.alt)} style={pos ? { objectPosition: pos } : undefined} />
      )}
      <div className="mn-protect" aria-hidden="true" />
      <div className="mn-mist mn-mist--low" aria-hidden="true" />
      <div className="mn-smoke" aria-hidden="true" />
      <div className="mn-pagehero-copy">
        {str(p.eyebrow) && <div className="mn-eyebrow">{str(p.eyebrow)}</div>}
        <h1 className="mn-display mn-display--h1">
          <InlineText text={str(p.title)} />
        </h1>
        {str(p.lead) && <p className="mn-lead mn-pagehero-lead">{str(p.lead)}</p>}
      </div>
    </section>
  )
}

// ── Jump bar ───────────────────────────────────────────────────────────────────────────────

function MidnightJumpBlock({ p, metadata, pad, vis }: Common) {
  const items = arr(p.items).filter((i) => str(i.label))
  return (
    <nav data-mn="jump" aria-label="On this page" className={cls('mn-jump', pad, vis)}>
      {items.map((it, i) => {
        const to = hrefOf(str(it.href), metadata)
        return to ? (
          <a key={i} className="mn-jump-item" href={to}>
            {str(it.label)}
            <span className="mn-accent-ink"><MidnightGlyph name="arrow-down" size={14} /></span>
          </a>
        ) : null
      })}
    </nav>
  )
}

// ── Welcome ────────────────────────────────────────────────────────────────────────────────

function MidnightWelcomeBlock({ p, metadata, pad, vis }: Common) {
  const logo = img(p.logo)
  const photo = img(p.image)
  return (
    <section data-mn="welcome" className={cls('mn-section', pad, vis)}>
      <div className="mn-welcome-head">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- owner logo on an arbitrary host
          <img className="mn-welcome-logo" src={logo} alt={str(p.logoAlt)} />
        )}
        {str(p.eyebrow) && <div className="mn-eyebrow">{str(p.eyebrow)}</div>}
        <h2 className="mn-display mn-display--h2"><InlineText text={str(p.title)} /></h2>
        {str(p.lead) && <p className="mn-prose mn-prose--lead">{str(p.lead)}</p>}
      </div>
      <div className="mn-ornament mn-ornament--wide" role="separator"><span /><i aria-hidden="true">✦</i><span /></div>
      <div className="mn-pair">
        <Arch src={photo} alt={str(p.alt)} ratio="portrait" soft={soft(p.tone)} />
        <div className="mn-pair-copy">
          <h3 className="mn-display mn-display--h3"><InlineText text={str(p.heading)} /></h3>
          {paras(p.body).map((t, i) => <p key={i} className="mn-prose">{t}</p>)}
          <div><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} size="lg" /></div>
        </div>
      </div>
    </section>
  )
}

// ── Host ───────────────────────────────────────────────────────────────────────────────────

function MidnightHostBlock({ p, metadata, pad, vis }: Common) {
  const paragraphs = paras(p.body)
  return (
    <section data-mn="host" className={cls('mn-section mn-pair mn-host', pad, vis)}>
      <div className="mn-pair-copy">
        {str(p.eyebrow) && <div className="mn-eyebrow">{str(p.eyebrow)}</div>}
        <h2 className="mn-display mn-display--h2"><InlineText text={str(p.title)} /></h2>
        {paragraphs.map((t, i) => <p key={i} className={cls('mn-prose', i === 0 && 'mn-prose--strong')}>{t}</p>)}
        <div className="mn-actions mn-actions--tight">
          <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} />
          <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} />
        </div>
      </div>
      <Arch src={img(p.image)} alt={str(p.alt)} ratio="portrait" soft={soft(p.tone)} caption={str(p.caption)} />
    </section>
  )
}

// ── Pillars ────────────────────────────────────────────────────────────────────────────────

function MidnightPillarsBlock({ p, metadata, pad, vis }: Common) {
  const pillars = arr(p.pillars).filter((x) => str(x.title))
  return (
    <section data-mn="pillars" className={cls('mn-section mn-pillars mn-grain', pad, vis)}>
      <div className="mn-mist mn-mist--veil" aria-hidden="true" />
      <div className="mn-pillars-inner">
        <Head p={p} metadata={metadata} />
        <div className="mn-pillars-grid">
          {pillars.map((x, i) => (
            <div key={i} className="mn-pillar">
              <MidnightGlyphSeal name={str(x.sigil) || 'star'} size={56} tone="accent" />
              <div className="mn-display mn-display--sm">{str(x.title)}</div>
              <p className="mn-muted mn-body-sm">{str(x.body)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Services: one modality, with its priced options ───────────────────────────────────────

function MidnightServiceBlock({ p, metadata, pad, vis }: Common) {
  const options = arr(p.options).filter((o) => str(o.name))
  const flip = str(p.side) === 'right'
  const panel = !!str(p.panelTitle)
  return (
    <section id={anchor(p.anchor)} data-mn="service" data-tone={soft(p.tone) ? 'soft' : undefined} className={cls('mn-service', flip && 'mn-service--flip', pad, vis)}>
      <div className="mn-service-photo">
        {img(p.image) && (
          // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
          <img src={img(p.image) ?? ''} alt={str(p.alt)} loading="lazy" />
        )}
        <div className="mn-vignette" aria-hidden="true" />
      </div>
      <div className="mn-service-copy">
        <MidnightGlyphSeal name={str(p.sigil) || 'moon-full'} size={64} />
        <div className="mn-eyebrow">
          {str(p.numeral) && <span className="mn-numeral">{str(p.numeral)}</span>}
          {str(p.label)}
        </div>
        <h2 className="mn-display mn-display--h2">{str(p.title)}</h2>
        <p className="mn-prose">{str(p.body)}</p>
        {str(p.pull) && <p className="mn-display mn-pull"><em>{str(p.pull)}</em></p>}
        {str(p.note) && <div><span className="mn-badge mn-badge--accent">{str(p.note)}</span></div>}
        {options.length > 0 && (
          <div className="mn-options">
            {options.map((o, i) => (
              <div key={i} className="mn-option">
                <div>
                  <div className="mn-option-line">
                    <span className="mn-display mn-display--sm">{str(o.name)}</span>
                    {str(o.meta) && <span className="mn-eyebrow mn-eyebrow--block">{str(o.meta)}</span>}
                  </div>
                  {str(o.text) && <p className="mn-muted mn-body-sm mn-option-text">{str(o.text)}</p>}
                </div>
                <div className="mn-option-end">
                  <span className="mn-display mn-price">{str(o.price)}</span>
                  <Btn label={str(o.buttonLabel)} href={str(o.href)} metadata={metadata} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
        {panel && (
          <div className="mn-panel-slot">
            <RecordingPanel p={{ sigil: p.panelSigil, meta: p.panelMeta, title: p.panelTitle, body: p.panelBody, buttonLabel: p.panelButtonLabel, buttonHref: p.panelButtonHref, price: p.panelPrice }} metadata={metadata} />
          </div>
        )}
      </div>
    </section>
  )
}

/** The custom-recording panel (design CustomRecording): a framed row with a seal, the words and the one button. */
function RecordingPanel({ p, metadata }: { p: Props; metadata?: Props }) {
  return (
    <div className="mn-panel">
      <div className="mn-panel-head">
        <MidnightGlyphSeal name={str(p.sigil) || 'mic'} size={64} tone="accent" />
        <div>
          {str(p.meta) && <div className="mn-eyebrow">{str(p.meta)}</div>}
          <h3 className="mn-display mn-display--h3 mn-panel-title"><InlineText text={str(p.title)} /></h3>
        </div>
      </div>
      <div className="mn-panel-body">
        <p className="mn-muted mn-body-sm mn-panel-text">{str(p.body)}</p>
        <div className="mn-panel-buy">
          <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} />
          {str(p.price) && <span className="mn-display mn-price">{str(p.price)}</span>}
        </div>
      </div>
    </div>
  )
}

function MidnightCustomRecordingBlock({ p, metadata, pad, vis }: Common) {
  return (
    <section data-mn="recording" className={cls('mn-section mn-section--tight', pad, vis)}>
      <RecordingPanel p={p} metadata={metadata} />
    </section>
  )
}

// ── Recording grid ─────────────────────────────────────────────────────────────────────────

function MidnightRecordingsBlock({ p, metadata, pad, vis }: Common) {
  const count = Math.max(1, Math.min(24, Number(p.count) || 24))
  const items = arr(p.items).filter((r) => str(r.title)).slice(0, count)
  return (
    <section id={anchor(p.anchor)} data-mn="recordings" className={cls('mn-section', pad, vis)}>
      <Head p={p} metadata={metadata} />
      <div className="mn-recs">
        {items.map((r, i) => (
          <article key={i} className="mn-rec">
            <div className="mn-rec-top">
              <MidnightGlyphSeal name={str(r.sigil) || 'moon-quarter'} size={52} />
              <span className="mn-display mn-price mn-price--lg">{str(r.price)}</span>
            </div>
            <h3 className="mn-display mn-rec-title">{str(r.title)}</h3>
            <p className="mn-muted mn-body-sm">{str(r.blurb)}</p>
            <ul className="mn-points">
              {lines(r.points).map((pt) => (
                <li key={pt}><span className="mn-accent-ink"><MidnightGlyph name="star" size={12} /></span>{pt}</li>
              ))}
            </ul>
            <div className="mn-rec-foot">
              <Btn label={str(r.buttonLabel)} href={str(r.href)} metadata={metadata} />
              {str(p.note) && <span className="mn-eyebrow">{str(p.note)}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ── Program: one four-week program ─────────────────────────────────────────────────────────

function MidnightProgramBlock({ p, metadata, pad, vis }: Common) {
  const includes = arr(p.includes).filter((x) => str(x.title))
  return (
    <section id={anchor(p.anchor)} data-mn="program" className={cls('mn-section mn-program', pad, vis)}>
      <div className="mn-program-head">
        <div className="mn-pair-copy">
          <div className="mn-eyebrow">{str(p.tagA)} {str(p.tagB) && <span className="mn-accent-ink mn-tag-b">{str(p.tagB)}</span>}</div>
          <h2 className="mn-display mn-display--h2">{str(p.title)}</h2>
          <div className="mn-badges">
            {lines(p.badges).map((b) => <span key={b} className="mn-badge">{b}</span>)}
            {str(p.flag) && <span className="mn-badge mn-badge--accent">{str(p.flag)}</span>}
          </div>
          {paras(p.body).map((t, i) => <p key={i} className="mn-prose">{t}</p>)}
        </div>
        <Arch src={img(p.image)} alt={str(p.alt)} ratio="portrait" soft={soft(p.tone)} />
      </div>
      {includes.length > 0 && (
        <div className="mn-includes">
          {includes.map((x, i) => (
            <div key={i} className="mn-include">
              <span className="mn-accent-ink"><MidnightGlyph name={str(x.sigil) || 'star'} size={22} /></span>
              <div className="mn-display mn-display--xs">{str(x.title)}</div>
              <p className="mn-muted mn-small">{str(x.body)}</p>
            </div>
          ))}
        </div>
      )}
      {str(p.addonBody) && (
        <div className="mn-addon">
          <MidnightGlyphSeal name="saturn" size={48} tone="accent" />
          <div>
            <div className="mn-eyebrow">{str(p.addonLabel)}</div>
            <p className="mn-addon-text">{str(p.addonBody)}</p>
          </div>
        </div>
      )}
      <div className="mn-program-actions">
        <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} metadata={metadata} size="lg" />
        <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="secondary" metadata={metadata} size="lg" />
        {str(p.note) && <span className="mn-subtle mn-small">{str(p.note)}</span>}
      </div>
    </section>
  )
}

// ── Statement: a centred paragraph under an ornament ──────────────────────────────────────

function MidnightStatementBlock({ p, pad, vis }: Common) {
  return (
    <section data-mn="statement" className={cls('mn-section mn-statement', pad, vis)}>
      <div className="mn-ornament mn-ornament--wide" role="separator">
        <span />
        <i aria-hidden="true">✦</i>
        {str(p.label) && <b className="mn-eyebrow">{str(p.label)}</b>}
        <span />
      </div>
      <p className="mn-prose mn-prose--statement">{str(p.body)}</p>
    </section>
  )
}

// ── Event rows ─────────────────────────────────────────────────────────────────────────────

interface EventRow { id: string; slug?: string; title: string; startsAt: string; location?: string | null; priceLabel?: string | null; isCancelled?: boolean; summary?: string | null }
const isRow = (e: unknown): e is EventRow => !!e && typeof (e as EventRow).id === 'string' && typeof (e as EventRow).title === 'string' && typeof (e as EventRow).startsAt === 'string'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (d: Date) => `${d.getUTCHours() % 12 || 12}${d.getUTCMinutes() ? `:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''}${d.getUTCHours() < 12 ? 'am' : 'pm'}`

function MidnightEventRowsBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const count = Math.max(1, Math.min(24, Number(p.count) || 12))
  const raw = (metadata?.space as { events?: unknown } | undefined)?.events
  const today = now.toISOString().slice(0, 10)
  const live = (Array.isArray(raw) ? raw : []).filter(isRow).filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, count)
  const links = metadata?.links as SiteLinkMap | undefined
  const rows = live.length
    ? live.map((e) => {
        const d = storedWallClock(e.startsAt)
        const href = e.slug && links ? (siteLocalHref(`${links.origin}/events/${e.slug}`, links)?.href ?? `${links.origin}/events/${e.slug}`) : ''
        return {
          month: d ? MONTHS[d.getUTCMonth()] : '',
          day: d ? String(d.getUTCDate()) : '',
          badge: e.location ?? '',
          left: '',
          title: e.title,
          summary: e.summary ?? '',
          when: d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${clock(d)}${str(p.zone) ? ` ${str(p.zone)}` : ''}` : '',
          format: '',
          price: e.priceLabel ?? '',
          href,
        }
      })
    : arr(p.rows).slice(0, count).map((r) => ({ month: str(r.month), day: str(r.day), badge: str(r.badge), left: str(r.left), title: str(r.title), summary: str(r.summary), when: str(r.when), format: str(r.format), price: str(r.price), href: str(r.href) }))
  return (
    <section data-mn="eventrows" className={cls('mn-section', pad, vis)}>
      {rows.length === 0 ? (
        <p className="mn-muted mn-prose">{str(p.empty)}</p>
      ) : (
        <div className="mn-erows">
          {rows.filter((r) => r.title).map((r, i) => {
            const to = r.href ? hrefOf(r.href, metadata) : null
            return (
              <div key={i} className="mn-erow">
                <div className="mn-stamp mn-stamp--lg"><b>{r.month}</b><span>{r.day}</span></div>
                <div className="mn-erow-main">
                  {(r.badge || r.left) && (
                    <div className="mn-badges">
                      {r.badge && <span className="mn-badge mn-badge--accent">{r.badge}</span>}
                      {r.left && <span className="mn-badge">{r.left}</span>}
                    </div>
                  )}
                  <h2 className="mn-display mn-erow-title">{r.title}</h2>
                  {r.summary && <p className="mn-muted mn-body-sm">{r.summary}</p>}
                  {(r.when || r.format) && (
                    <div className="mn-erow-meta">
                      {r.when && <span><MidnightGlyph name="clock" size={14} />{r.when}</span>}
                      {r.format && <span><MidnightGlyph name="headphones" size={14} />{r.format}</span>}
                    </div>
                  )}
                </div>
                <div className="mn-erow-end">
                  {r.price && <span className="mn-display mn-price">{r.price}</span>}
                  {to && <a className="hs-btn hs-btn-primary" href={to} {...rel(to)}>{str(p.buttonLabel) || 'Reserve'}</a>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Band: the closing call as a bone band ──────────────────────────────────────────────────

function MidnightBandBlock({ p, metadata, pad, vis }: Common) {
  return (
    <section data-mn="band" className={cls('mn-band', pad, vis)}>
      <h2 className="mn-display mn-display--h2"><InlineText text={str(p.title)} /></h2>
      <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} metadata={metadata} size="lg" />
    </section>
  )
}

// ── Letter sign-up band and archive ───────────────────────────────────────────────────────

function MidnightSignupBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  return (
    <section data-mn="signup" className={cls('mn-section mn-letter mn-letter--band', pad, vis)}>
      <div className="mn-letter-copy">
        <MidnightGlyphSeal name="mail" size={64} tone="accent" />
        <div className="mn-display mn-display--h3"><InlineText text={str(p.title)} /></div>
      </div>
      <MidnightLetterForm slug={links?.slug ?? null} askName placeholder="" buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />
    </section>
  )
}

function MidnightArchiveBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  const letters = arr(p.letters).filter((l) => str(l.title)).map((l) => ({ no: str(l.no), title: str(l.title), date: str(l.date), read: str(l.read), paragraphs: paras(l.body) }))
  return (
    <div data-mn="archive" className={cls(pad, vis)}>
      <MidnightArchive
        eyebrow={str(p.eyebrow)}
        letters={letters}
        signupTitle={str(p.signupTitle)}
        signup={<MidnightLetterForm slug={links?.slug ?? null} askName placeholder="" buttonLabel={str(p.buttonLabel)} successMessage={str(p.successMessage)} />}
      />
    </div>
  )
}

// ── Contact: a photo beside the form ──────────────────────────────────────────────────────

function MidnightContactBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  const src = img(p.image)
  return (
    <section data-mn="contact" data-tone={soft(p.tone) ? 'soft' : undefined} className={cls('mn-contact', pad, vis)}>
      <div className="mn-contact-photo mn-grain">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
          <img src={src} alt={str(p.alt)} />
        )}
        <div className="mn-vignette" aria-hidden="true" />
        <div className="mn-mist mn-mist--low" aria-hidden="true" />
        <div className="mn-smoke" aria-hidden="true" />
        <div className="mn-stardust" aria-hidden="true" />
        <h1 className="mn-display mn-display--h1 mn-contact-title">{str(p.title)}</h1>
      </div>
      <div className="mn-contact-side">
        <div className="mn-contact-copy">
          {str(p.lead) && <p className="mn-contact-lead">{str(p.lead)}</p>}
          {str(p.body) && <p className="mn-muted mn-prose">{str(p.body)}</p>}
          <MidnightContactForm slug={links?.slug ?? null} buttonLabel={str(p.buttonLabel)} successTitle={str(p.successTitle)} successBody={str(p.successBody)} />
        </div>
      </div>
    </section>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────

const heroFields = { eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'), image, alt: text('Photo description', 'For screen readers.'), pos: text('Photo crop', 'Where the photo is held when it is cropped, like center 40%.'), height: { type: 'number', label: 'Height in pixels', min: 280, max: 720 } }
const buttons = (n: string) => ({ [`${n}Label`]: text('Button'), [`${n}Href`]: text('Button link', LINK_HINT) })
const anchorField = { anchor: text('Jump link name', 'Lets a jump bar scroll here. Letters, digits and hyphens.') }

export const midnightPracticeComponents: Record<string, ComponentConfig> = {
  MidnightPageHero: block('Midnight page hero', heroFields, { eyebrow: 'Services', title: 'Reclaim your *magic*', lead: '', image: '', alt: '', pos: '', height: 460 }, MidnightPageHeroBlock),
  MidnightJump: block('Midnight jump bar', {
    items: { type: 'array', label: 'Links', arrayFields: { label: text('Label'), href: text('Where it goes', 'Start with # for a spot on this page, like #reiki.') } },
  }, { items: [] }, MidnightJumpBlock),
  MidnightWelcome: block('Midnight welcome', {
    logo: { ...image, label: 'Logo' }, logoAlt: text('Logo description'), eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'),
    image, alt: text('Photo description'), tone, heading: area('Second heading', VOICE_HINT), body: area('Paragraphs', PARA_HINT), ...buttons('button'),
  }, { logo: '', logoAlt: '', eyebrow: '', title: '', lead: '', image: '', alt: '', tone: 'mono', heading: '', body: '', buttonLabel: '', buttonHref: '' }, MidnightWelcomeBlock),
  MidnightHost: block('Midnight meet the host', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), body: area('Paragraphs', PARA_HINT), ...buttons('primary'), ...buttons('secondary'), image, alt: text('Photo description'), caption: text('Caption under the photo'), tone,
  }, { eyebrow: '', title: '', body: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: '', alt: '', caption: '', tone: 'mono' }, MidnightHostBlock),
  MidnightPillars: block('Midnight pillars', {
    ...head,
    pillars: { type: 'array', label: 'Pillars', arrayFields: { sigil: glyph, title: text('Name'), body: area('Line under the name') } },
  }, { eyebrow: '', title: '', lead: '', pillars: [] }, MidnightPillarsBlock),
  MidnightService: block('Midnight service with options', {
    ...anchorField, image, alt: text('Photo description'), tone, side: { type: 'select', label: 'Photo side', options: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }] },
    sigil: glyph, numeral: text('Roman numeral'), label: text('Small label'), title: text('Name'), body: area('Words'), pull: area('Pull quote'), note: text('Badge'),
    options: { type: 'array', label: 'Options', arrayFields: { name: text('Name'), meta: text('Length'), text: area('Words'), price: text('Price'), buttonLabel: text('Button'), href: text('Button link', LINK_HINT) } },
    panelSigil: glyph, panelMeta: text('Panel: small label'), panelTitle: text('Panel: heading (leave empty for no panel)', VOICE_HINT), panelBody: area('Panel: words'), panelButtonLabel: text('Panel: button'), panelButtonHref: text('Panel: button link', LINK_HINT), panelPrice: text('Panel: price'),
  }, { anchor: '', image: '', alt: '', tone: 'soft', side: 'left', sigil: 'moon-full', numeral: '', label: '', title: '', body: '', pull: '', note: '', options: [], panelSigil: 'mic', panelMeta: '', panelTitle: '', panelBody: '', panelButtonLabel: '', panelButtonHref: '', panelPrice: '' }, MidnightServiceBlock),
  MidnightCustomRecording: block('Midnight recording panel', {
    sigil: glyph, meta: text('Small label'), title: text('Heading', VOICE_HINT), body: area('Words'), ...buttons('button'), price: text('Price'),
  }, { sigil: 'mic', meta: '', title: '', body: '', buttonLabel: '', buttonHref: '', price: '' }, MidnightCustomRecordingBlock),
  MidnightRecordings: block('Midnight recordings', {
    ...anchorField, ...head, ...action, count: { type: 'number', label: 'How many to show', min: 1, max: 24 }, note: text('Small line beside each button'),
    items: { type: 'array', label: 'Recordings', arrayFields: { sigil: glyph, title: text('Name'), price: text('Price'), blurb: area('Words'), points: area('What it does', LINES_HINT), buttonLabel: text('Button'), href: text('Button link', LINK_HINT) } },
  }, { anchor: '', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', count: 24, note: '', items: [] }, MidnightRecordingsBlock),
  MidnightProgram: block('Midnight program', {
    ...anchorField, tagA: text('Tagline, first part'), tagB: text('Tagline, second part (in the accent)'), title: text('Name'), badges: area('Badges', LINES_HINT), flag: text('Accent badge'), body: area('Paragraphs', PARA_HINT),
    image, alt: text('Photo description'), tone,
    includes: { type: 'array', label: 'What is included', arrayFields: { sigil: glyph, title: text('Name'), body: area('Words') } },
    addonLabel: text('Add-on: small label'), addonBody: area('Add-on: words (leave empty for none)'), ...buttons('primary'), ...buttons('secondary'), note: text('Small note'),
  }, { anchor: '', tagA: '', tagB: '', title: '', badges: '', flag: '', body: '', image: '', alt: '', tone: 'soft', includes: [], addonLabel: '', addonBody: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', note: '' }, MidnightProgramBlock),
  MidnightStatement: block('Midnight statement', { label: text('Label in the ornament'), body: area('Words') }, { label: '', body: '' }, MidnightStatementBlock),
  MidnightEventRows: block('Midnight event rows (live)', {
    count: { type: 'number', label: 'How many to show', min: 1, max: 24 }, buttonLabel: text('Button on each row'), zone: text('Time zone mark', 'Shown after a live time, like PT.'), empty: text('When there are no dates'),
    rows: { type: 'array', label: 'Rows', hint: 'Used when the Space has no upcoming events of its own.', arrayFields: { month: text('Month'), day: text('Day'), badge: text('Where'), left: text('Places left'), title: text('Name'), summary: area('Words'), when: text('When'), format: text('Format'), price: text('Price'), href: text('Link', LINK_HINT) } },
  }, { count: 12, buttonLabel: 'Reserve', zone: '', empty: 'New dates are on the way.', rows: [] }, MidnightEventRowsBlock),
  MidnightBand: block('Midnight closing band', { title: area('Heading', VOICE_HINT), ...buttons('button') }, { title: '', buttonLabel: '', buttonHref: '' }, MidnightBandBlock),
  MidnightSignup: block('Midnight email sign-up', { title: area('Heading', VOICE_HINT), buttonLabel: text('Button'), successMessage: text('Thank-you line') }, { title: 'Join our *email list*', buttonLabel: 'Join our email list', successMessage: 'You are in. The next letter arrives on the 1st.' }, MidnightSignupBlock),
  MidnightArchive: block('Midnight letter archive', {
    eyebrow: text('Small label'), signupTitle: text('Title over the sign-up in a letter'), buttonLabel: text('Sign-up button'), successMessage: text('Thank-you line'),
    letters: { type: 'array', label: 'Letters', arrayFields: { no: text('Number'), title: text('Title'), date: text('Date'), read: text('Read time'), body: area('Paragraphs', PARA_HINT) } },
  }, { eyebrow: 'The archive', signupTitle: 'Get the next one *in your inbox*', buttonLabel: 'Join our email list', successMessage: 'You are in. The next letter arrives on the 1st.', letters: [] }, MidnightArchiveBlock),
  MidnightContact: block('Midnight contact', {
    image, alt: text('Photo description'), tone, title: text('Heading'), lead: area('First line'), body: area('Second line'), buttonLabel: text('Button'), successTitle: text('Thank-you heading'), successBody: text('Thank-you line'),
  }, { image: '', alt: '', tone: 'mono', title: 'Contact', lead: '', body: '', buttonLabel: 'Send', successTitle: 'Received.', successBody: 'We will be in touch soon.' }, MidnightContactBlock),
}

export const MIDNIGHT_PRACTICE_CATEGORY_COMPONENTS = Object.keys(midnightPracticeComponents)
