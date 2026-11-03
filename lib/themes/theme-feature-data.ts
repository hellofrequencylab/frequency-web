// Data for the Nocturne-layout theme pages of Default, Bold and Wildheart (/themes/frequency, /themes/bold, /themes/wildheart).
// The pictures are renders of each theme's own surfaces, stored under public/brand/theme-pages/<id>: the Website through the real
// site chrome and blocks, the Spotlight through the real shell on the theme's preset, the Space inside the real member shell and the
// Email through the real campaign mail (scripts/render/theme-pages-shots.render.tsx). Copy follows docs/marketing/voice-and-language-guide.md.

export type ThemeFeatureId = 'frequency' | 'bold' | 'wildheart'
export type ThemeFeatureSurface = 'site' | 'spotlight' | 'space' | 'email'

export const THEME_FEATURE_SURFACES: readonly { id: ThemeFeatureSurface; label: string; qual?: string; shot: 'site' | 'spot' | 'spacedesk' | 'email'; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 780, height: 1688 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'spacedesk', width: 1280, height: 770 },
  { id: 'email', label: 'Email template', shot: 'email', width: 900, height: 760 },
]

export const themeFeatureShot = (id: ThemeFeatureId, shot: string): string => `/brand/theme-pages/${id}/${shot}.jpg`

export interface ThemeFeatureCopy {
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
  frequency: {
    id: 'frequency',
    name: 'Default',
    accentVar: 'var(--fq-x-sun-neon)',
    tagline: ['Warm, bright and easy.', 'Nothing to fight.'],
    lead:
      'Your link in bio, your Space, your website and your emails each look a little different. Default is the house look: soft cards, a frosted menu bar and friendly headlines, ' +
      'read from one profile. It is the calm place to start, and a good one to stay.',
    signature: 'Soft cards, a frosted menu bar, Unbounded headlines and Instrument Serif italics.',
    madeFor: 'anyone who wants a friendly site with nothing to fight',
    faq: [
      ['Is Default the plain one?', 'It is the one with the fewest opinions. Warm grounds, soft corners and easy type, so your words and photos do the talking.'],
      ['Can I change it later?', 'Press Change theme in your editor. Your words, offers and photos stay saved. Default is only the dress they wear.'],
      ['Will my Space look exactly like my website?', 'Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and offers.'],
      ['Does it work for my kind of Space?', 'If people gather at your place, yes. The starter kits cover coaches, studios, hosts, venues, non-profits and networks.'],
      ['Who owns my contacts?', 'You do. Sign-ups, RSVPs and check-ins build your list, and your list stays yours.'],
      ['What does it cost?', 'Free to start. Business when you charge.'],
    ],
  },
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
}

export const isThemeFeatureId = (id: string | null | undefined): id is ThemeFeatureId => id === 'frequency' || id === 'bold' || id === 'wildheart'
