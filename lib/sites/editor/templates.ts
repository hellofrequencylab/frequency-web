import type { WebsiteTheme } from './state'

export const WEBSITE_PAGE_TEMPLATES = [
  { name: 'Program', description: 'Hero, member path, offerings and FAQ' },
  { name: 'Season', description: 'Season introduction, practices and upcoming nights' },
  { name: 'Circle finder', description: 'Live circles and community details' },
  { name: 'Event', description: 'Gathering introduction, events and booking' },
  { name: 'About', description: 'Story, photo and contact details' },
  { name: 'Blank', description: 'Header, footer and an empty page' },
] as const

/** Each theme starts with its own section vocabulary; live sections read Space data. */
export function websiteTemplateSections(theme: WebsiteTheme, name: string): { type: string; props?: Record<string, unknown> }[] {
  // Bold and Wildheart share the site page sections' vocabulary (photo hero, editorial, card grid); Wildheart
  // opens its Season layout with the astrology strip and its Program layout with the date line.
  const sections = theme === 'Menswork' || theme === 'Wildheart'
  const hero = sections ? 'PhotoHero' : 'Hero'
  const story = sections ? 'EditorialSection' : 'MediaText'
  const cards = sections ? 'CardGrid' : 'FeatureGrid'
  const heroSection = { type: hero, props: sections ? { content: 'below' } : { variant: theme === 'DAWN' ? 'split' : 'image' } }
  const storySection = { type: story, props: sections ? { body: 'prose', media: 'right' } : { side: theme === 'DAWN' ? 'left' : 'right' } }
  const wild = (type: string) => (theme === 'Wildheart' ? [{ type }] : [])
  switch (name) {
    case 'Program': return [...wild('WildheartNowLine'), heroSection, { type: cards }, { type: 'FeatureGrid', props: { source: 'offerings', title: 'Offerings' } }, { type: 'SpaceFAQ' }]
    case 'Season': return [heroSection, ...wild('WildheartYearJourney'), { type: 'SpacePractices' }, { type: 'SpaceEvents' }, ...wild('WildheartSkyMap')]
    case 'Circle finder': return [{ type: 'Heading' }, { type: 'SpaceCommunity' }, { type: 'SpaceContact' }]
    case 'Event': return [heroSection, { type: 'SpaceEvents' }, { type: 'SpaceBooking' }]
    case 'About': return [storySection, { type: 'SpaceContact' }]
    default: return []
  }
}
