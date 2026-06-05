import type { Data } from '@measured/puck'

// The Quest, rebuilt from the standardized block library so the editor mirrors the
// live page (ADR-055 / "editor = live"). Bespoke coded bits approximated: the six
// season-rank cards → a numbered FeatureGrid; the PillarNav triptych (nav chrome) →
// omitted. Icons mapped to the editor's curated 16-icon set. Review on the preview.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'tq-hero', variant: 'image',
        eyebrow: 'The Quest',
        title: 'Showing up should count.', titleAccent: '',
        subtitle: 'Most apps reward the time you lose to them. The Quest rewards the time you give back to real people. Real life is the high score, and you climb it by becoming someone your community misses.',
        image: '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg', focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta',
        ctaSecondaryLabel: '', ctaSecondaryHref: '', note: '',
        tone: 'surface', width: 'default', align: 'center', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tq-premise-h', eyebrow: 'The premise',
        title: 'Most games waste your life. This one builds it.', titleAccent: '',
        kicker: 'The reward loop, pointed at the things that actually matter.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tq-premise-b',
        body: 'We know what a good game does to a person: it pulls you back, gives you something to climb, makes progress feel inevitable. The trouble is that almost every game spends that pull on nothing. The Quest spends it on the opposite — it points the whole loop at the things that genuinely make a life: showing up, being missed, holding the door for the next person.\n\nYou don’t grind points. You build a reputation in a real place, with real people, who notice when you’re there and feel it when you’re not. The score is just a mirror held up to that.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tq-stmt-1', text: 'Not points to grind. A person to become.', accent: 'A person to become.', tone: 'surface', layout: L },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tq-currencies', image: '/images/site/PHOTO-2020-10-07-14-38-02.jpeg',
        alt: 'A Frequency circle gathered close together, laughing in golden afternoon light',
        eyebrow: 'Two currencies', title: 'Zaps in person. Gems on platform.', titleAccent: '',
        kicker: 'One for the room. One for the thread that keeps it warm.',
        body: 'Zaps are earned in the flesh. You show up to the sunrise circle, you host the sauna night, you bring a stranger who becomes a regular. Zaps are the weight of being there — the part no screen can fake.\n\nGems are earned on the platform: the small acts that keep a Circle alive between gatherings. A welcome to the newcomer, an event that fills the calendar, the photo that pulls everyone back. Both flow to the same place: a path you can feel under your feet.',
        side: 'left', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tq-earn-h', eyebrow: 'What you earn', title: 'Earned by being there.', titleAccent: '',
        kicker: 'Two ways to move, both pointed at real connection.',
        size: 'default', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tq-earn-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '2',
        items: [
          { icon: 'Zap', image: '', title: 'Zaps', body: 'In-person gratitude. Earned when you show up, host, or bring someone new into the room. The currency of presence.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Gems', body: 'On-platform care. Earned by welcoming newcomers, filling the calendar, and keeping the thread warm between gatherings.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tq-ranks-h', eyebrow: 'Season ranks', title: 'From ghost to luminary.', titleAccent: '',
        kicker: 'Not a leaderboard. A record of who you became this season.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tq-ranks-b',
        body: 'Each season you climb a path that mirrors your place in the community: from the stranger who just found the room to the person a whole neighborhood would miss. Ranks reset, because the point was never the badge. The point is who you become getting there.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tq-ranks-grid', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '2',
        items: [
          { icon: 'Star', image: '', title: 'Ghost · Just arrived', body: 'You found the room. Nobody knows your name yet, and that’s exactly where everyone starts.', href: '' },
          { icon: 'Compass', image: '', title: 'Runner · Showing up', body: 'You keep coming back. The same faces start to expect you, and the standing time becomes yours.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Operative · Known by name', body: 'You’re a regular now. You notice the newcomer in the corner, and you’re the one who says hello.', href: '' },
          { icon: 'Shield', image: '', title: 'Agent · Holding the door', body: 'You carry a Circle. You bring people in, smooth the rough edges, and keep the standing time alive.', href: '' },
          { icon: 'Users', image: '', title: 'Conduit · Seeding the next', body: 'When your Circle fills, you seed the next one. You connect rooms that didn’t know each other.', href: '' },
          { icon: 'Sun', image: '', title: 'Luminary · Missed by many', body: 'A whole neighborhood is warmer because you kept showing up. The community would feel your absence.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tq-stmt-2', text: 'You level up by becoming someone your community misses.', accent: 'your community misses.', tone: 'surface', layout: L },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tq-quests', image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A Frequency music circle gathered on a cliffside at golden hour',
        eyebrow: 'Quests', title: 'A journey worth taking.', titleAccent: '',
        kicker: 'Seasonal paths with a beginning, a middle, and a changed you at the end.',
        body: 'A Quest is a multi-step seasonal journey you choose to walk: a string of real-world steps that add up to something. A 30 morning cold-plunge streak. Hosting your first supper club. Bringing three friends into a Circle and watching them stay.\n\nQuests give a season its shape. They turn a vague intention to be more present into a path with a next step always lit, and a community walking it beside you. You don’t finish a Quest with more points — you finish it as someone a little more woven in.',
        side: 'right', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tq-rewards-h', eyebrow: 'What it rewards', title: 'Pointed at the right things.', titleAccent: '',
        kicker: 'Every mechanic answers to one rule: does this build real community?',
        size: 'default', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tq-rewards-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'MapPin', image: '', title: 'Presence over scrolling', body: 'The biggest rewards live off the screen. Zaps come from being in the room, so the Quest pulls you toward people, never deeper into a feed.', href: '' },
          { icon: 'Handshake', image: '', title: 'Generosity over grinding', body: 'You rise by bringing others in and holding the door, not by farming points. The path rewards the people who make the room warmer.', href: '' },
          { icon: 'Compass', image: '', title: 'Rhythm over streaks', body: 'Ranks reset each season so nobody is ever too far ahead to catch. It’s a fresh climb, an open invitation, not a ladder you missed.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Marquee',
      props: {
        id: 'tq-marquee',
        items: [
          { text: 'Show up' }, { text: 'Earn zaps' }, { text: 'Climb your rank' },
          { text: 'Walk a Quest' }, { text: 'Bring someone new' }, { text: 'Be missed when you’re gone' },
        ],
        layout: L,
      },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tq-membership', image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
        alt: 'People dancing together with arms raised at golden hour, faces lit and joyful',
        eyebrow: 'Why it matters', title: 'Membership turns on the Quest.', titleAccent: '', kicker: '',
        body: 'The Quest is the part of membership that pulls you off the screen and into the room. It’s the engine that turns a good intention into a standing habit, and a standing habit into the people who know your name.\n\nThe community is free, forever. The Quest, and the rooms it fills, is what membership keeps open. You’re not buying points — you’re funding the place where showing up gets to count.',
        side: 'right', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'ink', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tq-stmt-3', text: 'Real life is the high score.', accent: 'high score.', tone: 'ink', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'tq-start-h', eyebrow: 'Where it starts', title: 'Your first season begins now.', titleAccent: '',
        kicker: 'The founding cohort is climbing it together in North County San Diego.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tq-start-b',
        body: 'Every player starts as a ghost. Join the beta and you start your first season alongside the founding members — the people shaping what these ranks and Quests even mean. Show up once, earn your first zap, and watch the path light up. You can begin anywhere: all it takes is a Circle and a standing time. Season one is open.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'tq-cta', eyebrow: '', heading: 'Start your first season.', headingAccent: '',
        body: 'Pick a Circle, show up, and earn your first zap. The high score is a life you’re actually living.',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta', ctaSecondaryLabel: '', ctaSecondaryHref: '',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
