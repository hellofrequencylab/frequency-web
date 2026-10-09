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
  const hero = theme === 'Menswork' ? 'PhotoHero' : 'Hero'
  const story = theme === 'Menswork' ? 'EditorialSection' : 'MediaText'
  const cards = theme === 'Menswork' ? 'CardGrid' : 'FeatureGrid'
  const heroSection = { type: hero, props: theme === 'Menswork' ? { content: 'below' } : { variant: theme === 'DAWN' ? 'split' : 'image' } }
  const storySection = { type: story, props: theme === 'Menswork' ? { body: 'prose', media: 'right' } : { side: theme === 'DAWN' ? 'left' : 'right' } }
  switch (name) {
    case 'Program': return [heroSection, { type: cards }, { type: 'FeatureGrid', props: { source: 'offerings', title: 'Offerings' } }, { type: 'SpaceFAQ' }]
    case 'Season': return [heroSection, { type: 'SpacePractices' }, { type: 'SpaceEvents' }]
    case 'Circle finder': return [{ type: 'Heading' }, { type: 'SpaceCommunity' }, { type: 'SpaceContact' }]
    case 'Event': return [heroSection, { type: 'SpaceEvents' }, { type: 'SpaceBooking' }]
    case 'About': return [storySection, { type: 'SpaceContact' }]
    default: return []
  }
}
