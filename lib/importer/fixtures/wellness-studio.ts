// A realistic HAND-AUTHORED sample BusinessProfile (P0, docs/BUSINESS-IMPORTER.md §8 DoD).
// A neighborhood wellness studio with a story, a few offerings, a bookable schedule, an
// upcoming event, a small team, hours, FAQ, links, and a rating summary. ZERO AI: this is the
// exact JSON shape the P1 Extract step must learn to produce. Copy here is plain and honest
// (docs/CONTENT-VOICE.md — no em dashes, no vibe-verbs, passes the skeptic test).

import type { BusinessProfile } from '../schema'

export const wellnessStudioFixture: BusinessProfile = {
  name: 'Still Water Wellness',
  brandName: 'Still Water',
  slug: 'still-water-wellness',
  type: 'business',
  tagline: 'A calm room for breathwork, yoga, and a slower kind of strong.',
  category: 'Wellness studio',
  accent: '--color-signal',

  about:
    'Still Water is a small studio on Elm Street. We teach breathwork, slow-flow yoga, and ' +
    'strength classes built for real bodies. Come as you are; leave a little lighter.',
  story:
    'We opened in 2021 with two mats and a kettle. What started as a Saturday class in the back ' +
    'of a bookshop grew into a full week of small, unhurried sessions. We keep classes small on ' +
    'purpose, so every person in the room gets seen.',

  contact: {
    address: '218 Elm Street, Portland, OR 97204',
    phone: '(503) 555-0142',
    email: 'hello@stillwater.example',
    website: 'https://stillwater.example',
    hours:
      'Mon to Fri: 7am to 8pm\nSat: 8am to 4pm\nSun: 9am to 1pm',
    socials: [
      { platform: 'instagram', url: 'https://instagram.com/stillwaterpdx' },
      { platform: 'google', url: 'https://g.page/stillwaterpdx' },
    ],
  },

  rating: { value: '4.9', count: '212 reviews' },
  reviews: [
    { author: 'Dana R.', text: 'The small classes make all the difference. I actually feel seen.', rating: 5 },
    { author: 'Marcus T.', text: 'Best breathwork in the city. Calm without being precious.', rating: 5 },
  ],

  offerings: [
    { title: 'Drop-in class', blurb: 'Any single class on the schedule.', price: 22, currency: 'USD', priceModel: 'fixed', durationMinutes: 60 },
    { title: 'Ten-class pack', blurb: 'Ten classes, use them any time.', price: 190, currency: 'USD', priceModel: 'from' },
    { title: 'Private breathwork session', blurb: 'One to one, tailored to you.', price: 95, currency: 'USD', priceModel: 'from', durationMinutes: 75 },
  ],

  team: [
    { name: 'Priya Sundaram', role: 'Founder and lead teacher' },
    { name: 'Leo Okafor', role: 'Breathwork guide' },
  ],

  events: [
    {
      title: 'New Moon Breathwork Circle',
      startsAt: '2099-01-15T02:00:00.000Z',
      endsAt: '2099-01-15T03:30:00.000Z',
      location: '218 Elm Street, Portland, OR',
      blurb: 'A monthly evening circle. Bring a blanket.',
    },
  ],

  faq: [
    { q: 'Do I need to bring my own mat?', a: 'No. We have plenty of clean mats. Bring one if you prefer your own.' },
    { q: 'Are classes beginner friendly?', a: 'Yes. Every class has options for a first day and a hundredth.' },
  ],

  links: [
    { platform: 'instagram', url: 'https://instagram.com/stillwaterpdx' },
    { platform: 'website', url: 'https://stillwater.example' },
  ],

  availability: [
    // Tue + Thu evenings, 9:00am to 5:00pm slots in the studio timezone, 60-minute slots.
    { weekday: 2, startMinute: 540, endMinute: 1020, slotMinutes: 60, timezone: 'America/Los_Angeles' },
    { weekday: 4, startMinute: 540, endMinute: 1020, slotMinutes: 60, timezone: 'America/Los_Angeles' },
  ],

  layoutHint: ['photoHero', 'about', 'story', 'offerings', 'booking', 'events', 'links', 'reviews', 'faq', 'contact'],
}
