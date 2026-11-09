import type { MegaNicheId } from '@/lib/theme/mega-theme'
import { CYBERWITCH_ACCENTS } from '@/lib/theme/cyberwitch'
import type { KitPage, SiteKit } from './types'

// CyberWitch's six starter kits (design system "CyberWitch", frequency/kits.cyberwitch.json): General, Practitioner, Witch and reader, Band
// or artist, Brand or label, Studio or maker. Each seeds writing prompts, three offers, the Frequency tools it runs and a starting accent;
// a kit never changes colour or type beyond the accent (the zip's rule 2). They stand on the six niche doors the kit engine knows
// (general, coaches, wellness, creators, markets, studios) so the Space picker and the starter site find them.
//
// BLOCKS. Until CyberWitch cuts its own, the pages are built from the Services block family (components/page-editor/blocks/services.tsx),
// which the CyberWitch skin re-draws (components/sites/cyberwitch-blocks-css.ts), exactly as New World's do.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): the design's own prompts, except where they make a claim. Reviews are prompts
// to write a real one, never a made-up quote with a made-up name; prices are left for the owner to set; the em dashes in the design's
// copy became colons and commas. The first three offers, people and events are `{{slot|sample words}}` tokens
// (lib/spaces/content-slots.ts), so a Space that has filled in its own shows those instead. Practitioner wears Ice, not the design's Volt,
// because Volt is a violet and the violet family is retired (ADR-1792).

/** The Frequency tools a kit turns on (design kits.cyberwitch.json tools). */
type CyberWitchTool = 'book' | 'sell' | 'belong' | 'publish' | 'gather' | 'learn'
type CyberWitchKitId = 'general' | 'practitioner' | 'reader' | 'band' | 'brand' | 'studio'
type CyberWitchAccent = keyof typeof CYBERWITCH_ACCENTS

export const CYBERWITCH_KIT_IDS: readonly CyberWitchKitId[] = ['general', 'practitioner', 'reader', 'band', 'brand', 'studio']
/** The niche door each kit stands on. */
export const CYBERWITCH_KIT_NICHE: Record<CyberWitchKitId, MegaNicheId> = { general: 'general', practitioner: 'coaches', reader: 'wellness', band: 'creators', brand: 'markets', studio: 'studios' }

type CyberWitchKit = Omit<SiteKit, 'theme' | 'niche'> & { theme: 'CyberWitch'; niche: MegaNicheId; kit: CyberWitchKitId; tools: readonly CyberWitchTool[] }

type Block = KitPage['blocks'][number]
type Pair = readonly [string, string]
type SectionCopy = { title: string; em: string; lede?: string }
type Section = 'circles' | 'events' | 'firstnight' | 'reviews' | 'team' | 'services' | 'plans' | 'shop' | 'cta'

interface Spec {
  label: string
  description: string
  accent: CyberWitchAccent
  name: string
  descriptor: string
  owner: string
  role: string
  /** Who a review prompt asks for a quote from. */
  person: string
  tools: readonly CyberWitchTool[]
  cta: string
  cta2: string
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: readonly string[]
  story2: Pair
  quote: string
  /** name, when, line */
  groups: readonly (readonly [string, string, string])[]
  events: readonly (readonly [string, string, string])[]
  offers: readonly { name: string; meta: string; dur: string }[]
  trust: readonly Pair[]
  reviewsAbout: readonly string[]
  team: readonly Pair[]
  posts: readonly Pair[]
  plans: readonly Pair[]
  products: readonly Pair[]
  firstVisit: readonly Pair[]
}

/** The design's section titles (kits.cyberwitch.json blocks), in the voice every CyberWitch headline has: a claim and a lit last phrase. */
const COPY: Record<Section, SectionCopy> = {
  circles: { title: 'What I', em: 'offer.', lede: 'The ways to work together, each with how often and how long.' },
  events: { title: "What's", em: 'coming.', lede: 'Dates on the calendar. RSVP and we remind you.' },
  firstnight: { title: 'Your first', em: 'time.', lede: 'Walking in cold is the hardest part. Here is exactly what happens.' },
  reviews: { title: 'In their', em: 'words.', lede: 'People who have been, in their own words.' },
  team: { title: 'Who you', em: 'will meet.', lede: 'The people behind it.' },
  services: { title: 'Ways', em: 'in.', lede: 'Everything is priced in plain sight, with a length next to it.' },
  plans: { title: 'Keep', em: 'coming back.', lede: 'Pick a rhythm. Pause or change it any time.' },
  shop: { title: 'Take some', em: 'home.', lede: 'A few things made here. Picked up or sent.' },
  cta: { title: 'Start', em: 'here.' },
}

const SPECS: Record<CyberWitchKitId, Spec> = {
  general: {"label": "General", "description": "A page for whatever you do: say it in five words, show your offers and make booking easy.", "accent": "hex", "name": "Your Name", "descriptor": "What you do, in three words", "owner": "Your name", "role": "Your title", "person": "client", "tools": ["book", "publish", "sell", "belong", "gather"], "cta": "Book a session", "cta2": "See what I offer", "hero": {"eyebrow": "What you do · Where", "title": "Tell it plainly", "em": "in five words.", "body": "Two sentences: who this is for, and what changes for them after working with you. Then stop."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "Your entry offer", "meta": "What someone gets the first time. Make it easy to say yes.", "dur": "Length"}, {"name": "Your core offer", "meta": "The thing you're known for. What it includes, plainly.", "dur": "Length"}, {"name": "Your deep offer", "meta": "The big commitment. Who it's for and what it costs them in time.", "dur": "Length"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  practitioner: {"label": "Practitioner", "description": "For therapists, coaches and somatic workers: name the work, book a first session, no fixing.", "accent": "ice", "name": "Your Practice", "descriptor": "Somatic · therapy · coaching", "owner": "Your name", "role": "Your title", "person": "client", "tools": ["book", "publish", "belong"], "cta": "Book a first session", "cta2": "See what I offer", "hero": {"eyebrow": "Your modality · In person & online", "title": "Name the work", "em": "without the jargon.", "body": "Who you help, what they're carrying when they arrive, and how they feel when they leave. Two sentences, no clinical language."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "Intro call", "meta": "What happens in it. How long. That it's free or what it costs.", "dur": "20 min"}, {"name": "Session", "meta": "Your main session, plainly described.", "dur": "60–90 min"}, {"name": "Container", "meta": "Your multi-week programme. Who it's for.", "dur": "Weeks"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  reader: {"label": "Witch & reader", "description": "For witches, readers and ritual workers: your craft, your readings and a way to book one.", "accent": "absinthe", "name": "Your Craft", "descriptor": "Readings · ritual · spellwork", "owner": "Your name", "role": "Your title", "person": "client", "tools": ["book", "publish", "sell"], "cta": "Book a reading", "cta2": "See what I offer", "hero": {"eyebrow": "Your craft · Remote or in person", "title": "Name what you read", "em": "and what you don't.", "body": "What a reading with you is like, who comes to you, and the line you won't cross. Two sentences."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "A short reading", "meta": "One question. What they receive and how.", "dur": "20 min"}, {"name": "Full reading", "meta": "Your signature reading. What it covers.", "dur": "60 min"}, {"name": "Ritual / spellwork", "meta": "What you do, what it asks of the client.", "dur": "Varies"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  band: {"label": "Band / artist", "description": "For bands and artists: the next show, the record and the merch, in that order.", "accent": "blood", "name": "Your Band", "descriptor": "Genre · city · year", "owner": "Your name", "role": "Your title", "person": "fan", "tools": ["gather", "sell", "publish"], "cta": "Get tickets", "cta2": "Listen", "hero": {"eyebrow": "New record · on tour", "title": "Name your sound", "em": "in five words.", "body": "The record, the next show, and where to hear it. Two sentences."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "Next show", "meta": "Date, city, venue. One line on why this one.", "dur": "Night"}, {"name": "The record", "meta": "Title, format, what's in the box.", "dur": "LP / CD / digital"}, {"name": "Merch", "meta": "What you've made and how many.", "dur": "Limited"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  brand: {"label": "Brand / label", "description": "For labels and brands: the drop, the story and a shop that is easy to use.", "accent": "ice", "name": "Your Brand", "descriptor": "What you make · since", "owner": "Your name", "role": "Your title", "person": "customer", "tools": ["sell", "publish", "belong"], "cta": "Shop the drop", "cta2": "About", "hero": {"eyebrow": "New drop · ships worldwide", "title": "Name what you make", "em": "and why it's different.", "body": "What it is, who wears / uses it, and the thing you refuse to compromise on. Two sentences."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "The hero product", "meta": "The one thing to buy first.", "dur": "In stock"}, {"name": "The collection", "meta": "What's in it, how it's made.", "dur": "Ongoing"}, {"name": "The club", "meta": "Early access, members-first drops.", "dur": "Monthly"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  studio: {"label": "Studio / maker", "description": "For tattoo, art and craft studios: your books, your consultation and your work.", "accent": "venom", "name": "Your Studio", "descriptor": "Tattoo · art · craft", "owner": "Your name", "role": "Your title", "person": "client", "tools": ["book", "sell", "publish"], "cta": "Request a booking", "cta2": "See what I offer", "hero": {"eyebrow": "Books open · Your City", "title": "Name what you make", "em": "and how to get it.", "body": "Your style, how booking works, and how long the wait is. Two sentences."}, "story": ["Where this started: the moment you knew this was the work. One honest paragraph.", "How you work now: your method, your rules, what you refuse to do.", "Who it's for, and who it isn't for. Be specific; the right people will recognise themselves."], "story2": ["Why I", "do this."], "quote": "One line you'd say to a client on day one.", "groups": [["Your main offer", "How often · how long", "One sentence on what happens."], ["A second offer", "How often · how long", "Who it suits better than the first."], ["Something ongoing", "Weekly / monthly", "The thing people stay for."], ["A way to try it", "One-off", "Low commitment, clear outcome."]], "events": [["A dated thing", "Workshop, show, drop, retreat: what and why it's worth showing up.", "Sat 12"], ["Another date", "Keep it to one line. Say who it's for.", "Thu 17"], ["Something coming", "A launch, a tour date, an open call.", "Fri 25"]], "offers": [{"name": "Consultation", "meta": "What you discuss, how long it takes.", "dur": "30 min"}, {"name": "Session", "meta": "Your standard work, what affects the price.", "dur": "Hours"}, {"name": "Custom work", "meta": "Large or custom work. How you take it on.", "dur": "Weeks"}], "trust": [["000 clients", "A real number you can stand behind"], ["00 years", "How long you've done this"], ["0 in 10", "Come back, refer, or rebook"], ["One promise", "Something you always do"]], "reviewsAbout": ["Which offer", "Which offer", "Which offer"], "team": [["Your name", "Your title"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Essay", "The idea you keep coming back to"], ["Guide", "What a first session / show / order is actually like"], ["Note", "What's new this month"], ["Story", "The thing that changed your mind"]], "plans": [["Entry", "What's included"], ["Core", "What's included"], ["Inner", "What's included"]], "products": [["A thing you make", "One line on it"], ["A gift option", "Who it's for"], ["A limited run", "Why it's limited"]], "firstVisit": [["Before", "What happens when someone books. What they get from you."], ["During", "What the first session / show / order is actually like."], ["What to bring", "Or what to have ready. Say \"nothing\" if nothing."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
}

/** The six kits' words (this file's source of truth); the Spotlight layouts read the same rows (lib/spotlight/cyberwitch-kit-content.ts). */
export const CYBERWITCH_KIT_SPECS = SPECS

/** The zip's picture for a kit's accent: the hero strip and the founder portrait each ship once per accent. */
const photo = (s: Spec, kind: 'hero' | 'founder') => `/sites/cyberwitch/photos/${kind}-${s.accent}.jpg`
const slot = (key: string, sample: string) => `{{${key}|${sample}}}`
const star = (c: { title: string; em: string }) => (c.em ? `${c.title} *${c.em}*` : c.title)
const copy = (_s: Spec, k: Section): SectionCopy => COPY[k]
const head = (c: SectionCopy, eyebrow: string) => ({ eyebrow, title: star(c), lede: c.lede ?? '' })

function pages(s: Spec): KitPage[] {
  const offers = s.offers.map((o, i) => ({
    name: slot(`offer${i + 1}Title`, o.name), meta: o.dur, body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, 'Set your price'), href: '~/booking',
  }))
  const hero: Block = {
    type: 'ServicesHero',
    props: {
      look: 'photo', eyebrow: s.hero.eyebrow, title: `${s.hero.title} *${s.hero.em}*`, lead: s.hero.body,
      primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: s.cta2, secondaryHref: '~/services', proof: '', image: photo(s, 'hero'), alt: s.hero.title + ' ' + s.hero.em,
      // The design's own hero (THEME_LOOK hero: 'photo'): the neon-wall picture full bleed under an iron scrim, the words on the left,
      // nothing over the figure on the right, so no booking panel.
      panelTitle: 'Book online', panelNote: 'Pick a time', offers: [], areas: [],
    },
  }
  const trust: Block = { type: 'ServicesTrust', props: { items: s.trust.map(([title, line]) => ({ title, line })) } }
  const groups: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'circles'), 'Groups'), buttonLabel: 'Book a spot', buttonHref: '~/booking', rows: s.groups.map(([name, when, line]) => ({ meta: when, name, body: line, price: '', href: '~/booking' })) },
  }
  const first: Block = { type: 'ServicesSteps', props: { ...head(copy(s, 'firstnight'), 'Your first visit'), rows: s.firstVisit.map(([title, body]) => ({ title, body })) } }
  const events: Block = {
    type: 'ServicesEvents',
    props: {
      ...head(copy(s, 'events'), 'Events'), buttonLabel: '', buttonHref: '',
      rows: s.events.map(([title, body], i) => ({ meta: '', title: slot(`event${i + 1}Title`, title), body, price: '', href: '~/booking', featured: i === 0 })),
    },
  }
  const reviews: Block = {
    type: 'ServicesReviews',
    props: {
      ...head(copy(s, 'reviews'), 'Reviews'), proof: '',
      rows: s.reviewsAbout.map((what, i) => ({ quote: `Replace with a real quote from a real ${s.person}. Specific beats glowing.`, who: `${s.person[0].toUpperCase()}${s.person.slice(1)} ${['one', 'two', 'three'][i] ?? i + 1}`, what })),
    },
  }
  const team: Block = {
    type: 'ServicesTeam',
    props: { ...head(copy(s, 'team'), 'The team'), rows: s.team.map(([name, role], i) => ({ name: slot(`person${i + 1}Name`, i === 0 ? s.owner : name), role: i === 0 ? s.role : role, image: '', alt: '' })) },
  }
  const posts: Block = {
    type: 'ServicesPosts',
    props: { eyebrow: 'Notes', title: 'Worth *a read.*', lede: '', buttonLabel: '', buttonHref: '', rows: s.posts.map(([kind, title]) => ({ meta: kind, title, body: '', price: '', href: '', image: '', alt: '' })) },
  }
  const plans: Block | null = s.plans
    ? { type: 'ServicesPlans', props: { ...head(copy(s, 'plans'), 'Plans'), rows: s.plans.map(([title, body], i) => ({ meta: '', title, body, price: 'Set your price', href: '~/booking', featured: i === 1 })) } }
    : null
  const shop: Block | null = s.products
    ? { type: 'ServicesShop', props: { ...head(copy(s, 'shop'), 'Shop'), buttonLabel: 'Open the shop', buttonHref: '~/services', rows: s.products.map(([title, body]) => ({ meta: '', title, body, price: 'Set your price', href: '', image: '', alt: '' })) } }
    : null
  const list: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'services'), 'Services'), buttonLabel: 'See open times', buttonHref: '~/booking', rows: offers.map((o) => ({ meta: o.meta, name: o.name, body: o.body, price: o.price, href: o.href })) },
  }
  const faq: Block = {
    type: 'ServicesFaq',
    props: {
      eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.',
      rows: [
        { question: 'Do I need to book?', answer: 'You can. Booking holds your spot and sends a reminder. Say here if people can also just walk in.' },
        { question: 'What if I cannot make it?', answer: 'Change or cancel from the confirmation email. Say how late is too late.' },
        { question: 'Is it okay to come alone?', answer: 'Say yes if it is, and say what happens when someone does.' },
      ],
      facts: [], areas: [],
    },
  }
  const band: Block = {
    type: 'ServicesBand',
    props: { eyebrow: 'Next opening', title: star(copy(s, 'cta')), primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: '', secondaryHref: '' },
  }
  const story: Block = {
    type: 'ServicesStory',
    props: { eyebrow: 'Our story', title: `${s.story2[0]} *${s.story2[1]}*`, paragraphs: s.story, buttonLabel: 'Meet the people', buttonHref: '~/about', image: '/sites/cyberwitch/photos/story.jpg', alt: 'A wall in the alley, wheatpasted' },
  }
  const booking: Block = {
    type: 'ServicesBooking',
    props: {
      eyebrow: 'Book online', title: 'Next *openings.*', lede: 'Live availability. Pick a time, see the total, get a confirmation.', buttonLabel: s.cta, buttonHref: '~/booking',
      rows: s.groups.map(([name, when, line]) => ({ day: when, title: name, meta: line, time: '', href: '~/booking' })),
    },
  }
  const contact: Block = {
    type: 'ServicesContact',
    props: { eyebrow: 'Get in touch', title: 'Ask us *anything.*', lede: 'A person answers. Usually the same day.', body: '', buttonLabel: 'Send a message', buttonHref: '~/booking', secondaryLabel: '', secondaryHref: '' },
  }
  const locations: Block = {
    type: 'ServicesLocations',
    props: {
      eyebrow: 'Locations and hours', title: 'Where to *find us.*', lede: '', address: slot('address', 'Your street, Your City'), phone: slot('phone', 'Your phone'),
      email: slot('email', 'Your email'), hours: [], areas: [], image: '', alt: '',
    },
  }
  const letter: Block = {
    type: 'ServicesLetter',
    props: { eyebrow: 'Newsletter', title: 'Stay in *the loop.*', lede: 'A short note when something is coming up. Nothing else.', buttonLabel: 'Join the list', buttonHref: '~/booking' },
  }
  const compact = (xs: (Block | null)[]) => xs.filter((b): b is Block => b !== null)
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo(s.name, s.descriptor), blocks: compact([hero, trust, groups, first, events, reviews, band]) },
    { slug: 'services', label: 'Services', seo: seo('Services', `${s.name}: what is on and what it costs.`), blocks: compact([list, plans, shop, faq, band]) },
    { slug: 'about', label: 'About', seo: seo('About', `Who is behind ${s.name}.`), blocks: compact([story, team, posts, locations, letter]) },
    { slug: 'booking', label: 'Book', seo: seo('Book', `Pick a time at ${s.name}.`), blocks: compact([booking, contact]) },
  ]
}

export function cyberwitchKit(kit: CyberWitchKitId): CyberWitchKit {
  const s = SPECS[kit]
  return {
    id: `cyberwitch-${kit}`, version: 1, theme: 'CyberWitch', niche: CYBERWITCH_KIT_NICHE[kit], kit, label: s.label, description: s.description,
    tools: s.tools, accent: CYBERWITCH_ACCENTS[s.accent].accent,
    pages: pages(s),
  }
}
