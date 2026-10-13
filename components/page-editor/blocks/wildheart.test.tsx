import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WildheartMarkSplitBlock, WildheartMoonPathBlock, WildheartNowLineBlock, WildheartOrnamentBlock, WildheartPhotoBlock, WildheartRetreatBandBlock, WildheartSealCardsBlock, WildheartSeasonBandBlock, WildheartSkyMapBlock, WildheartYearJourneyBlock, stepPhase, wildheartComponents } from './wildheart'
import { utcDate } from '@/lib/theme/astrology-wheel'

const now = utcDate(2027, 3, 23)
const metadata = { space: { events: [{ id: 'e1', slug: 'first', title: 'Spring gathering', startsAt: '2027-03-23T18:00' }, { id: 'e2', slug: 'second', title: 'A quiet evening', startsAt: '2027-04-06T18:00' }] } }

describe('the astrology calendar block family', () => {
  it('registers three blocks whose defaults are generic and gender-neutral', () => {
    expect(Object.keys(wildheartComponents)).toEqual(['WildheartYearJourney', 'WildheartSkyMap', 'WildheartNowLine', 'WildheartOrnament', 'WildheartPhoto', 'WildheartMoonPath', 'WildheartSealCards', 'WildheartSeasonBand', 'WildheartRetreatBand', 'WildheartMarkSplit', 'WildheartMoonStrip'])
    const copy = JSON.stringify(Object.values(wildheartComponents).map((c) => [c.label, c.defaultProps]))
    expect(copy).not.toMatch(/women|sister|\bher\b|circle night|samhain|retreat|—/i)
    for (const c of Object.values(wildheartComponents)) expect(c.fields).toHaveProperty('layout')
  })

  it('sorts the sky and the Space events into the strip, marking the sign now', () => {
    const html = renderToStaticMarkup(<WildheartYearJourneyBlock heading="Every season has a door." now={now} metadata={metadata} />)
    expect(html).toContain('Every season has a door.')
    expect(html).toContain('Spring gathering')
    expect(html).toContain('A quiet evening')
    expect(html).toContain('Ostara')
    expect(html).toContain('Worm Moon')
    expect(html).toContain('aria-current="date"')
    expect((html.match(/<li data-season="/g) ?? []).length).toBe(12)
    expect(html).not.toMatch(/️/)
  })

  it('draws the sky map as an SVG wheel with twelve glyphs, four season arcs and a dot per item', () => {
    const html = renderToStaticMarkup(<WildheartSkyMapBlock now={now} metadata={metadata} />)
    expect((html.match(/class="wh-wheel-glyph"/g) ?? []).length).toBe(12)
    expect((html.match(/class="wh-wheel-season"/g) ?? []).length).toBe(4)
    expect(html).toContain('data-now=""')
    expect((html.match(/class="wh-wheel-dot"/g) ?? []).length).toBeGreaterThanOrEqual(8 + 24 + 2)
    expect(html).toContain('Mar 23 · Spring gathering')
    expect(html).toContain('class="wh-wheel-needle"')
    expect(html).toContain('Aries')
  })

  it('reads the date line for a day', () => {
    const html = renderToStaticMarkup(<WildheartNowLineBlock now={utcDate(2026, 10, 12)} />)
    expect(html).toContain('Fall · Wild')
    expect(html).toContain('Libra')
    expect(html).toContain('VII · Partners')
    // Two days past the new moon of Oct 10, 2026.
    expect(html).toMatch(/New moon|Waxing crescent/)
  })

  it('renders a year with no Space events from the sky alone', () => {
    const html = renderToStaticMarkup(<WildheartSkyMapBlock year={2030} now={now} />)
    expect(html).toContain('2030')
    expect(html).toContain('Yule')
    expect(html).not.toContain('wh-wheel-needle"')
  })

  it('registers every composition block on the website palette with a layout field and generic defaults', () => {
    for (const c of Object.values(wildheartComponents)) {
      expect(c.fields).toHaveProperty('layout')
      expect(JSON.stringify(c.defaultProps)).not.toMatch(/women|sister|\bher\b|circle night|samhain|retreat|—/i)
    }
  })

  it('draws the ornament, the bridge, the photo frame and the moon strip through registered renders', () => {
    const render = (type: string, props: Record<string, unknown>) => renderToStaticMarkup(<>{wildheartComponents[type].render({ ...wildheartComponents[type].defaultProps, ...props, id: 'x' } as never)}</>)
    expect(render('WildheartOrnament', {})).toContain('role="separator"')
    expect(render('WildheartOrnament', { variant: 'bridge', label: 'Enter the year' })).toContain('Enter the year')
    expect(renderToStaticMarkup(<WildheartPhotoBlock image="/brand/wildheart/photos/hands-together.jpg" alt="Hands" shape="petal" grade="dusk" credit="A photographer" />)).toMatch(/data-shape="petal"[^>]*data-grade="dusk"/)
    expect(renderToStaticMarkup(<WildheartPhotoBlock image="javascript:alert(1)" />)).toBe('')
    expect(render('WildheartMoonStrip', { total: 8, done: 3 })).toContain('aria-label="3 of 8, Eight weeks"')
    expect(renderToStaticMarkup(<WildheartOrnamentBlock variant="star" />)).toContain('✶︎')
  })

  it('waxes the moon path from new to full across its steps', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => stepPhase(i, 6))).toEqual([0, 1, 2, 2, 3, 4])
    const html = renderToStaticMarkup(<WildheartMoonPathBlock heading="Wax at your own pace." steps={[{ title: 'Visit' }, { title: 'Join' }, { title: 'Host' }]} />)
    expect(html).toContain('aria-label="New moon"')
    expect(html).toContain('aria-label="Full moon"')
    expect(html).toContain('--wh-path-n:3')
  })

  it('opens each seal card with its glyph and keeps the columns within four', () => {
    const html = renderToStaticMarkup(<WildheartSealCardsBlock cards={[{ glyph: 'fire', title: 'Fire', body: 'Will' }, { glyph: 'scorpio', title: 'Depths' }]} columns={9} />)
    expect(html).toContain('data-cols="4"')
    expect((html.match(/class="wh-seal"/g) ?? []).length).toBe(2)
    expect(html).toContain('♏︎')
  })

  it('reads the module now, the featured gathering and the next days from the Space events', () => {
    const md = { space: { events: [{ id: 'c', slug: 'c', title: 'Circle Night', startsAt: '2027-03-30T18:00' }, { id: 'f', slug: 'f', title: 'Full moon circle', startsAt: '2027-04-21T18:00' }, { id: 'old', slug: 'old', title: 'Long ago', startsAt: '2026-01-01T18:00' }] } }
    const html = renderToStaticMarkup(<WildheartSeasonBandBlock now={now} modules={[{ sign: 'aries', title: 'Rage', theme: 'Anger as life force' }]} beats={[{ letter: 'P', word: 'Presence' }]} gatheringLabel="Circle Night" metadata={md} />)
    expect(html).toContain('data-season="spring"')
    expect(html).toContain('Rage')
    expect(html).toContain('Next · Circle Night')
    expect(html).toContain('Mar 30')
    expect(html).toContain('Full moon circle')
    expect(html).not.toContain('Long ago')
    expect(html).toContain('Presence')
    // No module named for the sign: the house stands in.
    expect(renderToStaticMarkup(<WildheartSeasonBandBlock now={now} modules={[]} beats={[]} />)).toContain('I · Self')
  })

  it('draws the retreat band with its day tiles, seal and note, and the mark split with the Space logo', () => {
    const html = renderToStaticMarkup(<WildheartRetreatBandBlock heading="Three nights in the *wild dark.*" days={[{ label: 'Fri', title: 'The threshold' }, { label: 'Sat', title: 'The ancestors', accent: true }]} seal="scorpio" image="/brand/wildheart/photos/forest-witch.jpg" ctaLabel="Hold my place" ctaHref="/retreat" note="Held separately" />)
    expect(html).toContain('class="mw-accent">wild dark.</span>')
    expect((html.match(/<li/g) ?? []).length).toBe(2)
    expect(html).toContain('data-accent=""')
    expect(html).toContain('wh-retreat-seal')
    expect(html).toContain('Held separately')
    const split = renderToStaticMarkup(<WildheartMarkSplitBlock heading="About us" lead="A circle." note="Not therapy." metadata={{ space: { name: 'Any Space', logoUrl: '/brand/wildheart/wildheart-logo.svg' } }} />)
    expect(split).toContain('wh-mark-logo')
    expect(split).toContain('role="separator"')
    expect(renderToStaticMarkup(<WildheartMarkSplitBlock heading="About us" metadata={{ space: { name: 'Any Space' } }} />)).toContain('Any Space')
  })

  it('keeps a watermark glyph out of the flow on a surface without the skin', () => {
    const html = renderToStaticMarkup(<WildheartRetreatBandBlock heading="A weekend" days={[]} seal="scorpio" />)
    expect(html).toMatch(/class="wh-glyph wh-glyph-watermark" style="[^"]*position:absolute;opacity:0.07;pointer-events:none/)
    expect(html).toMatch(/class="wh-retreat" style="position:relative;overflow:hidden"/)
  })
})
