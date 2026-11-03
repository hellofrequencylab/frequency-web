import type { MegaNicheId } from '@/lib/theme/mega-theme'
import type { KitPage, SiteKit } from './types'

// The Services Theme Kit's starter kits (design system "New World", revision 2, ui_kits/site/kits.js): one sample business per niche,
// written in that niche's own language, as pages of Services blocks (components/page-editor/blocks/services.tsx). Seven kits: the
// General template ("Your place") and the six niche doors. Revision 1 shipped sixteen trade kits (cleaning, legal, auto...); revision 2
// replaced them with these, so the design is built as it now stands.
//
// STANDALONE. 'Services' is not a WebsiteTheme yet and nothing is registered here: the integration change (LIVE-2040) widens the
// theme type, adds the loaders to registry.ts and the summaries to KIT_INDEX. Until then this module is data plus a pure builder.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): the design's own words, except where they make a claim. Numbers that
// were sample facts ("38 checked in last week", "7 in 10 come back") became plain statements; reviews are prompts to write a real
// one, never a made-up quote with a made-up name; prices on the plans and the shop are left for the owner to set. The three offers,
// the first three people and the first three events are `{{slot|sample words}}` tokens (lib/spaces/content-slots.ts), so a Space that
// has filled in its own offers and people shows those instead. No photos: the design's picture names have no files in this repo.

/** The Frequency tools a kit turns on (design record.js FUNCTIONS[].tool). Lane A reads them to build a Spotlight's doors. */
type ServicesTool = 'book' | 'sell' | 'belong' | 'publish' | 'gather' | 'learn'
/** The design's palette name for a kit. Only 'blue' has a shipped accent (tide) until the other presets land (LIVE-2041). */
type ServicesPalette = 'purple' | 'yellow' | 'red' | 'blue'
export type ServicesKitNiche = Extract<MegaNicheId, 'general' | 'coaches' | 'studios' | 'hosts' | 'venues' | 'nonprofits' | 'networks'>

export const SERVICES_KIT_NICHES: readonly ServicesKitNiche[] = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']

/** A site kit that wears the Services theme. Same shape as SiteKit; `theme` is the literal until the theme type admits it. */
type ServicesKit = Omit<SiteKit, 'theme' | 'niche'> & { theme: 'Services'; niche: ServicesKitNiche; palette: ServicesPalette; tools: readonly ServicesTool[] }

type Block = KitPage['blocks'][number]
type Pair = readonly [string, string]
type SectionCopy = { title: string; em: string; lede?: string }
type Section = 'circles' | 'events' | 'firstnight' | 'reviews' | 'team' | 'services' | 'plans' | 'shop' | 'cta'

interface Spec {
  label: string
  description: string
  palette: ServicesPalette
  name: string
  descriptor: string
  owner: string
  role: string
  /** Who a review prompt asks for a quote from. */
  person: string
  tools: readonly ServicesTool[]
  cta: string
  cta2: string
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: readonly string[]
  story2: Pair
  quote: string
  /** name, when, line */
  groups: readonly (readonly [string, string, string])[]
  events: readonly Pair[]
  offers: readonly { name: string; meta: string; price: string; dur: string }[]
  trust: readonly Pair[]
  reviewsAbout: readonly string[]
  team: readonly Pair[]
  posts: readonly Pair[]
  plans?: readonly Pair[]
  products?: readonly Pair[]
  firstVisit: readonly Pair[]
  copy: Partial<Record<Section, SectionCopy>>
}

/** The design's section titles when a kit does not write its own (record.js SITE.copy). */
const COPY: Record<Section, SectionCopy> = {
  circles: { title: 'The', em: 'groups.', lede: 'Regular sessions with their own members. Book a spot or drop in.' },
  events: { title: "What's", em: 'happening.', lede: 'Everything on the calendar this month. RSVP and we remind you.' },
  firstnight: { title: 'Your first', em: 'visit.', lede: 'Walking in alone is the hardest part. Here is exactly what happens.' },
  reviews: { title: 'In their', em: 'words.', lede: 'Members, in their own words.' },
  team: { title: 'The people', em: 'behind it.', lede: 'Who you will meet.' },
  services: { title: 'Ways', em: 'in.', lede: 'Everything here is priced in plain sight. Most of it is free to walk into.' },
  plans: { title: 'Keep', em: 'coming back.', lede: 'Pick a rhythm. Pause or change it any time.' },
  shop: { title: 'Take some', em: 'home.', lede: 'A few things we make. Picked up at the door or sent.' },
  cta: { title: 'Book your', em: 'first visit.' },
}

const SPECS: Record<ServicesKitNiche, Spec> = {
  general: {
    label: 'Your place', description: 'A page for whatever you run: what happens here, who it is for and a way to come along.', palette: 'purple',
    name: 'Your Place', descriptor: 'What you do, in four words', owner: 'Your name', role: 'Owner', person: 'member',
    tools: ['belong', 'gather', 'publish', 'book'],
    cta: 'Book your first visit', cta2: 'See the calendar',
    hero: { eyebrow: 'Your street · Your City', title: 'Say what happens here', em: 'and who it is for.', body: 'This is the template. Replace every line with your own: what you do, who shows up, how someone new gets started. Keep it to two sentences.' },
    story: ['The beginning: the thing you noticed, the room you wanted to exist, the first few people who came.', 'The middle: what happens here now on an ordinary week, and who it is for.', 'The invitation: what a new person should do first, and why it will be fine.'], story2: ['Our', 'story.'], quote: 'The line you would paint on the wall by the door.',
    groups: [['Weekly session', 'Tuesdays · 7pm', 'The thing that happens here most weeks. Say what it is.'], ['Morning session', 'Saturdays · 8am', 'The quieter one. Say who it suits.'], ['Open workshop', 'Thursdays · 6:30pm', 'Bring what you are working on.'], ['Newcomers', 'First Sunday · 4pm', 'Your first visit. Everything explained.']],
    events: [['Open house', 'Doors open. See the room, meet the people.'], ['Workshop', 'A one-off. Say what people leave with.'], ['Bring a friend day', 'Two for one on the first visit.']],
    offers: [{ name: 'First visit', meta: 'Any session, meet the people', price: 'Free', dur: '60 min' }, { name: 'Drop in', meta: 'Any session, any week', price: '$18', dur: '60 min' }, { name: 'Membership', meta: 'Every session, a saved seat, pause any time', price: '$24 / mo', dur: 'Monthly' }],
    trust: [['Checked in at the door', 'One tap, no list to chase'], ['Every session on the calendar', 'Open to book'], ['A first visit that is free', 'Always'], ['Pause any time', 'Memberships that wait for you']],
    reviewsAbout: ['Weekly session', 'Membership', 'Newcomers'],
    team: [['Your name', 'Owner'], ['A host', 'Tuesdays'], ['Another host', 'Thursdays']],
    posts: [['Guide', 'What to expect on your first visit'], ['Story', 'How this place started'], ['Note', 'What is new this month'], ['Update', 'Holiday hours']],
    plans: [['Drop in', 'Any session, any week'], ['Membership', 'Every session, a saved seat'], ['Household', 'Two people, one plan']],
    firstVisit: [['Who is there', 'Eight to twenty people. Half of them were new once too.'], ['How long', 'About ninety minutes. Leave when you need to.'], ['What to bring', 'Nothing. Water is here.'], ['At the door', 'Someone says hello and learns your name.']],
    copy: { },
  },
  coaches: {
    label: 'Coaches', description: 'Groups with a coach in each, a calendar people can book from and a first session that is free.', palette: 'yellow',
    name: 'Morning Crew', descriptor: 'Run club & small-group strength', owner: 'Dre Walker', role: 'Head coach', person: 'member',
    tools: ['belong', 'gather', 'book', 'learn'],
    cta: 'Book a free session', cta2: 'This week’s sessions',
    hero: { eyebrow: 'Riverside track · Your City', title: 'Train with people', em: 'who know your name.', body: 'Saturday 5k for every pace. Strength in groups of eight midweek. Book a session in two taps, check in at the track, and your coach already knows what you did last week.' },
    story: ['Four runners kept meeting on the same loop. Now it is a Saturday club with coffee after and three strength groups during the week.', 'Every group has a coach. Eight people, every rep seen. The slowest group has the most talking.', 'Memberships pause when life does. Nobody is chased.'], story2: ['Nobody trains', 'alone here.'], quote: 'Strong is a habit, and habits are easier with company.',
    groups: [['Saturday 5k', 'Saturdays · 8am', 'Pace groups from 12-minute miles up. Coffee after.'], ['Strength AM', 'Tue & Thu · 6:30am', 'Programmed in 8-week blocks. Every rep coached.'], ['Back of the Pack', 'Saturdays · 8am', 'The walk-run group. A coach runs with you.'], ['Long Run', 'Sundays · 7am', 'Ten miles and a diner.']],
    events: [['Spring 10k', 'Our course, our medals, chip timing. Tickets on the calendar.'], ['Mobility workshop', 'Hips and shoulders, ninety minutes, mats provided.'], ['First Saturday', 'Bring someone new. Both of you run free.']],
    offers: [{ name: 'First session', meta: 'Any group, meet the coaches', price: 'Free', dur: '60 min' }, { name: 'Small-group strength', meta: 'Eight per group, your own program', price: '$22', dur: '50 min' }, { name: '8-week base', meta: 'Run and strength, one group, start to finish', price: '$160', dur: '8 weeks' }],
    trust: [['A coach in every group', 'Every pace, every rep seen'], ['Sessions on the calendar', 'Mornings and Saturdays'], ['Memberships that pause', 'Month to month'], ['First session free', 'Always']],
    reviewsAbout: ['Long Run', 'Strength AM', 'Back of the Pack'],
    team: [['Dre Walker', 'Head coach'], ['Sol Kim', 'Coach · Mobility'], ['Beth Ayers', 'Coach · Back of the Pack']],
    posts: [['Program', 'The first eight weeks, for people who have not run since school'], ['Story', 'Carla at 52'], ['Guide', 'Eat enough to train'], ['Update', 'Spring 10k registration is open']],
    plans: [['Saturdays', 'The 5k and the coffee'], ['Two a week', 'Eight sessions a month'], ['Everything', 'Every session, every week']],
    firstVisit: [['Who is there', 'Eight to forty people, every pace. Half started as walkers.'], ['How long', 'Fifty to sixty minutes, then coffee if you want it.'], ['What to bring', 'Shoes and water. We have the rest.'], ['At the track', 'Check in on your phone. A coach finds you before the warm-up.']],
    copy: { circles: { title: 'Pick your', em: 'group.', lede: 'Same coach, same time, same faces. Book a spot or just show up.' }, events: { title: 'On the', em: 'calendar.', lede: 'Races, workshops and open Saturdays. Tickets and spots live here.' }, firstnight: { title: 'Your first', em: 'session.', lede: 'Nobody is dropped. Here is exactly how it goes.' }, reviews: { title: 'From the', em: 'crew.' }, team: { title: 'Your', em: 'coaches.' }, services: { title: 'Ways to', em: 'train.' }, plans: { title: 'Memberships that', em: 'pause.', lede: 'Month to month. Pause from your phone when life gets in the way.' }, cta: { title: 'See you', em: 'Saturday.' } },
  },
  studios: {
    label: 'Studios', description: 'Small classes, a schedule people book from and memberships that pause when life does.', palette: 'red',
    name: 'Still House', descriptor: 'Movement & breath studio', owner: 'Maya Chen', role: 'Founder', person: 'member',
    tools: ['belong', 'gather', 'book', 'learn', 'sell'],
    cta: 'Book a class', cta2: 'See the schedule',
    hero: { eyebrow: 'Hill Street · Your City', title: 'Small classes.', em: 'No mirrors.', body: 'Twelve mats, a wooden floor and the same faces most weeks. Book a class from the schedule, check in at the desk, and your first one is free.' },
    story: ['Still House is one room with a wooden floor and no mirrors. It opened because a few of us wanted somewhere to breathe that was not an app.', 'Weeknights are slow. Fridays are loud, with music and the lights down. Twelve mats, so the teacher knows everyone.', 'Memberships pause when you travel. Class packs never expire.'], story2: ['Come down.', 'Come alive.'], quote: 'Everyone deserves an hour where nothing is asked of them.',
    groups: [['Tuesday Quiet', 'Tuesdays · 7pm', 'Slow movement, long breath, lights low.'], ['Friday Loud', 'Fridays · 8pm', 'Music, movement, no choreography. Tea after.'], ['Sunday Reset', 'Sundays · 10am', 'The hour that sets up the week.'], ['Beginners', 'Wednesdays · 6pm', 'Everything explained. Nobody watching.']],
    events: [['Open night', 'Free class, open door, see the room.'], ['Breath workshop', 'Ninety minutes, twelve people, all levels. Ticketed.'], ['Friday Loud · live drums', 'A drummer joins. Doors at 7:30.']],
    offers: [{ name: 'First class', meta: 'Any class, meet the room', price: 'Free', dur: '60 min' }, { name: 'Drop in', meta: 'Any class, any night', price: '$18', dur: '60 min' }, { name: 'Beginners series', meta: 'Four Wednesdays, one small group', price: '$60', dur: '4 weeks' }],
    trust: [['Small classes', 'The teacher knows everyone'], ['Mornings, evenings, Sundays', 'On the schedule'], ['Packs that never expire', 'Memberships that pause'], ['First class free', 'Always']],
    reviewsAbout: ['Tuesday Quiet', 'Friday Loud', 'Beginners'],
    team: [['Maya Chen', 'Founder · Tuesday Quiet'], ['Theo Park', 'Teacher · Friday Loud'], ['Ines Lobo', 'Teacher · Beginners']],
    posts: [['Note', 'Why there are no mirrors'], ['Guide', 'What to wear, what to bring (nothing)'], ['Story', 'The first Friday Loud'], ['Update', 'Sunday Reset is back']],
    plans: [['Two a month', 'Any two classes'], ['Weekly', 'One class a week, bring a guest once'], ['Unlimited', 'Every class, every night']],
    products: [['Studio tea', 'The blend we pour after class'], ['Gift class', 'Any class, for someone who needs an hour'], ['Still House tee', 'Soft, heavy cotton']],
    firstVisit: [['Who is there', 'Twelve people, mixed ages, mostly regulars who were new once.'], ['How long', 'Sixty minutes. Tea after if you want it.'], ['What to bring', 'Nothing. Mats, blocks and water are here.'], ['At the desk', 'Check in on your phone. The teacher says hello and sets you up.']],
    copy: { circles: { title: 'The', em: 'classes.', lede: 'Twelve mats each. Book from the schedule or drop in.' }, events: { title: 'The', em: 'schedule.', lede: 'Workshops and open nights. Spots are live.' }, firstnight: { title: 'Your first', em: 'class.', lede: 'Nobody is watching. Here is what happens.' }, reviews: { title: 'From the', em: 'mats.' }, team: { title: 'Your', em: 'teachers.' }, services: { title: 'Classes and', em: 'passes.' }, plans: { title: 'Memberships and', em: 'packs.', lede: 'Pause when you travel. Packs never expire.' }, shop: { title: 'From the', em: 'studio.' }, cta: { title: 'Take an hour.', em: 'This week.' } },
  },
  hosts: {
    label: 'Hosts', description: 'A table, a date and seats people can save: menus, dates, a waitlist and a first supper that feels easy.', palette: 'blue',
    name: 'Thursday Supper', descriptor: 'A supper club', owner: 'Sofia Marini', role: 'Host', person: 'guest',
    tools: ['belong', 'gather', 'sell', 'publish'],
    cta: 'Take a seat', cta2: 'See the next menus',
    hero: { eyebrow: 'Thursdays · a different kitchen each month', title: 'Twenty seats.', em: 'One long table.', body: 'A seasonal menu, a borrowed kitchen and strangers who become regulars. Seats go on the calendar Monday morning and usually go by lunch.' },
    story: ['Thursday Supper began as eight people in a borrowed kitchen. It is now a table of twenty that moves around the city, hosted wherever there is a room big enough.', 'You sit where there is a seat. By the second course you know the people either side of you.', 'Phones go in a bowl. They come out at dessert for one photo.'], story2: ['Pull up', 'a chair.'], quote: 'Cook one pot, light the candles, and let the table do the rest.',
    groups: [['The Table', 'Thursdays · 7:30pm', 'One menu, one long table, twenty people.'], ['Sunday Pasta', 'Last Sunday · 2pm', 'Make it, eat it, take the recipe.'], ['Host a Table', 'Monthly', 'For people with a big room and a long table.']],
    events: [['November table', 'Squash, sage, a long braise. Twenty seats, ticketed.'], ['Pasta Sunday', 'Flour on every surface. Twelve aprons.'], ['Bring someone Thursday', 'Two seats, one price, your friend’s first supper.']],
    offers: [{ name: 'A seat at the table', meta: 'Four courses, one long table', price: '$45', dur: 'Evening' }, { name: 'Pasta Sunday', meta: 'Hands-on, twelve people, lunch included', price: '$38', dur: '3 hr' }, { name: 'Host a table', meta: 'We bring the menu and the people, you bring the room', price: 'Free', dur: 'One evening' }],
    trust: [['Seats go live on Monday', 'Save yours in a minute'], ['A waitlist when it fills', 'Nobody left guessing'], ['Sit anywhere', 'No plus-one needed'], ['Come alone', 'Most people do']],
    reviewsAbout: ['The Table', 'Sunday Pasta', 'Host a Table'],
    team: [['Sofia Marini', 'Host · The Table'], ['Leo Brandt', 'Cook'], ['Mina Kovač', 'Host · Sunday Pasta']],
    posts: [['Menu', 'November at the long table'], ['Story', 'Eight people in a borrowed kitchen'], ['Guide', 'How to come to dinner alone'], ['Update', 'Hosts wanted for spring']],
    products: [['Pantry box', 'Our oils, vinegars and salts'], ['Gift seat', 'A seat for someone who should come'], ['The cookbook', 'Twelve menus, spiral bound']],
    firstVisit: [['Who is there', 'Twenty people. About half came alone the first time too.'], ['How long', 'Four courses, about two and a half hours.'], ['What to bring', 'A bottle if you like. Nothing else.'], ['At the door', 'Your name is on the guest list. Sofia seats you between two people you have not met.']],
    copy: { circles: { title: 'The', em: 'tables.', lede: 'Seats go live Monday morning.' }, events: { title: 'Coming', em: 'to the table.', lede: 'Menus, dates and seats left.' }, firstnight: { title: 'Your first', em: 'supper.', lede: 'Coming alone is normal here. Here is how the evening goes.' }, reviews: { title: 'From the', em: 'table.' }, team: { title: 'In the', em: 'kitchen.' }, services: { title: 'Seats and', em: 'Sundays.' }, shop: { title: 'From the', em: 'pantry.' }, cta: { title: 'Thursday.', em: 'Your seat is waiting.' } },
  },
  venues: {
    label: 'Venues', description: 'The room, what is on this week and tickets people can buy before the doors open.', palette: 'red',
    name: 'The Annex', descriptor: 'Music & listening room', owner: 'Jordan Pike', role: 'Owner', person: 'regular',
    tools: ['gather', 'sell', 'belong', 'publish'],
    cta: 'Get tickets', cta2: 'This week at the Annex',
    hero: { eyebrow: 'Market Lane · doors most nights', title: 'Loud nights.', em: 'Quiet ones too.', body: 'A 200-cap room with a serious system. Live bands Fridays, one album start to finish on Mondays, open stage Wednesdays. Tickets on the calendar, cheap on purpose.' },
    story: ['The Annex is a converted print shop with a sound system that was someone’s life savings. The door is kind by policy.', 'Some nights are loud. Some are a record played start to finish with the lights down and nobody talking.', 'Regulars skip the line and get first dibs on tickets. They started as strangers at the bar.'], story2: ['Built for', 'the room.'], quote: 'A good room is a kind door and a sound system you can feel in your chest.',
    groups: [['Listening Club', 'Mondays · 8pm', 'One album, start to finish, lights down. Free.'], ['Open Stage', 'Wednesdays · 7pm', 'Ten minutes each. First-timers go first and get the loudest cheer.'], ['Sunday Slow', 'Sundays · 11am', 'Coffee, records, newspapers.']],
    events: [['Friday · live', 'Two bands, doors at 8. Tickets here or on the door.'], ['Listening Club · Blue', 'One record, start to finish.'], ['Daytime dance', 'Sunday 2 to 6pm. Lights up, shoes off.']],
    offers: [{ name: 'Friday ticket', meta: 'Two acts, doors at 8', price: '$15', dur: 'Night' }, { name: 'Listening Club', meta: 'One record, start to finish', price: 'Free', dur: '90 min' }, { name: 'Annex regular', meta: 'Every show, skip the line, first dibs', price: '$20 / mo', dur: 'Monthly' }],
    trust: [['Scanned at the door', 'Tickets on your phone'], ['Something on most nights', 'See the week'], ['Regulars skip the line', 'A membership that pauses'], ['A kind door', 'Always']],
    reviewsAbout: ['Listening Club', 'Open Stage', 'Annex regular'],
    team: [['Jordan Pike', 'Owner · door'], ['Kai Brooks', 'Sound'], ['Noor Haddad', 'Host · Listening Club'], ['Pat Doyle', 'Bar']],
    posts: [['Note', 'Why the door is kind'], ['Story', 'The sound system that was a life savings'], ['Guide', 'Going out alone, the gentle version'], ['Update', 'Daytime dance returns']],
    plans: [['Listening', 'Mondays and Sundays'], ['Regular', 'Every show, skip the line'], ['Two regulars', 'For both of you']],
    products: [['Annex tee', 'Black, heavy, the roundel'], ['Gift tickets', 'Two Fridays, any Fridays'], ['The Sunday record', 'Whatever we played last Sunday']],
    firstVisit: [['Who is there', 'Sixty to two hundred people. Regulars at the bar, first-timers near the front.'], ['How long', 'Doors at 8, music by 9, done by midnight.'], ['What to bring', 'Your ticket on your phone. Earplugs are free at the bar.'], ['At the door', 'Scan in, no line if you are a regular. Pat at the bar knows the first-timer face.']],
    copy: { circles: { title: 'The', em: 'residencies.', lede: 'Same night every week. Walk in.' }, events: { title: 'This', em: 'week.', lede: 'Tickets live. Scan at the door.' }, firstnight: { title: 'Your first', em: 'night.', lede: 'Coming alone is fine. Here is how it goes.' }, reviews: { title: 'From the', em: 'floor.' }, team: { title: 'Who runs', em: 'the room.' }, services: { title: 'Tickets and', em: 'regulars.' }, shop: { title: 'Merch and', em: 'records.' }, cta: { title: 'Doors at eight.', em: 'Come early.' } },
  },
  nonprofits: {
    label: 'Non-profits', description: 'The work explained plainly, crews to join, a calendar the neighbourhood reads and an easy way to give.', palette: 'blue',
    name: 'Northside Neighbours', descriptor: 'A neighbourhood association', owner: 'Amara Diallo', role: 'Coordinator', person: 'neighbour',
    tools: ['gather', 'belong', 'publish', 'sell'],
    cta: 'RSVP to the next one', cta2: 'See the calendar',
    hero: { eyebrow: 'Northside · Your City', title: 'Fix the park.', em: 'Meet the street.', body: 'A repair café, a tool library, a park crew and a street dinner every month. No forms, no dues. RSVP to one thing and you are a neighbour.' },
    story: ['Northside Neighbours began with a street dinner that closed one road for one evening. Forty people came. Most had never spoken.', 'Now there is a tool library, a repair café and a park crew. Each one started because someone said they would host it.', 'Everything is free. Monthly donors keep the kettle on and the tools sharp.'], story2: ['A street is a', 'room too.'], quote: 'Everyone has something to fix and something to lend.',
    groups: [['Repair Café', 'Second Saturday · 10am', 'Bring the broken thing. Someone will know how.'], ['Park Crew', 'Sundays · 9am', 'Two hours, gloves provided, coffee after.'], ['Street Dinner Crew', 'Monthly', 'The people who close the road and set the tables.']],
    events: [['Street dinner · Elm', 'Bring a dish and a chair. Forty seats, RSVP.'], ['Repair Café', 'Toasters, bikes, hems, lamps.'], ['Park planting day', 'Two hundred bulbs. Children welcome.']],
    offers: [{ name: 'Show up once', meta: 'Any event, no commitment', price: 'Free', dur: 'A morning' }, { name: 'Tool library card', meta: 'Borrow anything on the wall', price: 'Free', dur: 'Yearly' }, { name: 'Keep the kettle on', meta: 'Monthly gift, cancel any time', price: 'From $5 / mo', dur: 'Monthly' }],
    trust: [['RSVP to one thing', 'No sign-up beyond that'], ['Crews on the calendar', 'Saturday, Sunday, monthly'], ['Come back for a second', 'Whenever you like'], ['No dues', 'Ever']],
    reviewsAbout: ['Repair Café', 'Park Crew', 'Street Dinner Crew'],
    team: [['Amara Diallo', 'Coordinator'], ['Rosa Alvarez', 'Host · Repair Café'], ['Minh Tran', 'Host · Park Crew']],
    posts: [['Story', 'The first street dinner'], ['Guide', 'How to host one on your road'], ['Note', 'What the tool library has this month'], ['Update', 'Planting day is on']],
    products: [['Street dinner apron', 'Printed by hand, by us'], ['Seed box', 'For planting day'], ['Gift a card', 'A tool library card for a neighbour']],
    firstVisit: [['Who is there', 'Twenty to forty neighbours. Children and dogs welcome.'], ['How long', 'Two hours, come and go.'], ['What to bring', 'Gloves if you have them. The broken thing, if it is Repair Café.'], ['At the gate', 'RSVP on your phone so we know the headcount. Amara finds you a job in five minutes.']],
    copy: { circles: { title: 'The', em: 'crews.', lede: 'Show up to one. No sign-up beyond an RSVP.' }, events: { title: 'On the', em: 'street.', lede: 'RSVP so we know how many chairs.' }, firstnight: { title: 'Your first', em: 'Saturday.', lede: 'Here is how a morning goes.' }, reviews: { title: 'From the', em: 'street.' }, team: { title: 'Who holds', em: 'it together.' }, services: { title: 'Ways to', em: 'help.' }, plans: { title: 'Keep the', em: 'kettle on.', lede: 'Monthly giving. Every dollar stays on the street.' }, shop: { title: 'Made on', em: 'Northside.' }, cta: { title: 'Second Saturday.', em: 'Bring the broken thing.' } },
  },
  networks: {
    label: 'Networks', description: 'Many groups under one roof: find yours, start one and see what is on everywhere.', palette: 'purple',
    name: 'Third Place', descriptor: 'Twelve small groups across the city', owner: 'Hollis Grant', role: 'Steward', person: 'member',
    tools: ['belong', 'gather', 'publish', 'learn'],
    cta: 'Join a group', cta2: 'See every group',
    hero: { eyebrow: 'Twelve groups · six neighbourhoods', title: 'Small groups', em: 'near you.', body: 'Walkers, readers, potluck cooks, new arrivals, early dads, bad sketchers. Each group is under twenty people and meets at the same time in the same place. Join one. Then another.' },
    story: ['Third Place is not a venue. It is twelve small groups meeting in borrowed rooms across the city, held together by hosts who were once the new person.', 'Each group stays under twenty. When one gets full, a member starts the next one with our backing.', 'Hosts get a format, a room and the kit. Members get people to call on a Tuesday.'], story2: ['Many groups,', 'overlapping.'], quote: 'Open doors, small rooms, familiar faces.',
    groups: [['Westside Walkers', 'Saturdays · 9am', 'An hour on foot. The route changes, the people do not.'], ['Book & Beer', 'Second Tuesday · 7pm', 'One book a month. Reading it is optional.'], ['Sunday Potluck', 'Sundays · 1pm', 'Everyone brings one thing. Nobody brings it twice.'], ['New in Town', 'Thursdays · 6:30pm', 'Your first group. Hosted by people who remember.'], ['Dads Early', 'Saturdays · 7am', 'Coffee before the day starts.'], ['Sketch Club', 'Wednesdays · 6pm', 'Draw badly together.']],
    events: [['All-groups night', 'Twelve groups, one hall, one long table. RSVP.'], ['New in Town · first Thursday', 'A room full of people who just arrived.'], ['Host a group · info evening', 'You already organise. Here is backup.']],
    offers: [{ name: 'Join a group', meta: 'Any group, show up when you can', price: 'Free', dur: 'Any week' }, { name: 'Host a group', meta: 'A format, a room, people who return', price: 'Free', dur: 'Monthly check-in' }, { name: 'Six weeks in', meta: 'A small group for your first six weeks in the city', price: 'Free', dur: '6 weeks' }],
    trust: [['Checked in at the door', 'Every group, one tap'], ['Groups in every neighbourhood', 'Find yours'], ['A shared calendar', 'Every group in one place'], ['Free to join', 'Supporters keep rooms booked']],
    reviewsAbout: ['Book & Beer', 'New in Town', 'Westside Walkers'],
    team: [['Hollis Grant', 'Steward'], ['Pip Marlow', 'Host · New in Town'], ['Sunny Vale', 'Host · Potluck'], ['Lou Ferris', 'Host · Walkers']],
    posts: [['Guide', 'How to make friends in a new city, honestly'], ['Story', 'Twelve groups, one hall'], ['Note', 'Things to do alone on a weeknight that end with people'], ['Update', 'Two new groups this month']],
    plans: [['Member', 'Every group, free'], ['Supporter', 'Keeps the rooms booked'], ['Host', 'Backup, a room, the kit']],
    firstVisit: [['Who is there', 'Twelve to eighteen people. A host who was new two years ago.'], ['How long', 'About ninety minutes.'], ['What to bring', 'Nothing. Potluck is the exception: one dish.'], ['At the door', 'Check in on your phone. The host introduces you to two people before you sit.']],
    copy: { circles: { title: 'The', em: 'groups.', lede: 'Under twenty people each. Same time, same place.' }, events: { title: 'All', em: 'together.', lede: 'The nights every group comes to.' }, firstnight: { title: 'Your first', em: 'group.', lede: 'Start with New in Town if you are not sure.' }, reviews: { title: 'From the', em: 'members.' }, team: { title: 'The', em: 'hosts.' }, services: { title: 'Join, host,', em: 'or start.' }, plans: { title: 'Member, supporter,', em: 'host.', lede: 'Membership is free. Supporters keep the rooms booked.' }, cta: { title: 'Pick one.', em: 'Then another.' } },
  },
}

const slot = (key: string, sample: string) => `{{${key}|${sample}}}`
const star = (c: { title: string; em: string }) => (c.em ? `${c.title} *${c.em}*` : c.title)
const copy = (s: Spec, k: Section): SectionCopy => s.copy[k] ?? COPY[k]
const head = (c: SectionCopy, eyebrow: string) => ({ eyebrow, title: star(c), lede: c.lede ?? '' })

function pages(s: Spec): KitPage[] {
  const offers = s.offers.map((o, i) => ({
    name: slot(`offer${i + 1}Title`, o.name), meta: o.dur, body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, o.price), href: '~/book',
  }))
  const hero: Block = {
    type: 'ServicesHero',
    props: {
      look: 'split', eyebrow: s.hero.eyebrow, title: `${s.hero.title} *${s.hero.em}*`, lead: s.hero.body,
      primaryLabel: s.cta, primaryHref: '~/book', secondaryLabel: s.cta2, secondaryHref: '~/services', proof: '', image: '', alt: '',
      panelTitle: 'Book online', panelNote: 'Pick a time', offers: offers.map((o) => ({ name: o.name, meta: o.meta, price: o.price, href: o.href })), areas: [],
    },
  }
  const trust: Block = { type: 'ServicesTrust', props: { items: s.trust.map(([title, line]) => ({ title, line })) } }
  const groups: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'circles'), 'Groups'), buttonLabel: 'Book a spot', buttonHref: '~/book', rows: s.groups.map(([name, when, line]) => ({ meta: when, name, body: line, price: '', href: '~/book' })) },
  }
  const first: Block = { type: 'ServicesSteps', props: { ...head(copy(s, 'firstnight'), 'Your first visit'), rows: s.firstVisit.map(([title, body]) => ({ title, body })) } }
  const events: Block = {
    type: 'ServicesEvents',
    props: {
      ...head(copy(s, 'events'), 'Events'), buttonLabel: '', buttonHref: '',
      rows: s.events.map(([title, body], i) => ({ meta: '', title: slot(`event${i + 1}Title`, title), body, price: '', href: '~/book', featured: i === 0 })),
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
    ? { type: 'ServicesPlans', props: { ...head(copy(s, 'plans'), 'Plans'), rows: s.plans.map(([title, body], i) => ({ meta: '', title, body, price: 'Set your price', href: '~/book', featured: i === 1 })) } }
    : null
  const shop: Block | null = s.products
    ? { type: 'ServicesShop', props: { ...head(copy(s, 'shop'), 'Shop'), buttonLabel: 'Open the shop', buttonHref: '~/services', rows: s.products.map(([title, body]) => ({ meta: '', title, body, price: 'Set your price', href: '', image: '', alt: '' })) } }
    : null
  const list: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'services'), 'Services'), buttonLabel: 'See open times', buttonHref: '~/book', rows: offers.map((o) => ({ meta: o.meta, name: o.name, body: o.body, price: o.price, href: o.href })) },
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
    props: { eyebrow: 'Next opening', title: star(copy(s, 'cta')), primaryLabel: s.cta, primaryHref: '~/book', secondaryLabel: '', secondaryHref: '' },
  }
  const story: Block = {
    type: 'ServicesStory',
    props: { eyebrow: 'Our story', title: `${s.story2[0]} *${s.story2[1]}*`, paragraphs: s.story, buttonLabel: 'Meet the people', buttonHref: '~/about', image: '', alt: '' },
  }
  const booking: Block = {
    type: 'ServicesBooking',
    props: {
      eyebrow: 'Book online', title: 'Next *openings.*', lede: 'Live availability. Pick a time, see the total, get a confirmation.', buttonLabel: s.cta, buttonHref: '~/book',
      rows: s.groups.map(([name, when, line]) => ({ day: when, title: name, meta: line, time: '', href: '~/book' })),
    },
  }
  const contact: Block = {
    type: 'ServicesContact',
    props: { eyebrow: 'Get in touch', title: 'Ask us *anything.*', lede: 'A person answers. Usually the same day.', body: '', buttonLabel: 'Send a message', buttonHref: '~/book', secondaryLabel: '', secondaryHref: '' },
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
    props: { eyebrow: 'Newsletter', title: 'Stay in *the loop.*', lede: 'A short note when something is coming up. Nothing else.', buttonLabel: 'Join the list', buttonHref: '~/book' },
  }
  const compact = (xs: (Block | null)[]) => xs.filter((b): b is Block => b !== null)
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo(s.name, s.descriptor), blocks: compact([hero, trust, groups, first, events, reviews, band]) },
    { slug: 'services', label: 'Services', seo: seo('Services', `${s.name}: what is on and what it costs.`), blocks: compact([list, plans, shop, faq, band]) },
    { slug: 'about', label: 'About', seo: seo('About', `Who is behind ${s.name}.`), blocks: compact([story, team, posts, locations, letter]) },
    { slug: 'book', label: 'Book', seo: seo('Book', `Pick a time at ${s.name}.`), blocks: compact([booking, contact]) },
  ]
}

export function servicesKit(niche: ServicesKitNiche): ServicesKit {
  const s = SPECS[niche]
  return {
    id: `services-${niche}`, version: 1, theme: 'Services', niche, label: s.label, description: s.description,
    palette: s.palette, tools: s.tools,
    // tide is the one shipped accent that matches a kit's palette (blue). The rest wait on the other presets (LIVE-2041).
    ...(s.palette === 'blue' ? { accent: 'tide' } : {}),
    pages: pages(s),
  }
}
