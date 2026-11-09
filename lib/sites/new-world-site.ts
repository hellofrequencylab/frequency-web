// A SPACE'S WEBSITE IN NEW WORLD (LIVE-2052). Dress an existing Space's website in the New World General kit without
// losing the owner's words: the kit's sample rows go, the blocks that read live rows (events, reviews, FAQ, team,
// circles, memberships, shop, library, business info) are left empty so the Space's own rows draw (LIVE-2053), and the
// words the owner already wrote on the site they have (a Services or Space block home page) move into the New World
// block that holds the same thing: the hero, the story, how it works, the numbers, the closing call, the contact
// form's line, the quote. A block that keeps the kit's words stays flagged `sample` so the editor still points at it.
//
// PURE: the kit, the current snapshot and the Space's fields come in; a snapshot and the SQL that lands it come out.
// Nothing here reads a database. The SQL goes through the two guarded writers the editor itself uses
// (save_website_editor with the revision check, set_space_preferences key-scoped), so a site the owner edited after
// the export is never overwritten: the apply fails loudly and is generated again.

import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import type { SiteKit } from '@/lib/sites/kits/types'
import { applyKit } from '@/lib/sites/kits/apply'
import type { SpaceProfileData, SpaceOffering } from '@/lib/spaces/profile-data'
import type { Data } from '@/lib/page-editor/types'

type Props = Record<string, unknown>
type Block = { type: string; props: Props }
type Defaults = (type: string) => Props | undefined

export interface NewWorldSiteSpace {
  slug: string
  name: string
  tagline: string | null
  about: string | null
  coverUrl: string | null
  logoUrl: string | null
  profile: SpaceProfileData | null
  /** The hero words the Space page already shows (preferences.siteHero), the fallback for a site with no hero block. */
  siteHero?: { heading?: string; tagline?: string } | null
  headerCta?: { label?: string } | null
}

interface NewWorldSiteInput {
  kit: SiteKit
  current: WebsiteSnapshot | null
  space: NewWorldSiteSpace
  defaults?: Defaults
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is Props => !!x && typeof x === 'object') : [])
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : [])
/** The editor stores form copy with HTML entities; a block prop wants the plain words. */
const plain = (v: unknown): string => str(v).replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const imageUrl = (v: unknown): string => (typeof v === 'string' ? v : str((v as { url?: unknown } | null)?.url))

/** Every block on the current site, in page order, so the carry can find the first of a type. */
function blocksOf(snapshot: WebsiteSnapshot | null): Block[] {
  const out: Block[] = []
  for (const page of snapshot?.pages ?? []) for (const b of (page.doc as Data).content ?? []) if (b && typeof b.type === 'string') out.push({ type: b.type, props: (b.props ?? {}) as Props })
  return out
}
const firstOf = (blocks: Block[], ...types: string[]): Props | null => blocks.find((b) => types.includes(b.type))?.props ?? null
const allOf = (blocks: Block[], type: string): Props[] => blocks.filter((b) => b.type === type).map((b) => b.props)

/** "$120" / "From $120" / "Free" / "" for a contact price, as the offering says it. */
export function offeringPrice(o: SpaceOffering): string {
  if (o.priceModel === 'contact') return ''
  if (o.priceModel === 'free' || o.price === 0) return 'Free'
  if (typeof o.price !== 'number' || !Number.isFinite(o.price)) return ''
  const amount = `$${Number.isInteger(o.price) ? o.price : o.price.toFixed(2)}`
  return o.priceModel === 'from' ? `From ${amount}` : amount
}
const minutes = (o: SpaceOffering): string => (o.durationMinutes ? `${o.durationMinutes} min` : '')

/** The role word for the portrait on the story page, from the Space's kind. */
function roleOf(profile: SpaceProfileData | null): string {
  switch (profile?.kind) {
    case 'coach': return 'Coach'
    case 'practitioner': return 'Practitioner'
    case 'studio': return 'Studio'
    case 'maker': return 'Maker'
    case 'venue': return 'Venue'
    default: return 'Owner'
  }
}

/** Business hours lines as the Where block's rows: "Mon to Fri: 9am to 6pm" splits on the first colon; a line with a comma
 *  and no colon ("Mon to Fri, 9am to 6pm, by appointment") splits on the first comma. */
export function hoursRowsOf(hours: string | undefined): { day: string; time: string }[] {
  return (hours ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const colon = l.indexOf(':')
      const comma = l.indexOf(',')
      const at = colon > 0 ? colon : comma > 0 ? comma : -1
      return at > 0 ? { day: l.slice(0, at).trim(), time: l.slice(at + 1).trim() } : { day: l, time: '' }
    })
}

/** Build the Space's New World website. The kit replaces the pages; the owner's words move in; sample rows go. */
export function newWorldSiteFor(input: NewWorldSiteInput): { ok: true; snapshot: WebsiteSnapshot; carried: string[] } | { ok: false; error: string } {
  const base: WebsiteSnapshot = input.current ? { ...input.current, pages: input.current.pages } : { theme: input.kit.theme, pages: [] }
  const applied = applyKit(base, input.kit, 'replace', input.defaults)
  if (!applied.ok) return applied
  const snapshot = applied.snapshot
  const was = blocksOf(input.current)
  const sp = input.space
  const profile = sp.profile
  const offerings = (profile?.offerings ?? []).filter((o) => str(o.title))
  const carried: string[] = []

  const hero = firstOf(was, 'ServicesHero', 'DesignerHero', 'MidnightHero', 'TempleHero', 'CyberWitchHero', 'FreeHumanHero', 'NetworkKitHero')
  const stories = allOf(was, 'ServicesStory')
  const steps = firstOf(was, 'ServicesSteps')
  const trust = firstOf(was, 'ServicesTrust')
  const cta = firstOf(was, 'SpaceCTA')
  const contact = firstOf(was, 'SpaceContact')
  const closer = firstOf(was, 'ServicesContact')

  const setProps = (type: string, fn: (p: Props, page: string) => Props | null) => {
    for (const page of snapshot.pages) {
      for (const b of (page.doc as Data).content ?? []) {
        if (b.type !== type) continue
        const next = fn((b.props ?? {}) as Props, page.slug)
        if (next) { b.props = { ...(b.props as Props), ...next }; if (next.sample === false) carried.push(`${page.slug}/${type}`) }
      }
    }
  }
  /** Sample rows out of a live block: the Space's own rows draw, or the honest empty state. */
  const clearRows = (type: string, keys: string[]) => setProps(type, () => Object.fromEntries(keys.map((k) => [k, []])))

  // The hero: the owner's heading and line, their photo, their button; the kit's neighbourhood strip and proof go.
  const heroTitle = str(hero?.title) || str(sp.siteHero?.heading)
  const heroLead = str(hero?.lead) || str(sp.siteHero?.tagline) || str(sp.tagline)
  setProps('NewWorldHero', () => ({
    eyebrow: str(profile?.address),
    ...(heroTitle ? { title: heroTitle } : {}),
    ...(heroLead ? { lead: heroLead } : {}),
    primaryLabel: str(hero?.primaryLabel) || str(sp.headerCta?.label) || 'Book your first visit',
    primaryHref: '~/booking',
    secondaryLabel: str(hero?.secondaryLabel),
    secondaryHref: str(hero?.secondaryLabel) ? '#events' : '',
    proof: '',
    aside: '',
    image: imageUrl(hero?.image) || sp.coverUrl || '',
    alt: str(hero?.alt) || sp.name,
    rows: [],
    areas: [],
    sample: !(heroTitle && heroLead),
  }))

  // The numbers band: the trust strip's figures, or nothing invented.
  const figures = arr(trust?.items).filter((i) => str(i.title))
  setProps('NewWorldStats', () => ({
    items: figures.map((i, n) => ({ icon: ['award', 'clock', 'eye', 'users'][n % 4], value: str(i.title), label: str(i.line), note: '' })),
    sample: figures.length === 0,
  }))

  // The story: the first editorial on the old site.
  const story = stories[0] ?? null
  if (story) {
    setProps('NewWorldStory', () => ({
      eyebrow: str(story.eyebrow) || 'Our story',
      title: str(story.title),
      paragraphs: list(story.paragraphs),
      image: imageUrl(story.image),
      alt: str(story.alt) || sp.name,
      quote: '',
      quoteBy: '',
      secondaryLabel: '',
      secondaryHref: '',
      sample: false,
    }))
  }

  // How it works: the steps become the first-visit walk-through.
  const stepRows = arr(steps?.rows).filter((r) => str(r.title))
  if (stepRows.length) {
    setProps('NewWorldFirstVisit', () => ({
      eyebrow: str(steps?.eyebrow) || 'How it works',
      title: str(steps?.title) || 'Your first *visit.*',
      lede: str(steps?.lede),
      note: '',
      rows: stepRows.map((r) => ({ title: str(r.title), body: str(r.body) })),
      sample: false,
    }))
  } else {
    clearRows('NewWorldFirstVisit', ['rows'])
  }
  // The kit's generic "how a first time goes" duplicates the walk-through, so it carries no sample rows either.
  clearRows('NewWorldProcess', ['rows'])

  // The ways in: the Space's own services catalogue, priced as it says.
  const ways = offerings.map((o) => ({ icon: 'calendar', meta: minutes(o), name: str(o.title), body: str(o.blurb), price: offeringPrice(o), href: '~/booking' }))
  setProps('NewWorldOffers', () => ({ rows: ways, buttonLabel: ways.length ? 'Book a time' : '', buttonHref: ways.length ? '~/booking' : '', sample: ways.length === 0 }))
  setProps('NewWorldWayRows', () => ({
    rows: offerings.map((o) => ({ icon: 'calendar', tags: minutes(o), name: str(o.title), body: str(o.blurb), price: offeringPrice(o) || 'Ask', when: 'By appointment', image: '', alt: '', buttonLabel: 'Book a time', href: '~/booking' })),
    sample: offerings.length === 0,
  }))
  setProps('NewWorldBook', () => ({
    ways: offerings.map((o) => ({ name: str(o.title), body: str(o.blurb), meta: [offeringPrice(o), minutes(o)].filter(Boolean).join(' · '), href: '~/booking' })),
    facts: [],
    rows: [],
    sample: offerings.length === 0,
  }))

  // Live blocks: the Space's rows draw (LIVE-2053); no sample row stays.
  clearRows('NewWorldGroups', ['rows'])
  clearRows('NewWorldCalendar', ['rows'])
  clearRows('NewWorldReviews', ['rows'])
  clearRows('NewWorldTeam', ['rows'])
  clearRows('NewWorldPlans', ['rows'])
  clearRows('NewWorldOpenings', ['rows'])
  clearRows('NewWorldGallery', ['images'])
  clearRows('NewWorldPosts', ['rows'])
  clearRows('NewWorldShop', ['rows'])
  setProps('NewWorldGroups', () => ({ image: '', featureName: '', alt: '' }))
  setProps('NewWorldFaq', () => ({ rows: [], areas: [], phone: str(profile?.phone), email: str(profile?.email), hours: str(profile?.hours), sample: false }))
  setProps('NewWorldWhere', () => ({
    address: str(profile?.address),
    phone: str(profile?.phone),
    email: str(profile?.email),
    hours: hoursRowsOf(profile?.hours),
    areas: [],
    image: '',
    alt: '',
    sample: !str(profile?.address),
  }))

  // The contact form's own line and the closing call.
  if (contact) setProps('NewWorldAsk', () => ({ eyebrow: str(contact.eyebrow) || 'Say hello', title: str(contact.title) || str(contact.heading) || 'Ask us *anything.*', lede: plain(contact.body), buttonLabel: str(contact.submitLabel) || 'Send', successMessage: plain(contact.successMessage) || 'Thanks. A person will reply soon.', sample: false }))
  if (closer) setProps('NewWorldCloser', () => ({ aside: str(closer.lede), title: str(closer.title) || 'Book your *first visit.*', primaryLabel: str(closer.buttonLabel) || 'Book your first visit', primaryHref: '~/booking', secondaryLabel: '', secondaryHref: '', note: '', sample: false }))

  // The story page: the second editorial opens it, the first and the about column tell the whole of it, the quote is the owner's.
  const second = stories[1] ?? story
  if (second) {
    setProps('NewWorldAboutHero', () => ({
      eyebrow: str(second.eyebrow) || 'Our story',
      title: str(second.title),
      lead: list(second.paragraphs)[0] ?? '',
      chips: [],
      primaryLabel: str(hero?.primaryLabel) || str(sp.headerCta?.label) || 'Book your first visit',
      primaryHref: '~/booking',
      secondaryLabel: '',
      secondaryHref: '',
      image: imageUrl(second.image) || sp.logoUrl || '',
      alt: str(second.alt) || sp.name,
      name: sp.name,
      role: roleOf(profile),
      sample: false,
    }))
    const paragraphs = [...list(second.paragraphs).slice(1), ...(story && story !== second ? list(story.paragraphs) : []), ...(str(sp.about) ? [str(sp.about)] : [])]
    setProps('NewWorldLongStory', () => ({ eyebrow: 'The story', title: str(second.title) || 'How this *room works.*', paragraphs, sample: paragraphs.length === 0 }))
  }
  const quote = str(cta?.quote)
  setProps('NewWorldQuote', () => (quote ? { quote, by: sp.name, sample: false } : { quote: '', by: '' }))

  return { ok: true, snapshot, carried }
}

interface NewWorldSiteSqlInput {
  spaceId: string
  /** The websiteEditor revision the export was taken at; the write fails loudly when the owner has saved since. */
  revision: number
  snapshot: WebsiteSnapshot
  /** The key-scoped preferences patch (megaTheme, theme, siteStyle) from planMegaTheme plus the dials. */
  preferencesPatch: Record<string, unknown>
  author?: string
  now?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function dollar(value: unknown): string {
  const json = JSON.stringify(value)
  if (json.includes('$j$')) throw new Error('JSON contains the quote tag')
  return `$j$${json}$j$::jsonb`
}

/** The SQL that publishes the snapshot and records the theme choice, in one transaction, through the editor's own guarded
 *  writers. The revision check means a site the owner saved after the export is left alone and the run says so. */
export function newWorldSiteSql(input: NewWorldSiteSqlInput): string {
  if (!UUID.test(input.spaceId)) throw new Error('spaceId must be a uuid')
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error('revision must be a whole number')
  const next = input.revision + 1
  const author = (input.author ?? 'Claude').replace(/[^A-Za-z0-9 ._-]/g, '')
  const now = input.now ?? new Date().toISOString()
  if (!/^[0-9TZ:.-]+$/.test(now)) throw new Error('now must be an ISO timestamp')
  const pub = structuredClone(input.snapshot)
  pub.pages.forEach((p) => { p.comments = [] })
  delete pub.themes
  delete pub.activeTheme
  const snap = dollar(pub)
  return [
    `-- LIVE-2052: ${input.spaceId} wears New World (revision ${input.revision} -> ${next}). Frequency Community project. Idempotent: a second run fails on the revision and writes nothing.`,
    'begin;',
    'do $$',
    'begin',
    `  if not public.save_website_editor('${input.spaceId}'::uuid, ${input.revision}, jsonb_build_object(`,
    `    'v', 1, 'revision', ${next}, 'draft', ${snap}, 'published', ${snap}, 'scheduled', null,`,
    `    'versions', jsonb_build_array(jsonb_build_object('id', '${next}', 'createdAt', '${now}', 'author', '${author}', 'snapshot', ${snap}))`,
    `      || coalesce((select jsonb_agg(v.value) from jsonb_array_elements(coalesce((select preferences->'websiteEditor'->'versions' from public.spaces where id = '${input.spaceId}'::uuid), '[]'::jsonb)) with ordinality v(value, n) where v.n <= 7), '[]'::jsonb)`,
    '  ), true) then',
    `    raise exception 'The website moved past revision ${input.revision}; export it again and regenerate.';`,
    '  end if;',
    `  if not public.set_space_preferences('${input.spaceId}'::uuid, ${dollar(input.preferencesPatch)}) then`,
    `    raise exception 'The preferences patch did not land.';`,
    '  end if;',
    'end $$;',
    'commit;',
    '',
  ].join('\n')
}
