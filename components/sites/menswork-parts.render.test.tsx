import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MensworkPage } from './menswork-page'
import { planMensworkPage } from '@/lib/sites/menswork-page'

// The Card grid's editable extras (a card's link, stat box and button) draw on the published website, not
// only in the editor's preview (The Group website audit, 2026-10-19).

const links = { origin: 'https://frequency.example', slug: 'the-group', siteBase: '', pages: ['home', 'chapters'], contactHref: null, bookHref: null, email: null }
const live = { events: [], circles: [], journeys: [] }

describe('website card grid extras', () => {
  it('links the title, shows the stat and draws the button', () => {
    const blocks = [{ type: 'CardGrid', props: { id: 'cg', title: 'Chapters', role: 'feature', cards: [
      { icon: 'pin', title: 'La Jolla', body: 'Mondays', href: '/spaces/the-group-la-jolla', stat: { value: '300+', label: 'every week' }, button: { label: 'Visit La Jolla', href: '/spaces/the-group-la-jolla' } },
      { icon: 'sun', title: 'Encinitas', body: 'Fridays' },
    ] } }]
    const html = renderToStaticMarkup(<MensworkPage blocks={blocks} plan={planMensworkPage(blocks)} live={live} links={links} origin={links.origin} pageTitle="Chapters" renderOther={() => null} />)
    expect(html).toContain('class="mw-parts-link"')
    expect(html.match(/href="https:\/\/frequency.example\/spaces\/the-group-la-jolla"/g)).toHaveLength(2)
    expect(html).toContain('300+')
    expect(html).toContain('every week')
    expect(html).toContain('Visit La Jolla')
    expect(html).toContain('>Encinitas</h3>')
  })
})
