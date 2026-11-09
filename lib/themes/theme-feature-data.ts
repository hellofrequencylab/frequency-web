// Data for the Nocturne-layout theme pages of Bold, Wildheart, Services and CyberWitch (/themes/bold, /themes/wildheart, /themes/services, /themes/cyberwitch). Default is not a theme people
// pick (New World is the default, owner ruling 2026-11-03), so it has no page here.
// The pictures are renders of each theme's own surfaces, stored under public/brand/theme-pages/<id>: the Website through the real
// site chrome and blocks, the Spotlight through the real shell on the theme's preset, the Space inside the real member shell and the
// Email through the real campaign mail (scripts/render/theme-pages-shots.render.tsx). Copy follows docs/marketing/voice-and-language-guide.md.

export type ThemeFeatureId = 'bold' | 'wildheart' | 'services' | 'cyberwitch'
export type ThemeFeatureSurface = 'site' | 'spotlight' | 'space' | 'email'

export const THEME_FEATURE_SURFACES: readonly { id: ThemeFeatureSurface; label: string; qual?: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 780, height: 1688 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email template', shot: 'email', width: 900, height: 760 },
]

export const themeFeatureShot = (id: ThemeFeatureId, shot: string): string => `/brand/theme-pages/${id}/${shot}.jpg`

interface ThemeFeatureCopy {
  id: ThemeFeatureId
  /** The name on the page. */
  name: string
  /** The accent the page chips and dots wear (a Frequency token, never a hex). */
  accentVar: string
  /** Two lines under the name: the first plain, the second in the iridescent italic. */
  tagline: [string, string]
  lead: string
  /** What the look is, in one line (the signature). */
  signature: string
  /** Who it is for, shown in the "make it yours" section. */
  madeFor: string
  faq: [string, string][]
}

export const THEME_FEATURES: Record<ThemeFeatureId, ThemeFeatureCopy> = {
  bold: {
    id: 'bold',
    name: 'Bold',
    accentVar: 'var(--fq-x-sun-neon)',
    tagline: ['Dark, graphic and direct.', 'Say it loud.'],
    lead:
      'Some rooms are not soft, and the page should not pretend they are. Bold is a charcoal ground, one bright accent, angled cuts and heavy headlines, ' +
      'read from one profile. It suits training, fitness, men’s work and anyone who runs a tough room.',
    signature: 'Charcoal ground, one bright accent, angled cuts and heavy uppercase headlines.',
    madeFor: 'training, men’s work, fitness and anyone who runs a tough room',
    faq: [
      ['Is Bold only for men’s work?', 'No. It was drawn for training and men’s groups, and it suits any room that wants to be direct. The words you write decide who it is for.'],
      ['Does it have a light version?', 'Bold is dark by design. The accent follows the season, so the page keeps a little life through the year.'],
      ['Can I change it later?', 'Press Change theme in your editor. Your words, offers and photos stay saved. Bold is only the dress they wear.'],
      ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers.'],
      ['Who owns my contacts?', 'You do. Sign-ups, RSVPs and check-ins build your list, and your list stays yours.'],
      ['What does it cost?', 'Free to start. Business when you charge.'],
    ],
  },
  wildheart: {
    id: 'wildheart',
    name: 'Wildheart',
    accentVar: 'var(--fq-x-sun-neon)',
    tagline: ['Parchment, violet,', 'and a sky that turns with the year.'],
    lead:
      'Slow, seasonal work deserves a page that keeps time with it. Wildheart is light parchment, violet, petal corners and a live sky, ' +
      'read from one profile. It suits astrology, ritual, retreats and anything that follows the year.',
    signature: 'Light parchment, violet, petal corners, and a live sky map and year journey.',
    madeFor: 'astrology, ritual, retreats and slow, seasonal work',
    faq: [
      ['What is the sky on the page?', 'A live line under the menu that names the season, the moon and the sign, so your site always knows what time of year it is.'],
      ['Is it only for astrology?', 'No. It suits retreats, ritual and any work that follows the seasons. The sky line is part of the look.'],
      ['Can I change it later?', 'Press Change theme in your editor. Your words, offers and photos stay saved. Wildheart is only the dress they wear.'],
      ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers.'],
      ['Who owns my contacts?', 'You do. Sign-ups, RSVPs and check-ins build your list, and your list stays yours.'],
      ['What does it cost?', 'Free to start. Business when you charge.'],
    ],
  },
  services: {
    id: 'services',
    name: 'Services',
    accentVar: 'var(--fq-x-aqua-neon)',
    tagline: ['Good work, done right.', 'Booked in a tap.'],
    lead:
      'People pick the one they trust, and they decide fast. Services puts your prices, your hours and a book button up front, with a ' +
      'glossy night look and a day register for bright rooms, read from one profile. It suits trades, salons, studios, clinics and anyone who shows up for clients.',
    signature: 'Night first and glossy, with a day register, one accent from six, and your services with a price and a length.',
    madeFor: 'trades, salons, studios, clinics and anyone who books, sells and shows up for clients',
    faq: [
      ['Is Services only for trades?', 'No. It has sixteen starter kits, from plumbers and cleaners to salons, tutors, trainers and clinics. Pick the closest one and change the words.'],
      ['Does it have a light version?', 'Yes. Night is the default, and Day flips the whole look for bright rooms. Switch any time from your editor.'],
      ['Can I change it later?', 'Press Change theme in your editor. Your words, offers and photos stay saved. Services is only the dress they wear.'],
      ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers.'],
      ['Who owns my contacts?', 'You do. Bookings, quotes and sign-ups build your list, and your list stays yours.'],
      ['What does it cost?', 'Free to start. Business when you charge.'],
    ],
  },
  cyberwitch: {
    id: 'cyberwitch',
    name: 'CyberWitch',
    accentVar: 'var(--fq-x-magenta-neon)',
    tagline: ['Concrete, chain-link and a spell book.', 'Spray one neon over all of it.'],
    lead:
      'Plain and polite gets scrolled past. CyberWitch is a dark, industrial look with a blackletter headline and one neon accent, for readers, ' +
      'makers, bands and anyone whose work has an edge. Your website, Spotlight, Space and emails wear it together, read from one profile.',
    signature: 'Dark only, with blackletter headlines, one lit marker phrase, riveted plates and one neon accent from five.',
    madeFor: 'readers, ritual workers, bands, labels, studios and anyone who wants a room with some edge',
    faq: [
      ['Is CyberWitch only for witches?', 'No. It has six starter kits, from practitioners and readers to bands, labels and studios. Pick the closest one and change the words.'],
      ['Does it have a light version?', 'No. CyberWitch is dark only, on purpose. If you want a bright room, pick another theme and keep your words, offers and photos.'],
      ['Can I change the neon?', 'Yes. Pick Hex, Absinthe, Ice, Blood or Venom, or set your own. The whole look follows it.'],
      ['Can I change it later?', 'Press Change theme in your editor. Your words, offers and photos stay saved. CyberWitch is only the dress they wear.'],
      ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, accent and offers.'],
      ['What does it cost?', 'Free to start. Business when you charge.'],
    ],
  },
}

export const isThemeFeatureId = (id: string | null | undefined): id is ThemeFeatureId => id === 'bold' || id === 'wildheart' || id === 'services' || id === 'cyberwitch'
