import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WildheartMarkSplitBlock, WildheartMoonPathBlock, WildheartNowLineBlock, WildheartOrnamentBlock, WildheartPhotoBlock, WildheartRetreatBandBlock, WildheartSealCardsBlock, WildheartSeasonBandBlock, WildheartSkyMapBlock, WildheartYearJourneyBlock, stepPhase, wildheartComponents } from './wildheart'
import { utcDate } from '@/lib/theme/astrology-wheel'

const now = utcDate(2027, 3, 23)
// Rows as the landing hands them over: true instants beside the Space's zone (6 PM in Los Angeles).
const TZ = 'America/Los_Angeles'
const metadata = { space: { timeZone: TZ, events: [{ id: 'e1', slug: 'first', title: 'Spring gathering', startsAt: '2027-03-24T01:00:00Z', timeZone: TZ }, { id: 'e2', slug: 'second', title: 'A quiet evening', startsAt: '2027-04-07T01:00:00Z', timeZone: TZ }] } }
const anchor = { id: 'cn', slug: 'cn', title: 'Circle Night', startsAt: '2027-03-10T02:00:00Z', endsAt: '2027-03-10T03:30:00Z', timeZone: TZ, recurrenceType: 'weekly', recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU' }

describe('the astrology calendar block family', () => {
  it('registers three blocks whose defaults are generic and gender-neutral', () => {
    expect(Object.keys(wildheartComponents)).toEqual(['WildheartYearJourney', 'WildheartSkyMap', 'WildheartNowLine', 'WildheartOrnament', 'WildheartPhoto', 'WildheartMoonPath', 'WildheartSealCards', 'WildheartSeasonBand', 'WildheartRetreatBand', 'WildheartMarkSplit', 'WildheartMoonStrip', 'WildheartModules', 'WildheartFirstNight'])
    const copy = JSON.stringify(Object.values(wildheartComponents).map((c) => [c.label, c.defaultProps]))
    expect(copy).not.toMatch(/women|sister|\bher\b|circle night|samhain|retreat|—/i)
    for (const c of Object.values(wildheartComponents)) expect(c.fields).toHaveProperty('layout')
  })

  it('curates the year journey\'s stops from the sky and the Space events and hands the island its wheel', () => {
    const md = { space: { timeZone: TZ, events: [...metadata.space.events, { id: 'w1', slug: 'w1', title: 'Week 1 · Arriving', startsAt: '2027-01-06T02:00:00Z', timeZone: TZ }], series: [anchor] } }
    const html = renderToStaticMarkup(<WildheartYearJourneyBlock heading="Every season has a door." year={2027} now={now} metadata={md} programStops={[{ match: 'Week 1', title: 'Foundation begins', note: 'Tuesdays 6 PM', teach: 'Eight weeks.' }, { match: 'Circle Night', after: 'Week 1', title: 'Circle Nights begin', note: '', teach: 'Every other week.' }]} />)
    expect(html).toContain('Every season has a door.')
    expect(html).toContain('The year opens')
    expect(html).toContain('The sun enters Aquarius')
    expect(html).toContain('Ostara')
    expect(html).toContain('Wolf Moon')
    expect(html).toContain('Foundation begins')
    expect(html).toContain('Circle Nights begin')
    expect(html).toContain('Spring gathering')
    expect((html.match(/class="wh-yj-panel"/g) ?? []).length).toBeLessThanOrEqual(14)
    expect((html.match(/class="wh-yj-glyph"/g) ?? []).length).toBeGreaterThanOrEqual(11)
    expect((html.match(/class="wh-yj-season"/g) ?? []).length).toBe(4)
    expect(html).toContain('wh-yj-rail-stop')
    expect(html).not.toMatch(/️/)
    // LIVE-905: the anchor's rule puts every other Tuesday from Mar 9 on the wheel (22 dots through
    // December), each on its Los Angeles day, and the section opens in winter whatever the date now.
    expect((html.match(/data-kind="circle"/g) ?? []).length).toBe(22)
    expect(html).toContain('Circle Night · Mar 23')
    expect(html).toContain('Circle Night · Dec 28')
    expect(html).toContain('Week 1 · Arriving · Jan 5')
    expect(html).toMatch(/wh-block-journey[^"]*" data-season="winter"/)
  })

  it('draws the sky map as the zodiac wheel with twelve signs, the sign now, its module and the rows in its scope', () => {
    const md = { space: { ...metadata.space, series: [anchor] } }
    const html = renderToStaticMarkup(<WildheartSkyMapBlock now={now} metadata={md} modules={[{ sign: 'aries', title: 'Rage', theme: 'Anger as life force' }]} />)
    expect((html.match(/class="wh-zw-sign"/g) ?? []).length).toBe(12)
    expect(html).toContain('data-season="spring"')
    expect(html).toContain('Spring gathering')
    // LIVE-905: the whole year by default, in season sections headed by the season's theme and modules,
    // every Circle Night in its own zone ("Tue · 6:00 PM", never the UTC "Wed · 2:00 AM").
    expect(html).toContain('wh-sm-season-head')
    expect(html).toContain('Spring · Rise')
    expect(html).toContain('Rage · Values · Voice')
    expect(html).toContain('Fall · Wild')
    expect((html.match(/>Circle Night</g) ?? []).length).toBeGreaterThanOrEqual(21)
    expect(html).toContain('Tue · 6:00 PM')
    expect(html).not.toContain('2:00 AM')
    expect(html).toContain('Ostara')
    expect(html).toContain('Rage')
    expect(html).toContain('Anger as life force.')
    expect(html).toContain('In this sign')
    expect(html).toContain('Festivals')
    expect(html).toContain('class="wh-track-range"')
    const compact = renderToStaticMarkup(<WildheartSkyMapBlock now={now} layout="compact" metadata={metadata} />)
    expect(compact).toContain('wh-sm-compact')
    expect(compact).toContain('Coming up')
    expect(compact).toContain('Today')
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
    expect(html).toContain('Calling')
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
    expect([0, 1, 2, 3, 4, 5].map((i) => stepPhase(i, 6))).toEqual([0, 1, 2, 3, 4, 4])
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
    const md = { space: { timeZone: TZ, events: [{ id: 'c', slug: 'c', title: 'Circle Night', startsAt: '2027-03-31T01:00:00Z', endsAt: '2027-03-31T02:30:00Z', timeZone: TZ }, { id: 'f', slug: 'f', title: 'Full moon circle', startsAt: '2027-04-22T01:00:00Z', timeZone: TZ }, { id: 'old', slug: 'old', title: 'Long ago', startsAt: '2026-01-02T02:00:00Z', timeZone: TZ }] } }
    const html = renderToStaticMarkup(<WildheartSeasonBandBlock now={now} modules={[{ sign: 'aries', title: 'Rage', theme: 'Anger as life force' }]} beats={[{ letter: 'P', word: 'Presence' }]} gatheringLabel="Circle Night" metadata={md} />)
    expect(html).toContain('data-season="spring"')
    expect(html).toContain('Rage')
    expect(html).toContain('Next Circle Night')
    expect(html).toContain('Mar 30')
    expect(html).toContain('Tuesday · 6:00 – 7:30 PM')
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
    const split = renderToStaticMarkup(<WildheartMarkSplitBlock heading="About us" lead="A circle." note="Not therapy." metadata={{ space: { name: 'Wildheart', logoUrl: '/brand/wildheart/wildheart-logo.svg' } }} />)
    expect(split).toContain('wh-mark-logo')
    expect(split).toContain('role="separator"')
    // The mark is the figure plus the Space's own name as the wordmark: WILD over HEART.
    expect(split).toContain('>WILD</tspan>')
    expect(split).toContain('>HEART</tspan>')
    expect(split).toContain('href="#wh-logo-figure"')
    expect(renderToStaticMarkup(<WildheartMarkSplitBlock heading="About us" metadata={{ space: { name: 'Any Space' } }} />)).toContain('aria-label="Any Space"')
  })

  it('keeps a watermark glyph out of the flow on a surface without the skin', () => {
    const html = renderToStaticMarkup(<WildheartRetreatBandBlock heading="A weekend" days={[]} seal="scorpio" />)
    expect(html).toMatch(/class="wh-glyph wh-glyph-watermark" style="[^"]*position:absolute;opacity:0.07;pointer-events:none/)
    expect(html).toMatch(/class="wh-retreat" style="position:relative;overflow:hidden"/)
  })
})
