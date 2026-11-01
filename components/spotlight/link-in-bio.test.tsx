import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LinkInBioPage } from './link-in-bio'
import { validatePageSettings } from '@/lib/spotlight/link-in-bio'
import type { SpotlightRow } from '@/lib/spotlight/privacy'

const profile = { handle: 'maya', display_name: 'Maya Ortiz', bio: 'Breathwork guide.', avatar_url: null } as unknown as SpotlightRow
const page = validatePageSettings({
  frequencyFeatures: false,
  links: [
    { id: 'a', title: 'Book a session', url: 'https://maya.com/book', highlight: true },
    { id: 'b', title: 'Hidden one', url: 'https://maya.com/h', hidden: true },
  ],
  socials: [{ kind: 'instagram', url: 'https://instagram.com/maya' }],
})

describe('LinkInBioPage', () => {
  it('shows visible links, the social row and the Frequency link, never a hidden link', () => {
    const html = renderToStaticMarkup(<LinkInBioPage profile={profile} page={page} />)
    expect(html).toContain('Book a session')
    expect(html).not.toContain('Hidden one')
    expect(html).toContain('Instagram')
    expect(html).toContain('Get your spotlight on Frequency')
    expect(html).not.toContain('On Frequency"')
  })
  it('adds the On Frequency section only when given a body', () => {
    const html = renderToStaticMarkup(<LinkInBioPage profile={profile} page={page}><p>events</p></LinkInBioPage>)
    expect(html).toContain('On Frequency')
    expect(html).toContain('events')
  })
})
