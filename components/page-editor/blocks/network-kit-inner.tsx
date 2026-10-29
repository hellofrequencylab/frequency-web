import type { ComponentConfig } from '@/lib/page-editor/types'
import { storedWallClock } from '@/lib/sites/site-events'
import { NkGlyph, NkSeal } from '@/components/sites/network-kit-glyph'
import { NetworkKitInnerIndexList, type InnerCard } from '@/components/sites/network-kit-inner/inner-index'
import {
  Band, Btn, Head, Section, VOICE_HINT, LINK_HINT, area, arr, block, cls, eventHref, glyph, hrefOf, image, img, pick, spaceOf, str, text, upcoming, whenOf, variantField, type Common,
} from './network-kit'

// ── The Network Theme Kit inner-page blocks, pass A (About, Services, Workshops, Journeys) ─────────────────────
// Block types NetworkKitInner<Part>: the parts of the design's inner pages (Network design system, ui_kits/site
// AboutPage, ServicesPage, WorkshopsPage, JourneysPage) that the home blocks do not already draw. The page header,
// the closing call, the questions, the figures, the chapters and the circles are the kit's own shared blocks
// (NetworkKitHero, NetworkKitCTA, NetworkKitFAQ, NetworkKitStats with its `photo` layout, NetworkKitChapters,
// NetworkKitCircles), so no role has a second block. Server Components, except the filter tabs on the index
// (components/sites/network-kit-inner/inner-index.tsx). Every look is the kit's sheet
// (components/sites/network-kit-inner/inner-css.ts), tokens only, scoped to the site render. A photo left empty draws
// no frame, so a Space without photos still reads whole.

/** Role sidecar, one line per block: the role it plays on a page and the layout it draws. Read by the theme cohesion pass. */
export const NETWORK_KIT_INNER_ROLES: Record<string, { role: string; variant: string }> = {
  NetworkKitInnerStory: { role: 'story', variant: 'arch' }, // the owner's story: heading and arch photo beside the prose
  NetworkKitInnerTeam: { role: 'team', variant: 'people' }, // the organizers: a row of person cards under an ornament
  NetworkKitInnerServices: { role: 'offerings', variant: 'rows' }, // full-bleed rows, photo and words side by side, alternating
  NetworkKitInnerIndex: { role: 'gatherings', variant: 'filtered-cards' }, // meetups or programs as cards under filter tabs
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
const lines = (v: unknown) => str(v).split('\n').map((s) => s.trim()).filter(Boolean)
const photo = (src: string | null, alt: string) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
    <img src={src} alt={alt} loading="lazy" />
  ) : null

// ── Story ──────────────────────────────────────────────────────────────────────────────────────────────────

function StoryBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const paras = lines(p.body)
  return (
    <Band kind="inner-story" p={p} pad={pad} vis={vis}>
      <Section>
        <div className="nk-split nki-story">
          <div>
            <Head p={p} metadata={metadata} button={null} kicker={false} />
            {src && (
              <figure className="nki-arch">
                <div className="nki-arch-frame nk-photo" data-grade="">{photo(src, str(p.alt))}</div>
                {str(p.caption) && <figcaption className="nk-eyebrow">{str(p.caption)}</figcaption>}
              </figure>
            )}
          </div>
          <div className="nki-prose">
            {paras.map((t, i) => <p key={i} data-first={i === 0 ? '' : undefined}>{t}</p>)}
          </div>
        </div>
      </Section>
    </Band>
  )
}

// ── Team ───────────────────────────────────────────────────────────────────────────────────────────────────

function TeamBlock({ p, pad, vis }: Common) {
  const people = arr(p.people).map((x) => ({ name: str(x.name), role: str(x.role), line: str(x.line), face: img(x.image) })).filter((x) => x.name)
  if (!people.length) return null
  return (
    <Band kind="inner-team" p={p} pad={pad} vis={vis}>
      <Section className="nki-team">
        <div className="nk-ornament nki-ornament" role="separator"><span /><i aria-hidden="true" />{str(p.label) && <em>{str(p.label)}</em>}<i aria-hidden="true" /><span /></div>
        <ul className="nki-people">
          {people.map((x, i) => (
            <li key={i} className="nk-card nki-person">
              <span className="nk-avatar nki-face">{x.face ? photo(x.face, '') : initials(x.name)}</span>
              <span className="nki-person-text">
                <span className="nki-person-name"><b>{x.name}</b>{x.role && <span className="nk-badge nk-badge--accent">{x.role}</span>}</span>
                {x.line && <span className="nk-row-body">{x.line}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </Band>
  )
}

// ── Service rows ───────────────────────────────────────────────────────────────────────────────────────────

function ServicesBlock({ p, metadata, pad, vis }: Common) {
  const rows = arr(p.rows).filter((r) => str(r.title))
  if (!rows.length) return null
  return (
    <Band kind="inner-services" p={p} pad={pad} vis={vis}>
      {rows.map((r, i) => {
        const src = img(r.image)
        const to = str(r.ctaLabel) ? hrefOf(str(r.ctaHref), metadata) : null
        const points = lines(r.points)
        return (
          <section key={i} className="nki-service" data-flip={i % 2 ? '' : undefined}>
            <div className={cls('nki-service-media', !src && 'nki-bare')} data-grade="">{photo(src, str(r.alt))}</div>
            <div className="nki-service-copy">
              <NkSeal name={str(r.glyph) || 'circle'} size={64} />
              <div className="nk-eyebrow"><span className="nki-n">{String(i + 1).padStart(2, '0')}</span>{str(r.length)}</div>
              <h2 className="nk-display nk-display--h3">{str(r.title)}</h2>
              {str(r.summary) && <p className="nki-summary">{str(r.summary)}</p>}
              {points.length > 0 && (
                <ul className="nki-includes">
                  {points.map((x, j) => <li key={j}><NkGlyph name="check" size={14} />{x}</li>)}
                </ul>
              )}
              {(to || str(r.price)) && (
                <div className="nki-service-foot">
                  <Btn label={str(r.ctaLabel)} href={str(r.ctaHref)} metadata={metadata} />
                  {str(r.price) && <span className="nk-mono">{str(r.price)}</span>}
                </div>
              )}
            </div>
          </section>
        )
      })}
    </Band>
  )
}

// ── Filtered index ─────────────────────────────────────────────────────────────────────────────────────────

const KINDS = ['meetups', 'programs'] as const

function IndexBlock({ p, metadata, now = new Date(), pad, vis }: Common) {
  const kind = pick(p.variant, KINDS, 'meetups')
  const count = Math.max(1, Math.min(24, Number(p.count) || 12))
  const cover = img(p.image)
  // Live rows carry no photo of their own: they borrow the owner's card photos in turn, then the block photo.
  const covers = [...arr(p.items).map((c) => img(c.image)).filter((x): x is string => !!x)]
  const coverAt = (i: number) => (covers.length ? covers[i % covers.length] : cover)
  const online = (s: string) => /online|video|zoom|remote/i.test(s)
  let cards: InnerCard[]
  if (kind === 'meetups') {
    const live = upcoming(metadata, now).slice(0, count)
    cards = live.length
      ? live.map((e, i) => {
          const d = storedWallClock(e.startsAt)
          return { image: coverAt(i), glyph: online(e.location ?? '') ? 'video' : 'pin', eyebrow: d ? whenOf(e.startsAt) : '', title: e.title, meta: e.location ?? '', body: '', price: e.priceLabel ?? '', note: '', accent: false, group: online(e.location ?? '') ? 'Online' : 'In person', href: eventHref(e, metadata) }
        })
      : []
  } else {
    const live = spaceOf(metadata)?.practices?.journeys ?? []
    cards = live.slice(0, count).map((j, i) => ({ image: coverAt(i), glyph: 'arc', eyebrow: 'Program', title: j.title, meta: '', body: j.summary ?? '', price: '', note: j.adoptCount > 0 ? `${j.adoptCount} have taken it` : '', accent: false, group: '', href: null }))
  }
  if (!cards.length) {
    cards = arr(p.items).slice(0, count).filter((c) => str(c.title)).map((c) => ({
      image: img(c.image) ?? cover, glyph: str(c.glyph) || (kind === 'programs' ? 'arc' : online(str(c.meta) + str(c.group)) ? 'video' : 'pin'), eyebrow: str(c.eyebrow), title: str(c.title), meta: str(c.meta), body: str(c.body),
      price: str(c.price), note: str(c.note), accent: /seat|left|full|starts|run/i.test(str(c.note)), group: str(c.group), href: hrefOf(str(c.href), metadata),
    }))
  }
  return (
    <Band kind="inner-index" p={p} variant={kind} pad={pad} vis={vis}>
      <Section className="nki-index">
        <NetworkKitInnerIndexList cards={cards} tabs={lines(p.tabs)} allLabel={str(p.allLabel) || 'All'} countNoun={str(p.countNoun)} empty={str(p.empty)} />
      </Section>
    </Band>
  )
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────────────────────

const alt = text('Photo description', 'For screen readers.')

export const networkKitInnerComponents: Record<string, ComponentConfig> = {
  NetworkKitInnerStory: block('Network story', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), image, alt, caption: text('Caption under the photo'),
    body: area('The story', 'One paragraph per line. The first reads larger.'),
  }, {
    eyebrow: 'How it started', title: 'Networking,\n*minus the awkward*', image: '', alt: '', caption: '',
    body: 'Tell the story of how the group began, in a few short paragraphs.\nSay who it is for and what a first visit is like.\nEnd on the one rule you keep.',
  }, StoryBlock),
  NetworkKitInnerTeam: block('Network organizers', {
    label: text('Label over the row'),
    people: { type: 'array', label: 'People', arrayFields: { image, name: text('Name'), role: text('Role'), line: area('Line under the name') } },
  }, { label: 'The organizers', people: [] as Record<string, unknown>[] }, TeamBlock),
  NetworkKitInnerServices: block('Network service rows', {
    rows: { type: 'array', label: 'Services', arrayFields: {
      image, alt, glyph, length: text('Small label', 'Like how long it runs, or who it is for.'), title: text('Name'), summary: area('Line under the name'),
      points: area('What is included', 'One per line.'), ctaLabel: text('Button'), ctaHref: text('Button link', LINK_HINT), price: text('Price'),
    } },
  }, { rows: [] as Record<string, unknown>[] }, ServicesBlock),
  NetworkKitInnerIndex: block('Network meetups or programs (live)', {
    variant: variantField([['meetups', 'Meetups'], ['programs', 'Programs']]),
    countNoun: text('Word after the count', 'Like upcoming or programs.'), allLabel: text('First tab'), tabs: area('Other tabs', 'One per line. A tab shows only when a card is set to it.'),
    image, alt, count: { type: 'number', label: 'How many to show', min: 1, max: 24 }, empty: area('Line when there is nothing yet'),
    items: { type: 'array', label: 'Cards', hint: 'Used when the Space has no live dates or programs of its own.', arrayFields: {
      image, glyph, eyebrow: text('Small label'), title: text('Name'), meta: text('Where'), body: area('Words'), price: text('Price'), note: text('Small badge'), group: text('Tab it belongs to'), href: text('Link', LINK_HINT),
    } },
  }, { variant: 'meetups', countNoun: 'upcoming', allLabel: 'All', tabs: 'Online\nIn person', image: '', alt: '', count: 12, empty: 'No dates are up yet. Check back soon, or say hello.', items: [] as Record<string, unknown>[] }, IndexBlock),
}


