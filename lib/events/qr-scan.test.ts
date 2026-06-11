import { describe, it, expect } from 'vitest'
import { qrPayloadToUrl, classifyLink } from './qr-scan'

describe('qrPayloadToUrl', () => {
  it('keeps a full https URL', () => {
    expect(qrPayloadToUrl('https://eventbrite.com/e/123')).toBe('https://eventbrite.com/e/123')
  })

  it('keeps a full http URL', () => {
    expect(qrPayloadToUrl('http://example.com/tickets')).toBe('http://example.com/tickets')
  })

  it('promotes a bare domain to https', () => {
    expect(qrPayloadToUrl('lu.ma/show')).toBe('https://lu.ma/show')
    expect(qrPayloadToUrl('www.partiful.com/e/abc')).toBe('https://www.partiful.com/e/abc')
  })

  it('trims surrounding whitespace', () => {
    expect(qrPayloadToUrl('  dice.fm/event  ')).toBe('https://dice.fm/event')
  })

  it('drops non-link schemes (mailto, tel, wifi, geo)', () => {
    expect(qrPayloadToUrl('mailto:hi@example.com')).toBeNull()
    expect(qrPayloadToUrl('tel:+15551234567')).toBeNull()
    expect(qrPayloadToUrl('WIFI:S:cafe;T:WPA;P:secret;;')).toBeNull()
    expect(qrPayloadToUrl('geo:40.7,-74.0')).toBeNull()
  })

  it('drops free text and non-domain payloads', () => {
    expect(qrPayloadToUrl('just some text')).toBeNull()
    expect(qrPayloadToUrl('hello')).toBeNull()
    expect(qrPayloadToUrl('')).toBeNull()
    expect(qrPayloadToUrl(null)).toBeNull()
    expect(qrPayloadToUrl(42)).toBeNull()
  })

  it('rejects a domain that contains whitespace', () => {
    expect(qrPayloadToUrl('example .com')).toBeNull()
  })
})

describe('classifyLink', () => {
  it('flags ticketing hosts as tickets', () => {
    expect(classifyLink('https://www.eventbrite.com/e/1').kind).toBe('tickets')
    expect(classifyLink('https://dice.fm/event/x').kind).toBe('tickets')
    expect(classifyLink('https://venue.com/tickets').kind).toBe('tickets')
  })

  it('flags rsvp hosts as rsvp', () => {
    expect(classifyLink('https://lu.ma/show').kind).toBe('rsvp')
    expect(classifyLink('https://www.meetup.com/group/events/123').kind).toBe('rsvp')
    expect(classifyLink('https://host.com/rsvp').kind).toBe('rsvp')
  })

  it('flags instagram', () => {
    expect(classifyLink('https://instagram.com/venue').kind).toBe('instagram')
  })

  it('falls back to website for anything else', () => {
    const c = classifyLink('https://somevenue.org/about')
    expect(c.kind).toBe('website')
    expect(c.label).toBe('More info')
  })
})
