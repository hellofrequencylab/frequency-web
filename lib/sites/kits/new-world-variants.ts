import type { MegaNicheId } from '@/lib/theme/mega-theme'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import type { KitPage, SiteKit } from './types'
import NEW_WORLD_PHOTOS from '@/lib/sites/new-world-photos.json'
import { newWorldFunctionsFor, newWorldSectionFunction, type NewWorldHas, type NewWorldTool } from '@/lib/sites/new-world-functions'

// New World's seven niche kits (design system "New World", revision 2, ui_kits/site/kits.js): one sample business per niche, written in
// that niche's own language. Seven kits: the General template ("Your place") and the six niche doors. They moved here from the Services
// folder (LIVE-2056) when Daniel ruled that New World is its own theme; Services rebuilds its own sixteen trade kits.
//
// BLOCKS. Every page is drawn with New World's own blocks (components/page-editor/blocks/new-world.tsx, LIVE-2055 and LIVE-2056).
// FUNCTIONS. Home keeps a function's section only when the kit turns that function on (LIVE-2193, lib/sites/new-world-functions.ts),
// the same list the kit's Spotlight doors are built from, so a kit without the Book tool has no open-times or ways-in section on Home.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): the design's own words, except where they make a claim. Numbers that
// were sample facts ("38 checked in last week", "7 in 10 come back") became plain statements; reviews are prompts to write a real
// one, never a made-up quote with a made-up name; prices on the plans and the shop are left for the owner to set. The three offers,
// the first three people and the first three events are `{{slot|sample words}}` tokens (lib/spaces/content-slots.ts), so a Space that
// has filled in its own offers and people shows those instead. Home wears the theme's own photos (lib/sites/new-world-photos.json).

/** The design's palette name for a kit. Only 'blue' has a shipped accent (tide) until the other presets land (LIVE-2041). */
type NewWorldPalette = 'purple' | 'yellow' | 'red' | 'blue'
export type NewWorldKitNiche = Extract<MegaNicheId, 'general' | 'coaches' | 'studios' | 'hosts' | 'venues' | 'nonprofits' | 'networks'>

export const NEW_WORLD_KIT_NICHES: readonly NewWorldKitNiche[] = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']

/** A site kit that wears the Services theme. Same shape as SiteKit; `theme` is the literal until the theme type admits it. */
type NewWorldKit = Omit<SiteKit, 'theme' | 'niche'> & { theme: 'NewWorld'; niche: NewWorldKitNiche; palette: NewWorldPalette; tools: readonly NewWorldTool[] }

type Block = KitPage['blocks'][number]
type Pair = readonly [string, string]
type SectionCopy = { title: string; em: string; lede?: string }
type Section = 'circles' | 'events' | 'firstnight' | 'reviews' | 'team' | 'services' | 'plans' | 'shop' | 'cta'

interface Spec {
  label: string
  description: string
  palette: NewWorldPalette
  name: string
  descriptor: string
  owner: string
  role: string
  /** Who a review prompt asks for a quote from. */
  person: string
  tools: readonly NewWorldTool[]
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

const SPECS: Record<NewWorldKitNiche, Spec> = {
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

// ── Home, drawn with New World's own blocks (LIVE-2055) in the design's order: hero, numbers, story, groups, calendar, first visit,
// the regulars' words, the hosts, ways in, plans, open spots, gallery, posts, how a first time goes, where, ask, letter, questions,
// the tools and the closer. Photos are the theme's own set (lib/sites/new-world-photos.json, Daniel's uploads); the team keeps empty
// frames because a starter must never put a stranger's face on someone's host. Section numbers count the numbered sections only.

/** The theme's photo per kit for the hero, the story and the groups card, then the gallery's five. */
const PHOTOS: Record<NewWorldKitNiche, readonly [string, string, string]> = {
  general: ['circle-sunrise', 'fire-circle', 'garden-picnic'],
  coaches: ['beach-move', 'hands-up', 'beach-joy'],
  studios: ['backyard-class', 'beach-gong', 'circle-sunrise'],
  hosts: ['garden-picnic', 'fire-circle', 'cafe-table'],
  venues: ['hands-up', 'beach-dance', 'fire-crew'],
  nonprofits: ['workshop-table', 'garden-picnic', 'hands-up'],
  networks: ['cafe-table', 'circle-sunrise', 'beach-joy'],
}
const GALLERY = ['hands-up', 'beach-joy', 'garden-picnic', 'backyard-class', 'fire-circle', 'beach-dance', 'workshop-table', 'group-hug', 'beach-gong']
const PHOTO_ALT: Record<string, string> = Object.fromEntries(Object.entries(NEW_WORLD_PHOTOS as Record<string, { alt: string }>).map(([k, v]) => [k, v.alt]))
const pic = (name: string) => `/sites/new-world/photos/${name}.webp`
const AREAS = ['Downtown', 'Northside', 'Riverside', 'Oak Park', 'Lakeview', 'Hillcrest', 'Westfield', 'Eastgate']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** "Tuesdays · 7pm" → Tue; "First Sunday · 4pm" → Sun; "Tue & Thu · 6:30am" → Tue. */
const weekday = (when: string) => WEEKDAYS.find((d) => when.toLowerCase().includes(d.toLowerCase())) ?? ''
const [whenDay, whenTime] = [(w: string) => w.split(' · ')[0] ?? w, (w: string) => w.split(' · ')[1] ?? '']

/** The Frequency functions a kit turns on (lib/sites/new-world-functions.ts): the same list its Spotlight doors are built from. */
function newWorldKitFunctionIds(s: Pick<Spec, 'tools' | 'groups' | 'events' | 'posts' | 'team' | 'plans' | 'products'>): string[] {
  const has = (h: NewWorldHas): boolean =>
    ({ events: s.events.length > 0 || s.groups.length > 0, products: !!s.products?.length, plans: !!s.plans?.length, posts: s.posts.length > 0, team: s.team.length > 0, groups: s.groups.length > 0 })[h]
  return newWorldFunctionsFor(s.tools, has).map((f) => f.id)
}

/** Home keeps a function's section only when the kit turns that function on (the design's Home: `ALWAYS.includes(id) || has(id)`),
 *  then renumbers the numbered sections so the count reads 01, 02, 03 with no gaps. */
function cutToFunctions(blocks: Block[], on: readonly string[]): Block[] {
  let i = 0
  return blocks
    .filter((b) => { const fn = newWorldSectionFunction(b.type); return !fn || on.includes(fn) })
    .map((b) => (typeof b.props?.index === 'string' && b.props.index !== '' ? { ...b, props: { ...b.props, index: String(++i).padStart(2, '0') } } : b))
}

function newWorldHome(s: Spec, niche: NewWorldKitNiche): Block[] {
  return cutToFunctions(newWorldHomeAll(s, niche), newWorldKitFunctionIds(s))
}

function newWorldHomeAll(s: Spec, niche: NewWorldKitNiche): Block[] {
  const [heroPic, storyPic, groupPic] = PHOTOS[niche]
  const offers = s.offers.map((o, i) => ({ name: slot(`offer${i + 1}Title`, o.name), meta: o.dur, body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, o.price) }))
  const n = (i: number) => String(i).padStart(2, '0')
  const sessions = s.groups.map(([name, when, line]) => ({ weekday: weekday(when), mon: /^first/i.test(when) ? 'First' : 'Every', day: weekday(when), title: name, body: line, time: when, where: '', spots: 'Open', kind: 'session', href: '~/booking' }))
  const oneOffs = s.events.map(([title, body], i) => ({ weekday: ['Fri', 'Sat', 'Sun'][i] ?? '', mon: 'Next', day: ['Fri', 'Sat', 'Sun'][i] ?? '', title: slot(`event${i + 1}Title`, title), body, time: '', where: '', spots: 'Spots open', kind: 'event', href: '~/booking' }))
  const c = (k: Section) => copy(s, k)
  const [stat3, stat4] = [s.offers[1], s.trust[3]]
  return [
    {
      type: 'NewWorldHero',
      props: {
        eyebrow: s.hero.eyebrow, title: `${s.hero.title} *${s.hero.em}*`, lead: s.hero.body,
        primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: s.cta2, secondaryHref: '#events',
        proof: s.firstVisit[0]?.[1] ?? '', aside: s.quote, image: pic(heroPic), alt: PHOTO_ALT[heroPic] ?? '', badge: 'Doors open this week',
        useEvents: true, rows: sessions.slice(0, 3), areas: AREAS, register: 'auto',
      },
    },
    {
      type: 'NewWorldStats',
      props: {
        items: [
          { icon: 'users', value: String(s.groups.length), label: 'groups every week', note: 'On the calendar' },
          { icon: 'calendar', value: offers[0]!.price, label: s.offers[0]!.name.toLowerCase(), note: s.offers[0]!.meta },
          { icon: 'heart', value: offers[1]!.price, label: stat3 ? stat3.name.toLowerCase() : '', note: stat3?.meta ?? '' },
          { icon: 'check', value: stat4 ? stat4[0] : '', label: '', note: stat4 ? stat4[1] : '' },
        ],
        register: 'auto',
      },
    },
    {
      type: 'NewWorldStory',
      props: {
        index: n(1), eyebrow: 'Our story', title: `${s.story2[0]} *${s.story2[1]}*`, paragraphs: s.story, buttonLabel: 'Read the whole story', buttonHref: '~/about',
        secondaryLabel: 'Meet the people', secondaryHref: '#team', image: pic(storyPic), alt: PHOTO_ALT[storyPic] ?? '', quote: s.quote, quoteBy: `${slot('person1Name', s.owner)} · ${s.role}`, register: 'auto',
      },
    },
    {
      type: 'NewWorldGroups',
      props: {
        index: n(2), ...head(c('circles'), 'Groups'), image: pic(groupPic), alt: PHOTO_ALT[groupPic] ?? '', featureLabel: 'Open to new faces', featureName: s.groups[s.groups.length - 1]![0],
        featureButtonLabel: 'Come once', featureButtonHref: '~/booking',
        rows: s.groups.map(([name, when, line], i) => ({ day: whenDay(when), time: whenTime(when), name, body: line, people: '', open: i === s.groups.length - 1, href: '~/booking' })), register: 'auto',
      },
    },
    { type: 'NewWorldCalendar', props: { index: n(3), ...head(c('events'), "What's Happening"), buttonLabel: '', buttonHref: '', rowLabel: 'Save a spot', count: '6', useEvents: true, rows: [...sessions.slice(0, 3), ...oneOffs], register: 'auto' } },
    { type: 'NewWorldFirstVisit', props: { index: n(4), ...head(c('firstnight'), 'Walking in'), note: 'Half the people here were new once. Someone will say hello before you have to.', rows: s.firstVisit.map(([title, body]) => ({ title, body })), register: 'auto' } },
    {
      type: 'NewWorldReviews',
      props: { index: n(5), ...head(c('reviews'), 'In their words'), lede: '', proof: '', rows: s.reviewsAbout.map((what, i) => ({ quote: `Replace with a real quote from a real ${s.person}. Specific beats glowing.`, who: `${s.person[0]!.toUpperCase()}${s.person.slice(1)} ${['one', 'two', 'three'][i] ?? i + 1}`, what })), register: 'auto' },
    },
    {
      type: 'NewWorldTeam',
      props: { index: n(6), ...head(c('team'), 'The team'), note: 'Real people. Replace these with photos from your room.', rows: s.team.map(([name, role], i) => ({ name: slot(`person${i + 1}Name`, i === 0 ? s.owner : name), role: i === 0 ? s.role : role, image: '', alt: '' })), register: 'auto' },
    },
    {
      type: 'NewWorldOffers',
      props: { index: n(7), ...head(c('services'), 'Ways in'), buttonLabel: 'All ways in', buttonHref: '~/services', rows: offers.map((o, i) => ({ icon: ['users', 'calendar', 'award'][i] ?? 'tag', meta: o.meta, name: o.name, body: o.body, price: o.price, href: '~/booking' })), register: 'auto' },
    },
    ...(s.plans
      ? [{ type: 'NewWorldPlans', props: { index: n(8), ...head(c('plans'), 'Memberships and plans'), aside: 'Free to join. Pay for what you choose.', featuredLabel: 'Most chosen', note: 'Pause, change or cancel from your account any time.', rows: s.plans.map(([name, body], i) => ({ name, body, price: '', featured: i === 1, buttonLabel: `Choose ${name}`, href: '~/booking' })), register: 'auto' } }]
      : []),
    { type: 'NewWorldOpenings', props: { index: n(9), eyebrow: 'Save a spot', title: 'Open *this week.*', lede: 'Pick a time, see what it costs (often nothing) and get a reminder.', buttonLabel: s.cta, buttonHref: '~/booking', fullLabel: 'Waitlist', useEvents: true, rows: sessions.slice(0, 3), register: 'auto' } },
    { type: 'NewWorldGallery', props: { index: n(10), eyebrow: 'Gallery', title: 'Real *nights.*', lede: 'Photos from people who were there.', images: GALLERY.filter((g) => !PHOTOS[niche].includes(g)).slice(0, 5).map((g) => ({ image: pic(g), alt: PHOTO_ALT[g] ?? '' })), register: 'auto' } },
    { type: 'NewWorldPosts', props: { index: n(11), eyebrow: 'Notes', title: 'Good to *read.*', lede: 'Notes from the room, written by the people in it.', buttonLabel: '', buttonHref: '', rows: s.posts.map(([kind, title]) => ({ kind, title, meta: '', href: '' })), register: 'auto' } },
    ...(s.products
      ? [{ type: 'NewWorldShop', props: { index: n(11), ...head(c('shop'), 'Shop'), buttonLabel: '', buttonHref: '', rows: s.products.map(([name, body], i) => ({ icon: ['tag', 'heart', 'sparkle'][i % 3], meta: 'Set your price', name, body, price: '', href: '' })), register: 'auto' } }]
      : []),
    {
      type: 'NewWorldProcess',
      props: {
        index: n(12), eyebrow: 'How it works', title: 'How a first time *goes.*', lede: '',
        rows: [
          { icon: 'calendar', title: 'Pick a time', body: 'Choose a group or a date from the calendar. It takes a minute.' },
          { icon: 'message', title: 'We remind you', body: 'The day before you get the facts: who is hosting, how long, what to bring.' },
          { icon: 'users', title: 'The door', body: 'Someone says hello, learns your name and walks you in. Check-in is one tap.' },
          { icon: 'heart', title: 'Come back', body: 'Same place, same time. The second visit is when it starts to feel like yours.' },
        ],
        register: 'auto',
      },
    },
    {
      type: 'NewWorldWhere',
      props: {
        index: n(13), eyebrow: 'Where we meet', title: 'Where to *find us.*', lede: '', address: slot('address', 'Your street, Your City'), phone: slot('phone', 'Your phone'), email: slot('email', 'Your email'),
        hours: [{ day: 'Hours', time: slot('hours', 'Your hours') }], areas: AREAS, image: '', alt: '', mapLabel: 'Map · where we meet', register: 'auto',
      },
    },
    { type: 'NewWorldAsk', props: { index: n(14), eyebrow: 'Say hello', title: 'Ask us *anything.*', lede: 'A person answers.', buttonLabel: 'Send', successMessage: 'Thanks. A person will reply soon.', register: 'auto' } },
    { type: 'NewWorldLetter', props: { eyebrow: 'Newsletter', title: 'Stay in *the loop.*', lede: 'A short note when something is coming up. Nothing else.', placeholder: 'you@email.com', buttonLabel: 'Join', successMessage: 'Thanks. You are on the list.', register: 'auto' } },
    {
      type: 'NewWorldFaq',
      props: {
        index: n(15), eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.', phone: slot('phone', 'Your phone'), email: slot('email', 'Your email'), hours: slot('hours', 'Your hours'),
        areasLabel: 'Where we meet', areas: AREAS, rows: FAQ, register: 'auto',
      },
    },
    {
      type: 'NewWorldTools',
      props: {
        index: n(16), eyebrow: 'Behind the door', title: 'The tools that *run this place.*', lede: 'A calendar, check-in at the door, memberships, your member list and a page you edit yourself. It all runs on Frequency, and your people stay yours.',
        buttonLabel: '', buttonHref: '', secondaryLabel: '', secondaryHref: '', note: '',
        rows: [
          { icon: 'users', title: 'Groups', body: 'Recurring gatherings with their own page and members' },
          { icon: 'calendar', title: 'Calendar', body: 'Every event on your site and in the app' },
          { icon: 'check', title: 'The door', body: 'A QR code that turns walk-ins into contacts' },
          { icon: 'award', title: 'Memberships', body: 'Sold from day one, with the member dropped into their group' },
          { icon: 'tag', title: 'Tickets', body: 'A guest list, refunds and money paid to you' },
          { icon: 'heart', title: 'Your people', body: 'Yours to keep. Export any time.' },
        ],
        register: 'auto',
      },
    },
    { type: 'NewWorldCloser', props: { aside: s.quote, title: star(c('cta')), primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: 'Bring someone', secondaryHref: '~/booking', note: '', register: 'auto' } },
  ]
}

const FAQ = [
  { question: 'I do not know anyone. Is that a problem?', answer: 'No. Most people walk in alone the first time. Say here who meets them at the door.' },
  { question: 'Do I need to book?', answer: 'You can. Booking holds your spot and sends a reminder. Say here if people can also just walk in.' },
  { question: 'What if I cannot make it?', answer: 'Change or cancel from the confirmation email. Say how late is too late.' },
  { question: 'Can I bring someone?', answer: 'Say yes if they can, and what it costs them the first time.' },
]

function pages(s: Spec, niche: NewWorldKitNiche): KitPage[] {
  const home = newWorldHome(s, niche)
  // The pages reuse Home's own sections (team, notes, plans, questions, closer) so a change an owner makes to one reads the same everywhere.
  const from = (type: string, patch: Record<string, unknown> = {}): Block | null => {
    const b = home.find((x) => x.type === type)
    return b ? { type, props: { ...b.props, ...patch } } : null
  }
  const has = (type: string) => home.some((x) => x.type === type)
  const icons = ['users', 'calendar', 'award', 'tag']
  const pics = GALLERY.filter((g) => !PHOTOS[niche].includes(g))
  const ways = s.offers.map((o, i) => ({
    icon: icons[i % icons.length]!, tags: 'Way in', name: slot(`offer${i + 1}Title`, o.name), body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, o.price),
    when: o.dur, image: pic(pics[i % pics.length]!), alt: PHOTO_ALT[pics[i % pics.length]!] ?? '', buttonLabel: /^free$/i.test(o.price) ? 'Come once' : 'Save my spot', href: '~/booking',
  }))
  const [, storyPic] = PHOTOS[niche]
  const owner = slot('person1Name', s.owner)
  const c = (k: Section) => copy(s, k)
  const shop = from('NewWorldShop', { index: '' })
  const services: (Block | null)[] = [
    { type: 'NewWorldPageHead', props: { index: '', ...head(c('services'), 'Ways in'), register: 'auto' } },
    { type: 'NewWorldWayRows', props: { costLabel: 'Cost', whenLabel: 'When', buttonLabel: 'Save my spot', buttonHref: '~/booking', secondaryLabel: 'Questions', secondaryHref: '#faq', rows: ways, register: 'auto' } },
    has('NewWorldPlans') ? from('NewWorldPlans', { index: '' }) : null,
    shop,
    {
      type: 'NewWorldAlways',
      props: { index: '', eyebrow: 'Every visit', title: 'Always *true here.*', items: s.trust.map(([t]) => t), register: 'auto' },
    },
    from('NewWorldFaq', { index: '' }),
    from('NewWorldCloser'),
  ]
  const about: (Block | null)[] = [
    {
      type: 'NewWorldAboutHero',
      props: {
        eyebrow: `Our story · ${slot('name', s.name)}`, title: `${s.story2[0]} *${s.story2[1]}*`, lead: s.story[0] ?? '',
        chips: s.trust.slice(0, 3).map(([t], i) => ({ icon: ['check', 'users', 'heart'][i], text: t })),
        primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: s.cta2, secondaryHref: '~/',
        image: pic(storyPic), alt: PHOTO_ALT[storyPic] ?? '', name: owner, role: s.role, register: 'auto',
      },
    },
    {
      type: 'NewWorldLongStory',
      props: {
        index: '01', eyebrow: 'The story', title: 'How this *room works.*',
        paragraphs: [...s.story, 'Most of what happens here is free to walk into. The things that cost money say so plainly. Behind the scenes it all runs on Frequency: the groups, the calendar, the door and the memberships live in one place, and the people stay ours.'],
        register: 'auto',
      },
    },
    { type: 'NewWorldQuote', props: { label: `In ${owner}'s words`, quote: s.quote.replace(/\s(\S+)$/, ' *$1*'), by: `${owner} · ${s.role}`, register: 'auto' } },
    {
      type: 'NewWorldPromises',
      props: {
        index: '02', eyebrow: 'What you can count on', title: 'Three *promises.*', lede: '',
        rows: [
          { icon: 'check', title: 'Open doors', body: 'Joining is free. No velvet rope, nothing members-only.' },
          { icon: 'users', title: 'Same faces', body: 'Groups meet at the same time in the same place, so coming back is easy and someone notices when you do.' },
          { icon: 'heart', title: 'Bring someone', body: 'A first visit with a friend is celebrated. Word of mouth is how this room fills.' },
        ],
        register: 'auto',
      },
    },
    from('NewWorldTeam', { index: '03' }),
    from('NewWorldPosts', { index: '04' }),
    from('NewWorldCloser'),
  ]
  const calendar = (home.find((x) => x.type === 'NewWorldCalendar')?.props?.rows ?? []) as Record<string, unknown>[]
  const booking: (Block | null)[] = [
    {
      type: 'NewWorldBook',
      props: {
        eyebrow: 'Save a spot', title: 'Pick a night *and come.*', lede: 'Live spots, what it costs (often nothing) and a reminder the day before with the facts.',
        summaryLabel: 'Every booking', facts: [{ label: 'Reminder', value: 'The day before' }, { label: 'Changes', value: 'Any time, from the email' }, { label: 'Bring someone', value: 'Say so when you book' }],
        waysLabel: 'Choose a way in', ways: s.offers.map((o, i) => ({ name: slot(`offer${i + 1}Title`, o.name), body: slot(`offer${i + 1}Blurb`, o.meta), meta: `${slot(`offer${i + 1}Price`, o.price)} · ${o.dur}`, href: '' })),
        timesLabel: 'Next open times', useEvents: true, rows: calendar.slice(0, 4), note: 'Change or cancel any time. No one minds.', buttonLabel: '', buttonHref: '', register: 'auto',
      },
    },
    from('NewWorldAsk', { index: '' }),
  ]
  const compact = (xs: (Block | null)[]) => xs.filter((b): b is Block => b !== null)
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo(s.name, s.descriptor), blocks: home },
    { slug: 'services', label: 'Ways in', seo: seo('Ways in', `${s.name}: every way in and what it costs.`), blocks: compact(services) },
    { slug: 'about', label: 'Our story', seo: seo('Our story', `Who is behind ${s.name}.`), blocks: compact(about) },
    { slug: 'booking', label: 'Book', seo: seo('Book', `Pick a time at ${s.name}.`), blocks: compact(booking) },
  ]
}

export function newWorldKit(niche: NewWorldKitNiche): NewWorldKit {
  const s = SPECS[niche]
  return {
    id: `new-world-${niche}`, version: 1, theme: 'NewWorld', niche, label: s.label, description: s.description,
    palette: s.palette, tools: s.tools,
    // Tide (#1AA7C0, a brand accent is a hex) is the one shipped accent that matches a kit's palette (blue). The rest wait on LIVE-2041.
    ...(s.palette === 'blue' ? { accent: NEW_WORLD_ACCENTS.tide.accent } : {}),
    pages: pages(s, niche),
  }
}
