import { describe, expect, it } from 'vitest'
import { funnelLocalNote, funnelQuery, funnelRecord, hostFunnelCopy, parseFunnelContext } from './funnel-context'

// The exact link FlowWeb's funnelOf() builds for a host lead (hellofrequencylab/flowweb).
const FLOWWEB_LINK =
  'persona=practitioner&region=north-county-sd&area=oceanside&channel=movement&src=event_listings&utm_source=flowweb&utm_medium=founder_email&utm_campaign=north-county-sd&utm_content=d-7f3a9c'

describe('parseFunnelContext', () => {
  it('reads every param of a FlowWeb host link', () => {
    const ctx = parseFunnelContext(new URLSearchParams(FLOWWEB_LINK))
    expect(funnelRecord(ctx)).toEqual({
      persona: 'practitioner',
      region: 'north-county-sd',
      area: 'oceanside',
      channel: 'movement',
      src: 'event_listings',
      utm_source: 'flowweb',
      utm_medium: 'founder_email',
      utm_campaign: 'north-county-sd',
      utm_content: 'd-7f3a9c',
    })
    expect(ctx.channelSubject).toBe('movement')
    expect(ctx.founderInvite).toBe(true)
  })

  it('accepts a Next searchParams object, taking the first of repeated values', () => {
    const ctx = parseFunnelContext({ region: ['orange-county', 'san-diego'], area: 'irvine' })
    expect(ctx.region?.id).toBe('orange-county')
    expect(ctx.area?.name).toBe('Irvine')
  })

  it('drops an area that is not in the region, and an unknown region', () => {
    expect(parseFunnelContext({ region: 'orange-county', area: 'oceanside' }).area).toBeNull()
    expect(parseFunnelContext({ region: 'atlantis' }).region).toBeNull()
  })

  it('lets an area name its region when the link has none', () => {
    expect(parseFunnelContext({ area: 'temecula' }).region?.id).toBe('inland-north')
  })

  it('keeps an unknown but well-formed Channel slug without naming a subject, and drops junk', () => {
    const ctx = parseFunnelContext({ channel: 'sound-baths', src: 'cold_list', persona: 'admin' })
    expect(ctx.channel).toBe('sound-baths')
    expect(ctx.channelSubject).toBeNull()
    expect(ctx.src).toBeNull()
    expect(ctx.persona).toBeNull()
    expect(parseFunnelContext({ channel: '<script>' }).channel).toBeNull()
  })
})

describe('hostFunnelCopy', () => {
  it('speaks to the area and asks the seed region for first hosts', () => {
    const copy = hostFunnelCopy(parseFunnelContext(new URLSearchParams(FLOWWEB_LINK)))
    expect(copy.headline).toBe('Start a Circle in Oceanside.')
    expect(copy.regionLine).toContain('first hosts')
    expect(copy.founderLine).toContain('Daniel')
  })

  it('borrows proof from North County in a later region, and falls back to the region name', () => {
    const copy = hostFunnelCopy(parseFunnelContext({ region: 'inland-north', utm_medium: 'frequency' }))
    expect(copy.headline).toBe('Start a Circle in the Temecula Valley.')
    expect(copy.regionLine).toContain('Hosts in North County are already running Circles')
    expect(copy.founderLine).toBeNull()
  })

  it('reads as a plain host page with no link context, and never uses an em dash', () => {
    const copy = hostFunnelCopy(parseFunnelContext({}))
    expect(copy.headline).toBe('Start a Circle near you.')
    expect(copy.regionLine).toBeNull()
    for (const line of Object.values(copy)) expect(line ?? '').not.toContain('—')
  })
})

describe('funnelQuery', () => {
  it('carries ids only on to the next step', () => {
    const rec = funnelRecord(parseFunnelContext(new URLSearchParams(FLOWWEB_LINK)))
    expect(funnelQuery(rec)).toBe('region=north-county-sd&area=oceanside&channel=movement&src=event_listings')
  })
})

describe('funnelLocalNote', () => {
  it('names the place, sounds early in the seed region, and adds the founder line', () => {
    const note = funnelLocalNote(parseFunnelContext({ region: 'north-county-sd', area: 'vista', utm_medium: 'founder_email' }))
    expect(note).toBe('Frequency is just opening in Vista, so you are early. Daniel, who started Frequency, invited you personally.')
  })

  it('is plain in a later region and empty with no link', () => {
    expect(funnelLocalNote(parseFunnelContext({ region: 'orange-county' }))).toBe('Frequency is opening in Orange County.')
    expect(funnelLocalNote(parseFunnelContext({}))).toBeNull()
  })
})
