import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeComponents, TEMPLE_CATEGORY_COMPONENTS } from './temple'
import { templeHomeBlocks } from '@/lib/sites/temple-home'
import { websiteTemplateSections } from '@/lib/sites/editor/templates'
import { planMensworkPage } from '@/lib/sites/menswork-page'

const links = { origin: 'https://frequency.example', slug: 'royaltemple', siteBase: '', pages: ['home'], contactHref: '/contact', bookHref: null, email: null }
const row = (id: string, title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, title, startsAt, endsAt: startsAt.replace(/T\d\d/, 'T20'), ...extra })

function draw(type: string, props: Record<string, unknown>, metadata: Record<string, unknown>) {
  const el = (templeComponents[type].render as (p: Record<string, unknown>) => React.ReactNode)({ ...templeComponents[type].defaultProps, ...props, puck: { metadata } })
  return renderToStaticMarkup(<>{el}</>)
}

describe('the Temple block family', () => {
  it('is one category of eight blocks, planned as own renders, the hero first', () => {
    expect(TEMPLE_CATEGORY_COMPONENTS).toHaveLength(8)
    const plan = planMensworkPage(templeHomeBlocks())
    expect(plan.every((p) => p.kind === 'own')).toBe(true)
    expect(plan.map((p) => ('hero' in p ? p.hero : false))).toEqual([true, false, false, false, false, false, false, false])
  })

  it('opens the Temple Program template on the design Home, in the design order', () => {
    expect(websiteTemplateSections('Temple', 'Program').map((b) => b.type)).toEqual(['TempleHero', 'TempleEvents', 'TempleWeek', 'TempleTiers', 'TempleSeasons', 'TempleRetreat', 'TempleFAQ', 'TempleFollow'])
    expect(websiteTemplateSections('Menswork', 'Program').map((b) => b.type)).not.toContain('TempleHero')
  })

  it('draws the ticket and cards from the Space events, and links through the site map', () => {
    const events = [row('dinner', 'Community Dinner', '2099-10-25T17:00:00.000Z', { priceLabel: '$22' })]
    const html = draw('TempleHero', {}, { space: { events, series: [] }, links })
    expect(html).toContain('Community Dinner')
    expect(html).toContain('href="https://frequency.example/events/dinner"')
    expect(html).toContain('href="https://frequency.example/spaces/royaltemple/calendar"')
    const cards = draw('TempleEvents', {}, { space: { events, series: [] }, links })
    expect(cards).toContain('tt-stamp')
    expect(cards).toContain('$22')
  })

  it('draws nothing for event cards when the Space has no events, and still draws the hero', () => {
    expect(draw('TempleEvents', {}, { space: { events: [], series: [] }, links })).toBe('')
    expect(draw('TempleHero', {}, { space: { events: [], series: [] }, links })).toContain('A house for')
    expect(draw('TempleHero', {}, { space: { events: [], series: [] }, links })).not.toContain('tt-ticket')
  })

  it('folds recurring series onto the week and keeps the authored words on empty days', () => {
    const series = [{ ...row('craft', 'Craft Night', '2026-10-27T18:00:00.000Z'), recurrenceType: 'weekly' }]
    const html = draw('TempleWeek', {}, { space: { events: [], series }, links })
    expect(html).toContain('Craft Night')
    expect(html).toContain('tt-day--hold')
    expect(html).toContain('Retreat &amp; rental')
  })

  it('uses the Space questions over its own list, and drops a cancelled event', () => {
    const live = draw('TempleFAQ', {}, { space: { faqs: [{ question: 'Is there parking?', answer: 'On the street.' }] }, links })
    expect(live).toContain('Is there parking?')
    expect(live).not.toContain('Is dinner potluck?')
    const events = [row('x', 'Cancelled Dinner', '2099-10-25T17:00:00.000Z', { isCancelled: true })]
    expect(draw('TempleEvents', {}, { space: { events, series: [] }, links })).toBe('')
  })

  it('never writes an em dash', () => {
    expect(JSON.stringify(templeHomeBlocks())).not.toMatch(/—/)
  })
})
