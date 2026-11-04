// SERVICES KIT SPOTLIGHT CONTENT. PURE.
// What the six Spotlight layouts (components/spotlight/services-kit-layouts.tsx) show for each of the sixteen Services trade
// kits. Ported from the Services design's kits.js and record.js (reference/ui_kits/site): the hero, the services, the open
// times and the doors. The doors are built exactly as record.js builds DOORS: one door per service, then one per Frequency
// function the kit's tools turn on, in the design's order. Everything a kit invents (prices, open times, reviews, the review
// score, the quote) is sample content: a live page passes `sample: false` and gets none of it, so no invented price, time or
// testimonial ships. The kit holds words and rows only; colour and type are the theme's.

import { SERVICES_ACCENTS, type ServicesAccentId } from '@/lib/theme/services'

type Tool = 'publish' | 'gather' | 'belong' | 'book' | 'learn' | 'sell'
type Has = 'events' | 'products' | 'plans' | 'posts' | 'team'
/** The design's icon names; the layouts map each to a lucide icon. */
type IconName = 'message' | 'sparkle' | 'calendar' | 'shield' | 'star' | 'award' | 'wrench' | 'home' | 'clock' | 'leaf' | 'heart' | 'chart' | 'briefcase' | 'tag' | 'bolt' | 'car' | 'droplet' | 'users' | 'sun' | 'user' | 'mail' | 'eye' | 'pin' | 'check'

interface ServicesDoor { id: string; key: Tool; icon: IconName; title: string; meta: string; href: string }
interface ServicesOffer { name: string; price: string; dur: string; icon: IconName }
interface ServicesOpening { mon: string; day: string; title: string; time: string; where: string; left: number }
interface ServicesReview { q: string; who: string; what: string }

export interface ServicesSpotlightContent {
  kit: string
  accent: ServicesAccentId
  name: string
  descriptor: string
  owner: string
  role: string
  story: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string | null }
  cta: { label: string; href: string }
  /** The kit's second button. */
  secondaryCta: string
  /** The ways in after the booking door (record.js DOORS.slice(1)). */
  doors: ServicesDoor[]
  offers: ServicesOffer[]
  openings: ServicesOpening[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  review: ServicesReview | null
  secondReview: ServicesReview | null
  quote: { text: string; who: string; role: string } | null
  proof: { icon: IconName; label: string; sub: string } | null
  letter: { title: string; em: string; body: string; action: string } | null
  headings: { openings: { title: string; em: string }; services: { title: string; em: string } }
  defaultLayout: ServicesLayoutKey
  layouts: ServicesLayoutKey[]
}

export type ServicesLayoutKey = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'

interface KitSource {
  name: string; descriptor: string; owner: string; role: string; accent: string; cta: string
  tools: Tool[]; has: Has[]
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: string; quote: string; proof: [IconName, string, string]; reviewsMeta: string
  offers: [string, string, string, IconName][]
  reviews: [string, string, string][]
}

const KITS: Record<string, KitSource> = {
  general: {
    name: "Your Business", descriptor: "Service business", owner: "Alex Rivera", role: "Owner", accent: "tide", cta: "Book a visit",
    tools: ["book","sell","belong","publish","gather"], has: ["events","products","plans","posts","team"],
    hero: { eyebrow: "Booking now · Your City", title: "Good work,", em: "done right.", body: "Clear prices, on-time arrivals and work finished properly the first time. Book online in about a minute." },
    story: "A small team that answers the phone, shows up on time and takes pride in the details. The person you talk to when you book is part of the team doing the work.", quote: "Do the job right, explain it clearly and leave the place better than we found it.", proof: ["shield","Licensed & insured","Fully covered on every job"], reviewsMeta: "4.9 from 120 reviews",
    offers: [["Consultation", "Free", "30 min", "message"], ["Signature service", "From $120", "2 hr", "sparkle"], ["Ongoing care", "From $90 / mo", "Monthly", "calendar"]],
    reviews: [["Booked on Monday, done by Wednesday. They explained everything and the price was exactly what the site said.", "Priya S.", "Signature service"], ["On time, tidy and friendly. We moved to the monthly plan after the first visit.", "Marcus L.", "Ongoing care"]],
  },
  home: {
    name: "Harbor Home Co.", descriptor: "Home repair & maintenance", owner: "Sam Ortega", role: "Owner · Lead tech", accent: "signal", cta: "Book a repair",
    tools: ["book","belong","publish"], has: ["plans","posts","team"],
    hero: { eyebrow: "Same-week repairs · Your City", title: "Fixed right,", em: "the first time.", body: "Repairs, installs and seasonal upkeep from a licensed local team. Upfront prices and a one-year workmanship warranty." },
    story: "Harbor started with one truck and a simple rule: arrive when we say, quote before we start and clean up before we leave. Every tech is trained in-house, background-checked and covered.", quote: "Treat every house like your own and every customer like a neighbor, because they usually are.", proof: ["shield","Licensed & insured","License no. 000000"], reviewsMeta: "4.9 from 340 reviews",
    offers: [["Handyman visit", "From $95 / hr", "1 hr min", "wrench"], ["Home tune-up", "From $180", "3 hr", "home"], ["Care plan", "From $40 / mo", "Yearly", "calendar"]],
    reviews: [["Fixed a leak two other companies could not find. Clear quote, clean work, gone in an hour.", "Rachel T.", "Handyman visit"], ["The tune-up caught a failing seal before it became a real problem. Worth every dollar.", "Owen B.", "Home tune-up"]],
  },
  wellness: {
    name: "Still Studio", descriptor: "Massage & bodywork", owner: "Maya Chen", role: "Founder · LMT", accent: "bloom", cta: "Book a session",
    tools: ["book","belong","sell","publish","gather"], has: ["events","products","plans","posts","team"],
    hero: { eyebrow: "Open this week · Your City", title: "Slow down,", em: "feel better.", body: "Licensed massage and bodywork in a calm, private studio. Book online, arrive, and let the rest wait an hour." },
    story: "Still Studio is a small, quiet space built for one thing: an hour that is fully yours. Every therapist is licensed, and every session starts with a short conversation about what you need.", quote: "Everyone deserves an hour where nothing else is asked of them.", proof: ["shield","Licensed therapists","State licensed & insured"], reviewsMeta: "5.0 from 210 reviews",
    offers: [["Intro session", "$65", "60 min", "leaf"], ["Deep tissue", "From $120", "90 min", "heart"], ["Monthly membership", "From $99 / mo", "Monthly", "calendar"]],
    reviews: [["The calmest hour of my month. Booking takes seconds and they remember what I like.", "Ana P.", "Monthly membership"], ["Finally someone who listened before starting. My shoulder has not felt this good in years.", "Chris W.", "Deep tissue"]],
  },
  pro: {
    name: "Field & Pine", descriptor: "Bookkeeping & tax", owner: "Jordan Pike", role: "Founder · CPA", accent: "iris", cta: "Book a call",
    tools: ["book","belong","publish","gather"], has: ["events","plans","posts","team"],
    hero: { eyebrow: "Taking new clients · Your City", title: "Clear books,", em: "calm decisions.", body: "Monthly bookkeeping, payroll and tax for small businesses. Fixed fees, a named accountant and answers within one business day." },
    story: "Field & Pine works with a small number of businesses so every client has a named accountant who knows their numbers. Fees are fixed and agreed up front, so a question never turns into a surprise invoice.", quote: "Good numbers should make decisions easier, not harder.", proof: ["award","Licensed CPAs","Every account reviewed"], reviewsMeta: "4.9 from 85 reviews",
    offers: [["Discovery call", "Free", "20 min", "message"], ["Monthly bookkeeping", "From $350 / mo", "Monthly", "chart"], ["Tax season package", "From $900", "Yearly", "briefcase"]],
    reviews: [["For the first time I understand my own numbers. The monthly report is short and actually useful.", "Tom H.", "Monthly bookkeeping"], ["Tax season used to be a crisis. Now it is a calendar reminder and one meeting.", "Nadia F.", "Tax season package"]],
  },
  trades: {
    name: "Northline Electric", descriptor: "Licensed electricians", owner: "Luis Herrera", role: "Master electrician", accent: "ember", cta: "Book an electrician",
    tools: ["book","publish"], has: ["posts","team"],
    hero: { eyebrow: "24-hour emergency line · Your City", title: "Safe power,", em: "done to code.", body: "Panels, EV chargers, lighting and repairs by licensed electricians. Flat-rate quotes before any work starts." },
    story: "Northline is a crew of licensed electricians who quote flat rates and finish the day they start. Every job is permitted, inspected and backed for two years.", quote: "Do it to code, label everything and never leave a house less safe than we found it.", proof: ["shield","Licensed & bonded","License no. 000000"], reviewsMeta: "4.8 from 410 reviews",
    offers: [["Service call", "From $129", "1 hr", "bolt"], ["EV charger install", "From $1,100", "Half day", "car"], ["Panel upgrade", "From $2,400", "1 day", "shield"]],
    reviews: [["Charger installed, permitted and inspected in one visit. The quote was the bill.", "Grace Y.", "EV charger install"], ["Came at 11pm for a burning smell, found the fault, made it safe. Back the next day to finish.", "Dmitri V.", "Service call"]],
  },
  cleaning: {
    name: "Bright & Co.", descriptor: "Home & office cleaning", owner: "Amara Diallo", role: "Owner", accent: "fern", cta: "Book a clean",
    tools: ["book","belong","sell","publish"], has: ["products","plans","posts","team"],
    hero: { eyebrow: "Weekly, biweekly or once · Your City", title: "Come home", em: "to clean.", body: "Trusted cleaners, the same team each visit and plant-safe products. Book a time and we handle the rest." },
    story: "Bright & Co. sends the same two cleaners every visit, so they learn your home and you learn their names. Every cleaner is background-checked, insured and paid a living wage.", quote: "A clean home should feel like a gift you gave yourself.", proof: ["shield","Insured & bonded","Every cleaner background-checked"], reviewsMeta: "4.9 from 620 reviews",
    offers: [["Standard clean", "From $140", "2.5 hr", "sparkle"], ["Deep clean", "From $260", "5 hr", "droplet"], ["Move in / out", "From $320", "6 hr", "home"]],
    reviews: [["Same two people every other Tuesday for a year. The house has never looked better.", "Elena R.", "Standard clean"], ["The move-out clean got our full deposit back. Worth every cent.", "Jamal W.", "Move in / out"]],
  },
  beauty: {
    name: "Hush Hair", descriptor: "Hair studio", owner: "Noa Levi", role: "Owner · Stylist", accent: "bloom", cta: "Book an appointment",
    tools: ["book","sell","belong","publish","gather"], has: ["events","products","plans","posts","team"],
    hero: { eyebrow: "Now taking new clients · Your City", title: "Hair you", em: "stop thinking about.", body: "Cuts, color and care from a small team that listens first. Book online and pick your stylist." },
    story: "Hush is a four-chair studio where every appointment starts with a conversation, not a mirror. We use low-tox color, charge by the service and never rush a cut.", quote: "Good hair is hair you forget about until someone compliments it.", proof: ["award","Licensed stylists","Trained in-house every season"], reviewsMeta: "4.9 from 380 reviews",
    offers: [["Cut & style", "From $85", "60 min", "sparkle"], ["Color", "From $160", "2.5 hr", "heart"], ["Treatment", "From $55", "30 min", "droplet"]],
    reviews: [["First salon where the cut looked the same when I did it at home.", "Ivy C.", "Cut & style"], ["Balayage that grew out beautifully for months. Booking by stylist is so easy.", "Maren D.", "Color"]],
  },
  fitness: {
    name: "Form Studio", descriptor: "Strength & mobility", owner: "Dre Walker", role: "Head coach", accent: "ember", cta: "Book a free class",
    tools: ["gather","belong","book","sell","publish"], has: ["events","products","plans","posts","team"],
    hero: { eyebrow: "First class free · Your City", title: "Stronger", em: "every week.", body: "Small-group strength and mobility classes, capped at eight. Coaches who know your name and your knees." },
    story: "Form started as six people in a garage. It is still small on purpose: eight per class, every rep watched. Memberships are month to month and you can pause any time.", quote: "Strong is a habit, not a sprint.", proof: ["award","Certified coaches","CSCS and mobility certified"], reviewsMeta: "5.0 from 260 reviews",
    offers: [["First class", "Free", "50 min", "bolt"], ["Personal training", "From $90", "60 min", "users"], ["Movement assessment", "$60", "45 min", "chart"]],
    reviews: [["Two years in and I have never missed a week. The coaches notice everything.", "Tasha B.", "Membership"], ["The assessment found a hip issue three doctors missed. Pain gone in a month.", "Raj P.", "Movement assessment"]],
  },
  pets: {
    name: "Good Dog Co.", descriptor: "Dog walking & grooming", owner: "Hollis Grant", role: "Owner", accent: "fern", cta: "Book a walk",
    tools: ["book","belong","sell","publish"], has: ["products","plans","posts","team"],
    hero: { eyebrow: "Walks, grooming, daycare · Your City", title: "Happy dog,", em: "easy day.", body: "Daily walks, gentle grooming and daycare from people who love dogs more than phones. Book online, get photos after every visit." },
    story: "Good Dog is six walkers and two groomers who all started as dog people first. Every walker is insured, pet first-aid certified and sends a photo and a note after each visit.", quote: "Dogs know who loves them. We hire those people.", proof: ["shield","Insured & certified","Pet first aid on every team"], reviewsMeta: "5.0 from 540 reviews",
    offers: [["Daily walk", "From $28", "30 min", "heart"], ["Full groom", "From $85", "2 hr", "sparkle"], ["Daycare day", "$48", "Full day", "sun"]],
    reviews: [["Same walker every day, photo every day. My anxious rescue now waits by the door.", "Ellie K.", "Daily walk"], ["First groomer who did not scare my old guy. Gentle and quick.", "Marco D.", "Full groom"]],
  },
  tutoring: {
    name: "Bright Mind Tutors", descriptor: "Tutoring & test prep", owner: "Priya Natarajan", role: "Founder", accent: "signal", cta: "Book a free session",
    tools: ["book","learn","belong","publish","gather"], has: ["events","plans","posts","team"],
    hero: { eyebrow: "Online and in person · Your City", title: "Learning that", em: "clicks.", body: "One-to-one tutoring and small-group courses in math, science, writing and test prep. Book a free first session and meet your tutor." },
    story: "Bright Mind matches each student with one tutor who stays with them all year. Tutors are graduate students and teachers, screened and trained in how to explain, not just answer.", quote: "Every student can learn anything with the right explanation and enough patience.", proof: ["award","Screened tutors","Teachers and grad students"], reviewsMeta: "4.9 from 190 reviews",
    offers: [["First session", "Free", "45 min", "message"], ["One-to-one tutoring", "From $65", "60 min", "user"], ["SAT prep course", "$640", "8 weeks", "award"]],
    reviews: [["Her grade went from C to A-minus in a semester. Same tutor every week made the difference.", "Dana M.", "One-to-one tutoring"], ["The SAT course was small enough that he actually asked questions.", "Ruben O.", "SAT prep course"]],
  },
  creative: {
    name: "North Light Studio", descriptor: "Photography", owner: "June Albright", role: "Photographer", accent: "iris", cta: "Book a session",
    tools: ["book","sell","publish","gather"], has: ["events","products","posts","team"],
    hero: { eyebrow: "Booking this season · Your City", title: "Pictures you", em: "keep.", body: "Portraits, families and small brands, shot in natural light. Book a session and see a gallery within a week." },
    story: "North Light is one photographer, one assistant and a lot of window light. Sessions are unhurried, galleries arrive within a week, and you own every image you choose.", quote: "The best photo is the one you still look at in ten years.", proof: ["award","12 years shooting","Published and exhibited"], reviewsMeta: "5.0 from 140 reviews",
    offers: [["Portrait session", "From $350", "90 min", "user"], ["Family session", "From $450", "2 hr", "users"], ["Brand shoot", "From $900", "Half day", "briefcase"]],
    reviews: [["The only family photos where everyone looks like themselves.", "Marta G.", "Family session"], ["Our brand shoot paid for itself in a month. Gallery arrived in five days.", "Theo R.", "Brand shoot"]],
  },
  legal: {
    name: "Hart & Row", descriptor: "Family & estate law", owner: "Evelyn Hart", role: "Partner", accent: "iris", cta: "Book a consultation",
    tools: ["book","publish","gather"], has: ["events","posts","team"],
    hero: { eyebrow: "Taking new matters · Your City", title: "Plain advice,", em: "fixed fees.", body: "Wills, trusts, estates and family matters from a two-partner firm. Fixed fees quoted up front and a lawyer who returns calls." },
    story: "Hart & Row is two partners and a paralegal who believe legal advice should be understandable and priced in advance. Most matters are fixed fee. You know the cost before you say yes.", quote: "If a client cannot explain their own plan back to us, we have not finished.", proof: ["award","Licensed attorneys","Bar no. 000000"], reviewsMeta: "4.9 from 95 reviews",
    offers: [["Initial consultation", "$150", "30 min", "message"], ["Will & powers of attorney", "From $650", "Two meetings", "briefcase"], ["Living trust package", "From $2,400", "Three meetings", "shield"]],
    reviews: [["They explained the trust in words I understood and the fee never moved.", "Harold B.", "Living trust package"], ["Fast, kind and clear during a hard time.", "Simone L.", "Initial consultation"]],
  },
  medical: {
    name: "Elm Street Dental", descriptor: "Family dentistry", owner: "Dr. Lena Okafor", role: "Dentist", accent: "signal", cta: "Book an appointment",
    tools: ["book","belong","publish"], has: ["plans","posts","team"],
    hero: { eyebrow: "New patients welcome · Your City", title: "Gentle care,", em: "clear costs.", body: "Check-ups, cleanings and treatment for the whole family. Prices shown before you book, and a team that explains everything." },
    story: "Elm Street is a two-dentist practice that runs on time and tells you the cost before anything starts. We treat nervous patients every day and never rush a visit.", quote: "Nobody should be surprised in a dental chair, by pain or by price.", proof: ["award","Licensed dentists","Continuing education every year"], reviewsMeta: "4.9 from 720 reviews",
    offers: [["Check-up & clean", "$140", "45 min", "sparkle"], ["Whitening", "$380", "75 min", "sun"], ["Same-day emergency", "From $120", "30 min", "bolt"]],
    reviews: [["First dentist in years that did not make me anxious. Everything explained, nothing upsold.", "Noah P.", "Check-up & clean"], ["Cracked a tooth on Sunday, fixed on Monday morning.", "Ines R.", "Same-day emergency"]],
  },
  events: {
    name: "Table & Field", descriptor: "Catering & events", owner: "Sofia Marini", role: "Chef · Owner", accent: "bloom", cta: "Book a tasting",
    tools: ["book","gather","sell","publish"], has: ["events","products","posts","team"],
    hero: { eyebrow: "Booking this season · Your City", title: "Food people", em: "talk about.", body: "Seasonal menus for weddings, dinners and company events, cooked on site. Book a tasting and let us plan around you." },
    story: "Table & Field cooks seasonal food on site for twenty to four hundred guests. Every event starts with a tasting and ends with a kitchen left cleaner than we found it.", quote: "Cook what is in season, serve it hot and leave the kitchen clean.", proof: ["award","Chef-led","Twelve years of events"], reviewsMeta: "5.0 from 160 reviews",
    offers: [["Tasting", "$95 for two", "90 min", "heart"], ["Private dinner", "From $120 / guest", "Evening", "sparkle"], ["Full event", "From $85 / guest", "Custom", "users"]],
    reviews: [["Guests still ask about the lamb. Everything on time, kitchen spotless after.", "Clara & Tom", "Full event"], ["The tasting sold us. Then the real thing was better.", "Hugo D.", "Tasting"]],
  },
  auto: {
    name: "Driveline Auto", descriptor: "Auto repair & service", owner: "Carlos Mendes", role: "Owner · Master tech", accent: "ember", cta: "Book a service",
    tools: ["book","belong","publish"], has: ["plans","posts","team"],
    hero: { eyebrow: "Same-day service · Your City", title: "Honest repairs,", em: "no surprises.", body: "Diagnostics, maintenance and repairs with photos of every finding and approval before any work. Book online, drop off, done." },
    story: "Driveline is an independent shop that sends photos of every finding and never does work you did not approve. Techs are ASE certified and every repair is warrantied for two years or 24,000 miles.", quote: "Show the customer what you see, then let them decide.", proof: ["award","ASE certified","Every tech"], reviewsMeta: "4.8 from 890 reviews",
    offers: [["Oil & inspection", "From $79", "45 min", "droplet"], ["Diagnostics", "$120", "1 hr", "chart"], ["Brakes", "From $320", "2 hr", "shield"]],
    reviews: [["They sent photos of the worn pads and a price before touching anything. Done by noon.", "Jenna K.", "Brakes"], ["Diagnosed a noise two shops missed and credited the fee to the fix.", "Omar L.", "Diagnostics"]],
  },
  landscaping: {
    name: "Evergreen Grounds", descriptor: "Landscaping & lawn care", owner: "Owen Blake", role: "Owner", accent: "fern", cta: "Book a walk-through",
    tools: ["book","belong","publish","gather"], has: ["events","plans","posts","team"],
    hero: { eyebrow: "Spring bookings open · Your City", title: "Outside,", em: "taken care of.", body: "Lawn care, planting and seasonal clean-ups from a crew that shows up on schedule. Upfront pricing and a free walk-through." },
    story: "Evergreen is a six-person crew that keeps the same yards year after year. We quote by the job, show up on the same day each week and leave the driveway swept.", quote: "A good yard is quiet work done on time, every week.", proof: ["shield","Licensed & insured","Fully covered on site"], reviewsMeta: "4.9 from 310 reviews",
    offers: [["Weekly lawn care", "From $45 / visit", "Weekly", "leaf"], ["Seasonal clean-up", "From $280", "Half day", "sun"], ["Planting & design", "From $1,500", "Custom", "sparkle"]],
    reviews: [["Same crew every Thursday for three years. The yard has never looked better.", "Pat & Ellen R.", "Weekly lawn care"], ["The planting plan turned a dead corner into the best part of the garden.", "Devi S.", "Planting & design"]],
  },
}

/** The twelve Frequency functions (record.js FUNCTIONS): the tool each belongs to, the door it makes and what it says. */
const FUNCTIONS: { id: string; tool: Tool; icon: IconName; door: string; why: string; href: string }[] = [
  { id: 'booking', tool: 'book', icon: 'calendar', door: 'Book online', why: 'Live open times, an upfront total and instant confirmation', href: '/book' },
  { id: 'services', tool: 'book', icon: 'tag', door: 'Services & prices', why: 'Every service shows a price and a length before anyone commits', href: '/services' },
  { id: 'reviews', tool: 'publish', icon: 'star', door: 'Read reviews', why: 'Proof near the main button, and an automatic request after each visit', href: '/reviews' },
  { id: 'posts', tool: 'publish', icon: 'briefcase', door: 'Guides & posts', why: 'Guides and stories that answer the questions people search for', href: '/library' },
  { id: 'events', tool: 'gather', icon: 'users', door: 'Coming up', why: 'Open days, workshops and clinics with RSVP and a reminder', href: '/events' },
  { id: 'shop', tool: 'sell', icon: 'tag', door: 'Shop', why: 'Gift cards, kits and add-ons that sell between visits', href: '/shop' },
  { id: 'plans', tool: 'belong', icon: 'award', door: 'Plans', why: 'Recurring care on a schedule, with member pricing', href: '/plans' },
  { id: 'letter', tool: 'publish', icon: 'mail', door: 'Get the letter', why: 'A short note when something opens up or is due', href: '/letter' },
  { id: 'gallery', tool: 'publish', icon: 'eye', door: 'See the work', why: 'Real photos of real jobs, before and after', href: '/gallery' },
  { id: 'team', tool: 'publish', icon: 'users', door: 'Meet the team', why: 'Faces and names before anyone opens the door', href: '/team' },
  { id: 'locations', tool: 'publish', icon: 'pin', door: 'Find us', why: 'Where, when and how to get there, on every surface', href: '/contact' },
  { id: 'forms', tool: 'book', icon: 'message', door: 'Ask a question', why: 'A short form that reaches a person, with a reply time stated', href: '/contact' },
]
/** Functions every kit gets whatever its tools (record.js build). */
const ALWAYS = ['reviews', 'team', 'locations', 'forms', 'letter', 'gallery', 'posts']
/** A function that needs the kit to carry its rows (record.js drops it when the kit has none). */
const NEEDS: Record<string, Has> = { posts: 'posts', team: 'team', events: 'events', shop: 'products', plans: 'plans' }

/** The kit ids, in the design's order. */
export const SERVICES_SPOTLIGHT_KIT_IDS = Object.keys(KITS)

/** Everything a Services layout shows for a kit. `sample` fills the prices, open times, reviews, the review score and the quote (the
 *  design's sample page); a live page passes false and gets none of them. `accent` and `photo` are the owner's. */
export function servicesKitSpotlightContent(kit: string, opts: { name?: string; sample?: boolean; accent?: string; photo?: string } = {}): ServicesSpotlightContent {
  const id = KITS[kit] ? kit : 'general'
  const k = KITS[id]!
  const sample = opts.sample !== false
  const pick = (a: string | undefined): ServicesAccentId | null => (a && a in SERVICES_ACCENTS ? (a as ServicesAccentId) : null)
  const accent = pick(opts.accent) ?? pick(k.accent) ?? 'tide'
  const offers: ServicesOffer[] = sample ? k.offers.map(([name, price, dur, icon]) => ({ name, price, dur, icon })) : []
  const fns = FUNCTIONS.filter((f) => (k.tools.includes(f.tool) || ALWAYS.includes(f.id)) && (!NEEDS[f.id] || k.has.includes(NEEDS[f.id]!)))
  const ids = fns.map((f) => f.id)
  const doors: ServicesDoor[] = [
    ...offers.map((o, i): ServicesDoor => ({ id: `offer-${i}`, key: 'book', icon: o.icon, title: o.name, meta: `${o.price} · ${o.dur}`, href: '/services' })),
    ...fns.filter((f) => !['booking', 'services'].includes(f.id)).map((f): ServicesDoor => ({
      id: f.id, key: f.tool, icon: f.icon,
      title: f.id === 'team' ? `Meet ${k.owner.split(' ')[0]}` : f.door,
      // The design's review door shows the kit's sample score; a live page says what the door is instead.
      meta: f.id === 'reviews' ? (sample ? k.reviewsMeta : 'What clients say') : f.id === 'team' ? k.role : f.why,
      href: f.href,
    })),
  ]
  // Open times follow record.js OPENINGS: the second service, the first, the second again.
  const o = k.offers
  const openings: ServicesOpening[] = sample && o.length > 1
    ? [
        { mon: 'Nov', day: '06', title: o[1]![0], time: '9:00a', where: o[1]![2], left: 2 },
        { mon: 'Nov', day: '07', title: o[0]![0], time: '1:30p', where: o[0]![2], left: 0 },
        { mon: 'Nov', day: '09', title: o[1]![0], time: '10:00a', where: o[1]![2], left: 1 },
      ]
    : []
  const first = openings[0]
  const hasCalendar = ids.includes('booking') && (!sample || openings.length > 0)
  const layouts: ServicesLayoutKey[] = ['stack', 'card-wall', 'story']
  if (hasCalendar) layouts.push('calendar-first')
  if (ids.includes('services')) layouts.push('shop-front')
  layouts.push('profile')
  return {
    kit: id,
    accent,
    name: opts.name ?? k.name,
    descriptor: k.descriptor,
    owner: k.owner,
    role: k.role,
    story: k.story,
    hero: { ...k.hero, photo: opts.photo ?? null },
    cta: { label: k.cta, href: '/book' },
    secondaryCta: 'See open times',
    doors,
    offers,
    openings,
    featured: first
      ? { eyebrow: 'Next open time', title: `Thu Nov 6 · ${first.time}`, meta: `${first.title} · ${first.left} spots left`, cta: 'Hold this time', href: '/book' }
      : { eyebrow: 'Book online', title: k.cta, meta: 'See open times', cta: 'See open times', href: '/book' },
    review: sample && k.reviews[0] ? { q: k.reviews[0][0], who: k.reviews[0][1], what: k.reviews[0][2] } : null,
    secondReview: sample && k.reviews[1] ? { q: k.reviews[1][0], who: k.reviews[1][1], what: k.reviews[1][2] } : null,
    quote: sample ? { text: k.quote, who: k.owner, role: k.role } : null,
    proof: sample ? { icon: k.proof[0], label: k.proof[1], sub: k.proof[2] } : null,
    letter: ids.includes('letter') && sample ? { title: 'Reminders and', em: 'openings.', body: 'A short note when your next visit is due or a time opens up.', action: '/letter' } : null,
    headings: { openings: { title: 'Next open', em: 'times.' }, services: { title: 'What we', em: 'do best.' } },
    defaultLayout: 'stack',
    layouts,
  }
}
