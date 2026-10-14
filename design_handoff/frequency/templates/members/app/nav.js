/* Frequency member navigation, one source. Mirrors frequency-web: lib/nav-areas.ts (left rail),
   lib/nav/registry.ts profile sections (account menu), lib/layout/rail-panels.ts (right rail rules).
   Prototype hrefs point at the nearest screen in templates/members. */
window.FQ_NAV = {
  /* header mega menu: identical on every member page (lifted from the Feed) */
  mega: (function(){ var M = {
      home: { label: 'Home',
        cols: [
          { h: 'Today', items: [
            { label: 'Feed', sub: 'What your people are up to', href: 'Members.dc.html', icon: 'page' },
            { label: 'Around You', sub: 'Dispatches from nearby hosts', href: 'Search.html', icon: 'pin' },
            { label: 'Journal', sub: 'Your private captured moments', href: 'Profile.html', icon: 'tip' },
          ]},
          { h: 'Find', items: [
            { label: 'Search', sub: 'People, Circles, events, Spaces', href: 'Search.html', icon: 'search' },
            { label: 'Messages', sub: 'Friends, groups, rooms', href: 'Messages.html', icon: 'message' },
            { label: 'My Code', sub: 'Your QR. Connect in person', href: 'Profile.html', icon: 'qr' },
          ]},
        ],
        cards: [
          { bg: 'night-string-lights-web.jpg', kicker: 'This week', title: 'Gatherings near you', href: 'Events.html' },
          { bg: 'day-beach-hoop.jpg', kicker: 'Fri · 6am', title: 'Bird Rock Sunrise Circle', href: 'Circle.html' },
        ],
        foot: 'Day 12. You showed up again.', footCta: 'Tune out', footHref: 'Mindless.html' },
      community: { label: 'Community',
        cols: [
          { h: 'Gather', items: [
            { label: 'Circles', sub: 'Small groups that meet', href: 'Circles.html', icon: 'circle' },
            { label: 'Events', sub: 'RSVP, tickets, check in', href: 'Events.html', icon: 'event' },
            { label: 'Channels', sub: 'Seven topics under four Pillars', href: 'Messages.html', icon: 'program' },
          ]},
          { h: 'People and places', items: [
            { label: 'Members', sub: 'Friends, people, contacts', href: 'Members.dc.html', icon: 'contacts' },
            { label: 'Business Spaces', sub: 'Studios, cafés, non profits', href: 'Circles.html', icon: 'space' },
            { label: 'Marketplace', sub: 'Market, Classifieds, Housing, Store', href: 'Marketplace.html', icon: 'ticket' },
          ]},
        ],
        cards: [
          { bg: 'day-meditation-circle.jpg', kicker: 'Forming now', title: 'Leucadia Thursday Circle, 12 people', href: 'Circle.html' },
          { bg: 'gathering-03.jpg', kicker: 'Sat · 10am', title: 'Garden pack-out at Low Tide Café', href: 'Event.html' },
        ],
        foot: 'Build circles, not walls.', footCta: 'Find your Circle', footHref: 'Circles.html' },
      quest: { label: 'The Quest',
        cols: [
          { h: 'Play', items: [
            { label: 'My Quest', sub: 'Shed season · Week 6 of 13', href: 'Journey.html', icon: 'standing' },
            { label: 'Practices', sub: 'The daily act. Adopt and log', href: 'Journey.html', icon: 'checkin' },
            { label: 'Journeys', sub: 'Mind, Body, Spirit. Run together', href: 'Journey.html', icon: 'program' },
          ]},
          { h: 'Earn and spend', items: [
            { label: 'Mindless', sub: 'Be Still or Get Moving', href: 'Mindless.html', icon: 'breath' },
            { label: 'The Vault', sub: 'Gems, Zaps, Awards', href: 'The Vault.html', icon: 'gem' },
            { label: 'Leaderboard', sub: 'Local and cooperative', href: 'The Vault.html', icon: 'zap' },
          ]},
        ],
        cards: [
          { bg: 'day-park-yoga.jpg', kicker: 'Body Journey', title: 'Starts in 9 days', href: 'Journey.html' },
          { bg: 'day-parachute-play.jpg', kicker: 'Expression Challenge', title: 'Teach your Circle one thing', href: 'Journey.html' },
        ],
        foot: 'Only showing up earns Zaps.', footCta: 'Open My Quest', footHref: 'Journey.html' },
      you: { label: 'You',
        cols: [
          { h: 'You', items: [
            { label: 'My profile', sub: 'Daniel Tyack · Initiate', href: 'Profile.html', icon: 'standing' },
            { label: 'Orders', sub: 'Tickets, purchases, refunds', href: 'The Vault.html', icon: 'ticket' },
            { label: 'Partners', sub: 'Local offers and plaques', href: 'Marketplace.html', icon: 'host' },
          ]},
          { h: 'Account', items: [
            { label: 'Join Crew', sub: 'Pay what you want', href: 'Settings.html', icon: 'membership' },
            { label: 'Help and support', sub: 'Ask Vera, open a ticket', href: 'Help.html', icon: 'tip' },
            { label: 'Settings', sub: 'Notifications, privacy, plan', href: 'Settings.html', icon: 'nudge' },
          ]},
        ],
        cards: [
          { bg: 'gathering-07.jpg', kicker: '⚡ 340 · 💎 85', title: '12-day streak. 2 freezes saved', href: 'The Vault.html' },
          { bg: 'gathering-08.jpg', kicker: 'Analysis', title: 'Site map of every member surface', href: 'Site Map.html' },
        ],
        foot: 'Your people stay yours.', footCta: 'View profile', footHref: 'Profile.html' },
    };
     return M; })(),
  megaIcons: { home: 'page', community: 'circle', quest: 'standing', you: 'contacts' },
  rail: [
    { section: null, items: [
      { key: 'feed', label: 'Feed', href: 'Members.dc.html', icon: 'home' }
    ]},
    { section: 'Community', items: [
      { key: 'nearby', label: 'Around You', href: 'Search.html', icon: 'pin' },
      { key: 'circles', label: 'Circles', href: 'Circles.html', icon: 'circle' },
      { key: 'channels', label: 'Channels', href: 'Messages.html#channels', icon: 'program' },
      { key: 'events', label: 'Events', href: 'Events.html', icon: 'event' },
      { key: 'market', label: 'Marketplace', href: 'Marketplace.html', icon: 'tag' },
      { key: 'messageBoards', label: 'Message Boards', href: 'Messages.html#boards', icon: 'message' },
      { key: 'people', label: 'Members', href: 'Search.html#people', icon: 'contacts' },
      { key: 'spaces', label: 'Business Spaces', href: 'Search.html#spaces', icon: 'space' }
    ]},
    { section: 'The Quest', items: [
      { key: 'quest', label: 'My Quest', href: 'Journey.html', icon: 'standing' },
      { key: 'journeys', label: 'Journeys', href: 'Journey.html#journeys', icon: 'compass' },
      { key: 'practices', label: 'Practices', href: 'Mindless.html', icon: 'practice' },
      { key: 'vault', label: 'The Vault', href: 'The Vault.html', icon: 'vault' }
    ]},
    { section: 'Admin', items: [
      { key: 'lead', label: 'Leadership', href: '../admin/Overview.html', icon: 'host' }
    ]}
  ],
  myFrequency: {
    personal: [
      { label: 'Profile', href: 'Profile.html' },
      { label: 'Journal', href: 'Profile.html#journal' },
      { label: 'My Contacts', href: 'Search.html#people' },
      { label: 'Drafts', href: 'Profile.html#drafts', n: 2 }
    ],
    spaces: [{ label: 'Royal Temple', href: '../admin/Overview.html', n: 3 }],
    circles: [
      { label: 'Bird Rock Sunrise Circle', href: 'Circle.html', n: 4 },
      { label: 'Cardiff Movers', href: 'Circle.html' }
    ]
  },
  account: [
    { section: 'You', items: [['Settings', 'Settings.html', 'settings'], ['Notifications', 'Settings.html#notifications', 'nudge']] },
    { section: 'Membership', items: [['Billing and plans', 'Settings.html#billing', 'membership']] },
    { section: 'Commerce', items: [['My orders', 'The Vault.html#orders', 'ticket']] },
    { section: 'Community', items: [['Friends', 'Search.html#people', 'invite'], ['My code', 'Profile.html#code', 'qr']] },
    { section: 'Support', items: [['Help', 'Help.html', 'help'], ['Site map', 'Site Map.html', 'map']] }
  ],
  /* file → rail key */
  pages: {
    'Members.dc.html': 'feed', 'Search.html': 'nearby', 'Circles.html': 'circles', 'Circle.html': 'circles',
    'Events.html': 'events', 'Event.html': 'events', 'Marketplace.html': 'market', 'Messages.html': 'messageBoards',
    'Journey.html': 'quest', 'Mindless.html': 'practices', 'The Vault.html': 'vault', 'Profile.html': 'myfreq'
  },
  /* right rail page panels per rail key (rail-panels.ts RULES). Quest pages own standing, so it is suppressed there. */
  panels: {
    events: ['events', 'online', 'circles'],
    circles: ['circles', 'newcircles', 'activenow', 'events'],
    quest: ['leaderboard', 'online'], journeys: ['leaderboard', 'online'], practices: ['leaderboard', 'online'], vault: ['leaderboard', 'online'],
    nearby: ['events', 'activenow', 'newcircles'], people: ['online', 'circles', 'events'], messageBoards: ['online', 'circles', 'events'],
    market: ['activenow', 'events'],
    _default: ['pulse', 'activenow', 'newcircles', 'events']
  },
  questKeys: ['quest', 'journeys', 'practices', 'vault']
};
