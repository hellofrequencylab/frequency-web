import type { ComponentConfig } from '@/lib/page-editor/types'
import { expandSiteSeries, type SiteEventRow } from '@/lib/sites/site-events'
import { templeWhen } from '@/lib/sites/temple-events'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { TempleKitTiersBoard, type TierCard } from '@/components/sites/temple-kit-inner/tiers-board'
import { area, arr, block, cls, hrefOf, image, img, lines, str, text, type Props } from './temple-kit-inner'

// ── The Temple Theme Kit inner-page blocks, group B (Membership and Gatherings) ───────────────────────────────
// Same family as group A (temple-kit-inner.tsx: tki-* classes, tokens only, scoped to the site render). The
// membership rungs are the Space's own words (every price is a typed value a Space edits; the kit seeds the
// design's sample ones). Gatherings draws the Space's upcoming events, each linked through the site map, and
// falls back to the cards the Space typed in the editor when it has no events yet.

interface Row extends SiteEventRow {
  description?: string | null
  priceLabel?: string | null
  coverUrl?: string | null
}
const isRow = (e: unknown): e is Row => !!e && typeof (e as Row).id === 'string' && typeof (e as Row).title === 'string' && typeof (e as Row).startsAt === 'string'
const WINDOW_DAYS = 180

/** The Space's upcoming rows (events and series, recurring anchors expanded), cancelled dropped, soonest first. */
function upcoming(metadata: Props | undefined, now: Date): Row[] {
  const space = metadata?.space as { events?: unknown; series?: unknown } | undefined
  if (!space) return []
  const seen = new Set<string>()
  const rows: Row[] = []
  for (const e of [...(Array.isArray(space.events) ? space.events : []), ...(Array.isArray(space.series) ? space.series : [])]) {
    if (!isRow(e) || seen.has(e.id)) continue
    seen.add(e.id)
    rows.push(e)
  }
  // Stored starts are wall clocks, so keep today's events in every zone: compare against the day 14 hours back.
  const today = new Date(now.getTime() - 14 * 3_600_000).toISOString().slice(0, 10)
  return expandSiteSeries(rows, { through: new Date(now.getTime() + WINDOW_DAYS * 86_400_000), from: now })
    .filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

// ── Membership ─────────────────────────────────────────────────────────────────────────────────────────────

function TiersBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const tiers: TierCard[] = arr(p.tiers)
    .map((t) => ({
      name: str(t.name), summary: str(t.summary), monthly: str(t.monthly), yearly: str(t.yearly), intro: str(t.intro), perks: lines(t.perks),
      featured: t.featured === true, badge: str(t.badge), href: str(t.ctaHref) ? hrefOf(str(t.ctaHref), metadata) : null, ctaLabel: str(t.ctaLabel), sigil: str(t.sigil) || 'ring',
    }))
    .filter((t) => t.name)
  if (tiers.length === 0) return null
  return (
    <section data-tki="tiers" className={cls('tki-section tki-tiers-section', pad, vis)}>
      {str(p.caption) && <div className="tki-eyebrow tki-tiers-caption">{str(p.caption)}</div>}
      <TempleKitTiersBoard tiers={tiers} monthlyLabel={str(p.monthlyLabel) || 'Monthly'} yearlyLabel={str(p.yearlyLabel) || 'Yearly'} yearlyNote={str(p.yearlyNote)} />
      {str(p.footnote) && <p className="tki-footnote">{str(p.footnote)}</p>}
    </section>
  )
}

// ── Gatherings ─────────────────────────────────────────────────────────────────────────────────────────────

interface Card {
  key: string
  when: string
  title: string
  place: string
  summary: string
  price: string
  seats: string
  cover: string | null
  href: string | null
}

function GatheringsBlock({ p, metadata, now = new Date(), pad, vis }: { p: Props; metadata?: Props; now?: Date; pad?: string; vis?: string }) {
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin ?? ''
  const live: Card[] = upcoming(metadata, now).map((e) => ({
    key: e.id, when: templeWhen(e.startsAt, e.endsAt) ?? '', title: e.title, place: '', summary: str(e.description), price: str(e.priceLabel), seats: '',
    cover: img(e.coverUrl) ?? img(p.fallback), href: e.slug ? `${origin}/events/${e.slug}` : null,
  }))
  const typed: Card[] = arr(p.items).map((x, i) => ({
    key: `item-${i}`, when: str(x.when), title: str(x.title), place: str(x.place), summary: str(x.summary), price: str(x.price), seats: str(x.seats),
    cover: img(x.image) ?? img(p.fallback), href: str(x.href) ? hrefOf(str(x.href), metadata) : null,
  }))
  const cards = (live.length ? live : typed).filter((c) => c.title)
  if (cards.length === 0) return null
  return (
    <section data-tki="gatherings" className={cls('tki-section tki-gatherings', pad, vis)}>
      <div className="tki-eyebrow tki-gatherings-count">{cards.length} {str(p.countLabel) || 'upcoming'}</div>
      <ul className="tki-cards">
        {cards.map((c) => (
          <li key={c.key} className="tki-card">
            <div className={cls('tki-card-media', !c.cover && 'tki-card-media--bare')} style={c.cover ? { backgroundImage: `url(${JSON.stringify(c.cover)})` } : undefined} aria-hidden="true" />
            <div className="tki-card-body">
              {c.when && <div className="tki-eyebrow">{c.when}</div>}
              <h3 className="tki-card-title">{c.href ? <a href={c.href}>{c.title}</a> : c.title}</h3>
              {c.place && <div className="tki-card-place">{c.place}</div>}
              {c.summary && <p className="tki-card-summary">{c.summary}</p>}
              {(c.price || c.seats) && (
                <div className="tki-card-foot">
                  <span>{c.price}</span>
                  {c.seats && <span className="tki-badge tki-badge--soft">{c.seats}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────────────────────

export const templeKitInnerBComponents: Record<string, ComponentConfig> = {
  TempleKitInnerTiers: block('Temple membership rungs', {
    caption: text('Line above the rungs'), monthlyLabel: text('Monthly label'), yearlyLabel: text('Yearly label'), yearlyNote: text('Note under a yearly price'), footnote: area('Line under the rungs'),
    tiers: {
      type: 'array', label: 'Rungs',
      arrayFields: {
        name: text('Name'), summary: area('Short description'),
        sigil: { type: 'radio', label: 'Mark', options: [{ label: 'Half', value: 'half' }, { label: 'Ring', value: 'ring' }, { label: 'Square', value: 'square' }] },
        monthly: text('Monthly price', 'Typed as you want it read, like $54.'), yearly: text('Yearly price', 'Leave empty to hide the yearly switch for this rung.'), intro: text('Note under the monthly price'),
        perks: area('What it holds', 'Each new line is one point.'),
        featured: { type: 'radio', label: 'Most chosen', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] }, badge: text('Badge on the most chosen rung'),
        ctaLabel: text('Button'), ctaHref: text('Button link', 'Start with ~/ for a page of this site, like ~/contact.'),
      },
    },
  }, { caption: '', monthlyLabel: 'Monthly', yearlyLabel: 'Yearly', yearlyNote: '', footnote: '', tiers: [] }, TiersBlock),
  TempleKitInnerGatherings: block('Temple gatherings', {
    countLabel: text('Word after the count'), fallback: image,
    items: {
      type: 'array', label: 'Cards shown until the Space has its own events',
      arrayFields: { when: text('When'), title: text('Name'), place: text('Place'), summary: area('Short description'), price: text('Price'), seats: text('Seats note'), image, href: text('Link') },
    },
  }, { countLabel: 'upcoming', fallback: '', items: [] }, GatheringsBlock),
}
