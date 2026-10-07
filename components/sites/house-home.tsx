import { JsonLd } from '@/components/json-ld'
import type { ReactNode } from 'react'
import { faqSchema } from '@/lib/jsonld'
import { safeImageSrc } from '@/lib/safe-image-src'
import { isFeatureDataSource, pickerSelection, resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { resolveRows, type EntityLayout, type RowColumns, type RowDef } from '@/lib/entity-blocks/layout'
import { getSpaceFaqs } from '@/lib/spaces/content-data'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { isServiceListed, readProfileData, SPACE_SOCIAL_PLATFORMS } from '@/lib/spaces/profile-data'
import { readHeroConfig } from '@/lib/spaces/hero-config'
import { readSiteHero } from '@/lib/spaces/website'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readCoverFocus } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import type { Space } from '@/lib/spaces/types'
import {
  appHref,
  formatDuration,
  formatOfferingPrice,
  formatTierPrice,
  HOUSE_NAV,
  paragraphs,
  plainText,
  planHouseSections,
  siteLocalHref,
  splitWhoBody,
  stepNumber,
  type HouseSection,
  type SiteLinkMap,
} from '@/lib/sites/house-theme'
import { siteHeroLede } from './site-hero-copy'
import { HouseBlock, HouseHero, type HouseBlockModel, type HouseHeroModel, type HouseLink } from './house-sections'

// THE HOUSE THEME'S HOME PAGE (owner ask 2026-10-07). Resolves the Space's own Home blocks into the themed
// sections (lib/sites/house-theme.ts plans which; this file fills each from the Space's data), then renders
// them. RULE: every word, photo and link is read from the Space (its block fields, Hero settings, header
// button, offerings, memberships, FAQ and contact details). Nothing is filled in from code: a field the
// owner left blank is simply not drawn, and a section with nothing to show is dropped.

type Bag = Record<string, unknown>

/** A stored field as plain text, or null when blank. */
function text(v: unknown): string | null {
  return plainText(v) || null
}

/** The header menu entries the plan offers, labelled with each section's own eyebrow (else its title). */
export interface HouseNavLink extends HouseLink {
  anchor: string
}

export interface HouseHomeInput {
  space: Space
  grid: EntityLayout
  brandName: string
  tagline: string | null
  origin: string
  /** Where the site's own links go: a Space link the owner set becomes a website link (siteLocalHref). */
  links: SiteLinkMap
  /** The Space's resolved header button (its label and target are the owner's). */
  cta: HouseLink | null
  /** Render one row of blocks the theme does not style, the way the Space page renders it. */
  renderRow: (grid: EntityLayout) => ReactNode
}

export async function buildHouseHome({ space, grid, brandName, tagline, origin, links, cta, renderRow }: HouseHomeInput) {
  const prefs = space.preferences
  const content: Record<string, Bag> = (grid.content ?? {}) as Record<string, Bag>
  const bag = (id: string | null): Bag => (id ? (content[id] ?? {}) : {})
  const rows = resolveRows(grid, 'space')
  const plan = planHouseSections(rows, (id) => isFeatureDataSource(content[id]))
  // The Space on Frequency: only the clearly labelled On Frequency section links here.
  const spaceBase = `${origin}/spaces/${space.slug}`
  // Every session card books on the website (its Contact form until it takes bookings itself).
  const book = siteLocalHref(`/spaces/${space.slug}/book`, links)
  const profile = readProfileData(prefs)

  const needsFaq = plan.some((s) => s.kind === 'faq')
  const needsTiers = plan.some((s) => s.kind === 'community')
  const [faqs, tiers] = await Promise.all([
    needsFaq ? getSpaceFaqs(space.id) : Promise.resolve([]),
    needsTiers ? listMembershipTiers(space.id) : Promise.resolve([]),
  ])

  // Offerings, the owner's listed services, narrowed to the block's picked ones (empty pick = all).
  const listed = (profile.offerings ?? []).filter(isServiceListed)
  const picked = resolvePickedIds(pickerSelection(content.offerings), listed.map((o) => o.title ?? ''))
  const offerings = picked.map((t) => listed.find((o) => o.title === t)).filter((o): o is (typeof listed)[number] => !!o)

  const anchors = new Set<string>()
  const anchorFor = (kind: HouseSection['kind']): string | null => {
    const a = HOUSE_NAV[kind]?.anchor
    if (!a || anchors.has(a)) return null
    anchors.add(a)
    return a
  }

  const blocks: HouseBlockModel[] = []
  const nav: HouseNavLink[] = []
  const addNav = (anchor: string | null, eyebrow: string | null, title: string | null) => {
    const label = eyebrow ?? title
    if (anchor && label) nav.push({ anchor, href: `#${anchor}`, label: label.replace(/\*/g, '') })
  }
  let communityButton: HouseLink | null = null

  for (const [i, s] of plan.entries()) {
    const key = `s${i}`
    if (s.kind === 'who') {
      const b = bag(s.id)
      const body = splitWhoBody(b.body)
      const m = { kind: s.kind, key, eyebrow: text(b.eyebrow), title: text(b.title), ...body }
      if (m.eyebrow || m.title || m.lead || m.signs.length || m.closing) blocks.push(m)
    } else if (s.kind === 'steps') {
      const b = bag(s.id)
      const cards = Array.isArray(b.cards) ? (b.cards as Bag[]) : []
      const steps = cards
        .map((c, n) => ({ n: stepNumber(c.icon, n), title: text(c.title) ?? '', body: text(c.text) ?? '' }))
        .filter((c) => c.title || c.body)
      if (steps.length === 0) continue
      const anchor = anchorFor(s.kind)
      const m = { kind: s.kind, key, anchor, eyebrow: text(b.eyebrow), title: text(b.title), subtitle: text(b.subtitle), steps }
      addNav(anchor, m.eyebrow, m.title)
      blocks.push(m)
    } else if (s.kind === 'story') {
      const b = bag(s.id)
      const ps = paragraphs(b.body)
      const facts = s.factsId ? factsOf(bag(s.factsId)) : null
      const image = typeof b.image === 'string' ? safeImageSrc(b.image) : null
      if (!ps.length && !text(b.title) && !image) continue
      const anchor = anchorFor(s.kind)
      const m = {
        kind: s.kind,
        key,
        anchor,
        eyebrow: text(b.eyebrow),
        title: text(b.title),
        image,
        alt: text(b.alt) ?? '',
        body: ps.length > 1 ? ps.slice(0, -1) : ps,
        pull: ps.length > 1 ? ps[ps.length - 1] : null,
        facts: facts && facts.items.length ? facts : null,
      }
      addNav(anchor, m.eyebrow, m.title)
      blocks.push(m)
    } else if (s.kind === 'facts') {
      const f = factsOf(bag(s.id))
      if (f.items.length) blocks.push({ kind: s.kind, key, ...f })
    } else if (s.kind === 'sessions') {
      if (offerings.length === 0) continue
      const b = bag(s.id)
      const label = text(b.ctaLabel) ?? cta?.label ?? null
      const anchor = anchorFor(s.kind)
      const m = {
        kind: s.kind,
        key,
        anchor,
        eyebrow: text(b.eyebrow),
        title: text(b.title),
        cards: offerings.map((o) => ({
          length: formatDuration(o.durationMinutes),
          price: formatOfferingPrice(o),
          title: o.title,
          body: o.blurb?.trim() || null,
          cta: label && book ? { label, href: book.href } : null,
        })),
      }
      addNav(anchor, m.eyebrow, m.title)
      blocks.push(m)
    } else if (s.kind === 'community') {
      const b = { ...bag('circles'), ...bag(s.membershipsId) }
      const buttonLabel = text(b.ctaLabel)
      communityButton = buttonLabel ? { label: buttonLabel, href: spaceBase } : null
      const m = {
        kind: s.kind,
        key,
        anchor: null as string | null,
        eyebrow: text(b.eyebrow),
        title: text(b.title),
        body: text(b.body),
        button: communityButton,
        quote: text(b.quote),
        tiers: tiers.map((t) => ({
          name: t.name,
          description: t.description?.trim() || t.benefits[0] || null,
          price: formatTierPrice(t.priceCents, t.interval),
          href: `${spaceBase}/memberships`,
        })),
        note: text(b.note),
      }
      if (!m.eyebrow && !m.title && !m.body && !m.tiers.length) continue
      m.anchor = anchorFor(s.kind)
      addNav(m.anchor, m.eyebrow, m.title)
      blocks.push(m)
    } else if (s.kind === 'faq') {
      if (faqs.length === 0) continue
      const b = bag(s.id)
      const anchor = anchorFor(s.kind)
      const items = faqs
        .map((f) => ({ q: plainText(f.question), a: paragraphs(f.answer.replace(/\n/g, '\n\n')) }))
        .filter((f) => f.q && f.a.length)
      const m = { kind: s.kind, key, anchor, eyebrow: text(b.eyebrow), title: text(b.title), items }
      addNav(anchor, m.eyebrow, m.title)
      blocks.push(m)
    } else if (s.kind === 'inquiry') {
      // Not a menu entry: the header's Contact link opens the full Contact page instead.
      const anchor = anchors.has('message') ? null : 'message'
      if (anchor) anchors.add(anchor)
      blocks.push(inquiryOf(bag(s.id), key, anchor, space.slug, cta, links))
    } else if (s.kind === 'closing') {
      const m = closingOf(bag(s.ctaId), key, contactOf(profile, s.contactRowTitle), links, space)
      if (m) blocks.push(m)
    } else {
      // An unthemed block keeps the Space page's own render, in a plain band.
      const row = rows.find((r) => r.id === s.rowId)
      if (!row) continue
      const cells = row.cells.map((c) => c.filter((id) => s.ids.includes(id))).filter((c) => c.length > 0)
      const only: RowDef = { ...row, cells, columns: Math.min(4, Math.max(1, cells.length)) as RowColumns }
      blocks.push({
        kind: 'other',
        key,
        node: renderRow({ ...grid, rows: [only] }),
      })
    }
  }

  // The hero: the Space's cover at its focal point, its Hero settings (headline, line under it, the name
  // card's role line), its header button, and the first listed offering as the "start here" card. The
  // website headline + intro (preferences.siteHero) win over the Hero settings, so the website can lead
  // with a marketing line while the Space page header keeps the Space's name.
  const hero = readHeroConfig(prefs)
  const siteHero = readSiteHero(prefs)
  const steps = blocks.find((b) => b.kind === 'steps')
  const first = offerings[0]
  const heroModel: HouseHeroModel = {
    photo: safeImageSrc(space.coverImageUrl) ?? coverPlaceholderFor(space.id),
    focus: readCoverFocus(prefs),
    title: siteHero.heading || hero.heading || brandName,
    lede: siteHero.tagline || hero.tagline || tagline || siteHeroLede(space.about),
    cta,
    secondary:
      steps && steps.kind === 'steps' && steps.anchor ? { label: (steps.eyebrow ?? steps.title ?? '').replace(/\*/g, ''), href: `#${steps.anchor}` } : null,
    pill: communityButton,
    start: first
      ? {
          eyebrow: text(content.offerings?.eyebrow),
          name: brandName,
          role: hero.eyebrow || null,
          logo: safeImageSrc(space.brandLogoUrl) ?? null,
          body: first.blurb?.trim() || null,
          cta,
        }
      : null,
  }
  if (heroModel.secondary && !heroModel.secondary.label) heroModel.secondary = null

  const schemaQas = faqs.map((f) => ({ q: plainText(f.question), a: plainText(f.answer) })).filter((qa) => qa.q && qa.a)
  return { hero: heroModel, blocks, nav: nav.slice(0, 6), schemaQas }
}

function factsOf(b: Bag): { eyebrow: string | null; title: string | null; items: { value: string; label: string }[] } {
  const raw = Array.isArray(b.items) ? (b.items as Bag[]) : []
  return {
    eyebrow: text(b.eyebrow),
    title: text(b.title),
    items: raw.map((it) => ({ value: plainText(it.title), label: plainText(it.text) })).filter((it) => it.value),
  }
}

/** The Contact form section: the block's own heading and intro, and its settings for the CRM-wired form
 *  (app/(main)/spaces/[slug]/contact-form-actions.ts writes the lead and emails the owner). After sending,
 *  the thank-you offers the Space's header button, unless that button is this same form. */
function inquiryOf(b: Bag, key: string, anchor: string | null, slug: string, cta: HouseLink | null, links: SiteLinkMap): HouseBlockModel {
  const opt = (v: unknown) => text(v) ?? undefined
  return {
    kind: 'inquiry',
    key,
    anchor,
    eyebrow: text(b.eyebrow),
    title: text(b.title),
    body: paragraphs(b.body),
    form: {
      slug,
      showPhone: b.showPhone === true,
      showMessage: b.showMessage !== false,
      messageLabel: opt(b.messageLabel),
      optInLabel: opt(b.optInLabel),
      submitLabel: opt(b.submitLabel),
      successMessage: opt(b.successMessage),
      next: cta && cta.href !== links.contactHref ? { label: cta.label, href: cta.href } : null,
    },
  }
}

/** The closing ink band: the Accent beat's headline and button beside the contact details. Null when empty. */
function closingOf(b: Bag, key: string, contact: ReturnType<typeof contactOf>, links: SiteLinkMap, space: Space): HouseBlockModel | null {
  const buttonLabel = b.buttonOn === false ? null : text(b.buttonLabel)
  const button = siteLocalHref(b.buttonUrl, links)
  const m = {
    kind: 'closing' as const,
    key,
    anchor: 'contact',
    eyebrow: null,
    title: text(b.title),
    body: text(b.body),
    button: buttonLabel && button ? { label: buttonLabel, ...button } : null,
    photo: (typeof b.image === 'string' ? safeImageSrc(b.image) : null) ?? safeImageSrc(space.coverImageUrl) ?? null,
    contact,
  }
  return m.title || m.body || m.button || contact ? m : null
}

/**
 * THE WEBSITE'S CONTACT PAGE (`/contact`, offered by siteHasContactPage). Three sections, every word from the
 * Space's own fields: a profile (the About block's heading and text, the Zigzag photo, the facts), the
 * Contact form, then the closing band with the contact details. A section with nothing to show is dropped.
 */
export function buildHouseContact({ space, grid, links, cta }: Pick<HouseHomeInput, 'space' | 'grid' | 'links' | 'cta'>) {
  const content: Record<string, Bag> = (grid.content ?? {}) as Record<string, Bag>
  const bag = (id: string): Bag => content[id] ?? {}
  const imageOf = (b: Bag) => (typeof b.image === 'string' ? safeImageSrc(b.image) : null)
  const blocks: HouseBlockModel[] = []

  const about = bag('about')
  const ps = paragraphs(about.body)
  const facts = isFeatureDataSource(content.features) ? null : factsOf(bag('features'))
  if (ps.length || text(about.title)) {
    blocks.push({
      kind: 'story',
      key: 'profile',
      anchor: 'about',
      eyebrow: text(about.eyebrow),
      title: text(about.title),
      image: imageOf(about) ?? imageOf(bag('zigzag')),
      alt: text(about.alt) ?? text(bag('zigzag').alt) ?? '',
      body: ps.length > 1 ? ps.slice(0, -1) : ps,
      pull: ps.length > 1 ? ps[ps.length - 1] : null,
      facts: facts && facts.items.length ? facts : null,
    })
  }
  blocks.push(inquiryOf(bag('contactForm'), 'form', 'message', space.slug, cta, links))
  const close = closingOf(bag('accentBeat'), 'close', contactOf(readProfileData(space.preferences), null), links, space)
  if (close) blocks.push(close)
  return { blocks }
}

function contactOf(profile: ReturnType<typeof readProfileData>, title: string | null) {
  const address = profile.address?.trim() || null
  const hours = (profile.hours ?? '').split('\n').map((h) => h.trim()).filter(Boolean)
  const phone = profile.phone?.trim() || null
  const email = profile.email?.trim() || null
  const links: HouseLink[] = (profile.socials ?? [])
    .map((s) => ({ href: appHref(s.url, '') ?? '', label: SPACE_SOCIAL_PLATFORMS.find((p) => p.key === s.platform)?.label ?? '', external: true }))
    .filter((l) => l.href.startsWith('http') && l.label)
  const site = appHref(profile.website, '')
  if (site?.startsWith('http')) links.push({ href: site, label: new URL(site).hostname.replace(/^www\./, ''), external: true })
  if (!address && !hours.length && !phone && !email && !links.length) return null
  return {
    title,
    address,
    mapsHref: address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null,
    hours,
    phone,
    email,
    links,
  }
}

export function HouseHome({ model }: { model: Awaited<ReturnType<typeof buildHouseHome>> }) {
  return (
    <>
      {model.schemaQas.length > 0 && <JsonLd data={faqSchema(model.schemaQas)} />}
      <HouseHero hero={model.hero} />
      {model.blocks.map((b, i) => (
        <HouseBlock key={b.key} block={b} first={i === 0} />
      ))}
    </>
  )
}
