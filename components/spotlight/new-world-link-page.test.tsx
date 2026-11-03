import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewWorldKitSpotlightLayout } from './new-world-kit-layouts'
import { newWorldLinkPageContent } from '@/lib/spotlight/new-world-kit-content'

describe('New World link page (Space Spotlight)', () => {
  const c = newWorldLinkPageContent({
    name: 'Daniel Tyack',
    tagline: 'Emotional Alchemy',
    messageHref: 'mailto:daniel@danieltyack.com',
    links: [
      { label: 'Frequency', url: 'https://frequencylocal.com' },
      { label: 'Instagram', url: 'https://instagram.com/danieltyack' },
    ],
    closing: { label: 'Get your free Spotlight on Frequency', href: 'https://frequencylocal.com/create-a-space' },
  })
  const html = renderToStaticMarkup(<NewWorldKitSpotlightLayout layout="new-world-kit:stack" content={c} />)

  it('shows each link as a door, the message button and the closing call, and no invented content', () => {
    expect(html).toContain('href="https://frequencylocal.com"')
    expect(html).toContain('href="https://instagram.com/danieltyack"')
    expect(html).toContain('href="mailto:daniel@danieltyack.com"')
    expect(html).toContain('Get your free Spotlight on Frequency')
    expect(html).not.toContain('Book your first visit')
    expect(html).not.toContain('Replace')
    expect(c.doors).toHaveLength(2)
  })
})
