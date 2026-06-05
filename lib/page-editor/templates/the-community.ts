import type { Data } from '@measured/puck'

// The Community, rebuilt from the standardized block library so the editor mirrors
// the live page (ADR-055 / "editor = live"). Three bespoke coded sections have no
// block equivalent and are approximated here: the interactive ProductTour → a
// FeatureGrid of the four app surfaces; the "one ordinary Tuesday" timeline → a
// numbered FeatureGrid; the PillarNav triptych (nav chrome) → omitted. Review on
// the preview before publishing.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'tc-hero', variant: 'image',
        eyebrow: 'The Community',
        title: 'You don’t need another app. You need your people.',
        titleAccent: '',
        subtitle: 'Most communities are a feed and a hope. Frequency has a structure that actually grows, and it only takes two words to belong.',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg', focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta',
        ctaSecondaryLabel: '', ctaSecondaryHref: '', note: '',
        tone: 'surface', width: 'default', align: 'center', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-premise-h', eyebrow: 'The premise',
        title: 'The cure for too many feeds isn’t one more.', titleAccent: '',
        kicker: 'It’s a few real people, near you, who notice when you’re gone.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tc-premise-b',
        body: 'You already have the apps. What you’re missing is the standing time, the handful of faces, the small group small enough that your absence leaves a hole. That’s not a feature you download. It’s a structure you join.\n\nFrequency gives community a shape: four channels to find your practice, interests to find your people, and Circles to actually belong. No application, no audition, two words and you’re in the room.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tc-stmt-1', text: 'Not a feed. Not a follower count. A few people who notice.', accent: 'A few people who notice.', tone: 'surface', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-channels-h', eyebrow: 'The four channels',
        title: 'A whole life has four channels.', titleAccent: '',
        kicker: 'Mind, Body, Spirit, Expression. Start in any of them.',
        size: 'default', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tc-channels-b',
        body: 'Channels are the four domains a real life moves through. They’re the map you arrive on: pick the one that’s calling you right now, and the interests and Circles inside it are where you actually land.',
        size: 'lg', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-channels-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '2',
        items: [
          { icon: 'Star', image: '', title: 'Mind', body: 'Meditation, breathwork, learning, the quiet practices that settle a nervous system and sharpen a life.', href: '' },
          { icon: 'Flame', image: '', title: 'Body', body: 'Movement, strength, cold and heat, the run club and the sauna night. The practices you feel the next morning.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Spirit', body: 'Ceremony, sound, human relating, the men’s table and the women’s circle. The work you do shoulder to shoulder.', href: '' },
          { icon: 'Music', image: '', title: 'Expression', body: 'Music, art, dance, making things with your hands. The creative practices that need a room and a crowd.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-steps-h', eyebrow: 'From the people, not the org chart',
        title: 'Three steps to belong.', titleAccent: '',
        kicker: 'No application. No audition. Two words and you’re in the room.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-steps-grid', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '3',
        items: [
          { icon: 'Compass', image: '', title: 'Pick what you practice', body: 'Choose a channel, then an interest inside it: breathwork, strength, supper clubs, sound. It’s the thread that ties you to people who care about the same thing.', href: '' },
          { icon: 'Users', image: '', title: 'Join a Circle', body: 'Find your people near you. A small standing group built around your interest, with an always-on virtual space and a standing time to meet in person.', href: '' },
          { icon: 'CalendarDays', image: '', title: 'Show up', body: 'That’s the whole secret. Small enough that you’re missed when you don’t come, so showing up stops feeling like effort and starts feeling like home.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tc-interests', image: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
        alt: 'A Frequency Circle gathered for breathwork outdoors',
        eyebrow: 'Where you belong', title: 'Interests and Circles', titleAccent: '',
        kicker: 'Two words are all it takes to find your place.',
        body: 'An interest is what you practice: a topic inside a channel. Surfing, sound baths, strength, human relating. It connects you to people everywhere who care about the same things you do.\n\nA Circle is your people, near you. A small standing group built around an interest, with an always-on virtual space, and a standing time to meet in person. Small enough that you’re missed when you don’t show up.',
        side: 'left', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-app-h', eyebrow: 'The app', title: 'Your people, in your pocket.', titleAccent: '',
        kicker: 'The four things you’ll actually use.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-app-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '2',
        items: [
          { icon: 'Zap', image: '', title: 'The Feed', body: 'The pulse of your people. What’s happening near you, right now — no algorithm, no outrage, just real life.', href: '' },
          { icon: 'Users', image: '', title: 'Circles', body: 'Small rooms around the things you love. Where strangers near you turn into your people.', href: '' },
          { icon: 'CalendarDays', image: '', title: 'Events', body: 'Close the laptop and show up. One tap to RSVP, and now you’re expected.', href: '' },
          { icon: 'MessageCircle', image: '', title: 'Channels', body: 'Mind, Body, Spirit, Expression — tune in and the interests and Circles inside light up.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tc-stmt-2', text: 'Two words are all you need to belong.', accent: 'belong', tone: 'surface', layout: L },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tc-growth', image: '/images/site/PHOTO-2020-09-09-16-38-27.jpeg',
        alt: 'A large Frequency community practicing yoga together on a lawn',
        eyebrow: 'How it grows', title: 'It spreads like cells, not franchises.', titleAccent: '', kicker: '',
        body: 'Circles are designed to divide. When one fills up, it doesn’t put people on a waitlist. It seeds a new Circle, led by someone who was ready to step up.\n\nA handful of neighbouring Circles becomes a neighborhood. Neighborhoods become a whole local community. None of it is appointed from above. It grows on its own momentum, the way real things do.',
        side: 'right', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-shape-h', eyebrow: 'The shape of it', title: 'From one Circle to a whole community.', titleAccent: '',
        kicker: 'Nobody hands it down. It grows from the inside out.',
        size: 'default', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-shape-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Users', image: '', title: 'A Circle', body: 'A handful of neighbors around one interest. The smallest unit that can hold you.', href: '' },
          { icon: 'MapPin', image: '', title: 'A neighborhood', body: 'Circles that divide and multiply until your corner of the map is full of them.', href: '' },
          { icon: 'Leaf', image: '', title: 'A community', body: 'A whole local ecosystem: leaderful, self-sustaining, grown rather than built.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'MediaText',
      props: {
        id: 'tc-guru', image: '/images/site/PHOTO-2020-10-17-13-49-14.jpeg',
        alt: 'A Frequency music circle gathered on a cliffside at golden hour',
        eyebrow: 'Why it lasts', title: 'Guru-free. By design.', titleAccent: '', kicker: '',
        body: 'Communities built around one charismatic founder live and die with that person. We’ve all watched it happen. So Frequency is built to be the opposite: leaderful, not leader-dependent.\n\nLeaders rise from showing up, not from being anointed. Take the same structure away from any one of us and it keeps running, because the practices, the places, and the people were the point all along.',
        side: 'right', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'ink', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Marquee',
      props: {
        id: 'tc-marquee',
        items: [
          { text: 'Pick what you practice' }, { text: 'Join a Circle' }, { text: 'Show up' },
          { text: 'Be missed when you don’t' }, { text: 'Lead by showing up' }, { text: 'Pay it forward' },
        ],
        layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-holds-h', eyebrow: 'What holds it together', title: 'Leaderful, not leader-dependent.', titleAccent: '',
        kicker: 'Three things keep a Circle standing on its own.',
        size: 'default', tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-holds-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'CalendarDays', image: '', title: 'Small and standing', body: 'Circles stay small on purpose. A standing time, the same faces, and the quiet accountability of being noticed.', href: '' },
          { icon: 'Leaf', image: '', title: 'Earned, not appointed', body: 'Leaders rise from showing up and looking after the people around them, never from being anointed from above.', href: '' },
          { icon: 'Handshake', image: '', title: 'Pay it forward', body: 'When you can give a little more, you hold the door for the next person. Circulation, not exclusion.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'tc-stmt-3', text: 'The practices, the places, and the people are the point.', accent: 'the people', tone: 'surface', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-day-h', eyebrow: 'A day in Frequency', title: 'One ordinary Tuesday.', titleAccent: '',
        kicker: 'How the thread pulls you back to people.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'tc-day-grid', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '2',
        items: [
          { icon: 'Sun', image: '', title: '6:15a · The bluff before work', body: 'Your Sunrise Breathwork circle meets on Moonlight Beach. Cold, gold, quiet. You leave regulated instead of wired.', href: '' },
          { icon: 'MessageCircle', image: '', title: '9:40a · A ping from the circle', body: 'Someone posts a photo from the morning. A few zaps, a couple of replies. The thread keeps the warmth alive between meetings.', href: '' },
          { icon: 'CalendarDays', image: '', title: '1:00p · One tap to RSVP', body: 'An event drops for Saturday’s thermal circuit. You tap RSVP. Now you’re expected, and you’ll be missed if you don’t show.', href: '' },
          { icon: 'MapPin', image: '', title: '6:30p · Meet in the flesh', body: 'After work you walk into the room. Faces you know from the feed are already there. The app brought you here; the people take over.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'tc-where-h', eyebrow: 'Where it starts', title: 'It begins in one real place.', titleAccent: '',
        kicker: 'The founding community is taking shape in North County San Diego.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'tc-where-b',
        body: 'Every cell starts somewhere. Ours is taking root in North County San Diego: real Circles, real gatherings, real neighbors who show up for each other. Join the beta and you’re not a number on a waitlist; you’re one of the people this whole thing grows from. And you can start anywhere: a Circle only needs a few people and a standing time.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'tc-cta', eyebrow: '', heading: 'Find your people.', headingAccent: '',
        body: 'Pick what you practice, find a Circle near you, and start showing up.',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta', ctaSecondaryLabel: '', ctaSecondaryHref: '',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
