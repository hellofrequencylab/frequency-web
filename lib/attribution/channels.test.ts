import { describe, it, expect } from 'vitest'
import {
  ACQUISITION_CHANNELS,
  channelTag,
  deriveChannel,
  isChannel,
  referrerHost,
} from './channels'
import { TRAIT_REGISTRY } from '@/lib/traits/registry'

describe('acquisition channels', () => {
  it('every channel has a registered source_<channel> tag', () => {
    const keys = new Set(TRAIT_REGISTRY.map((t) => t.key))
    for (const c of ACQUISITION_CHANNELS) {
      expect(keys.has(channelTag(c)), `missing registry tag for ${c}`).toBe(true)
    }
  })

  it('isChannel guards the taxonomy', () => {
    expect(isChannel('qr_scan')).toBe(true)
    expect(isChannel('nope')).toBe(false)
  })

  describe('deriveChannel — entry route wins', () => {
    it('classifies the person/QR/event/donor routes by landing path', () => {
      expect(deriveChannel({ landing: '/q/abc123' })).toBe('qr_scan')
      expect(deriveChannel({ landing: '/join/tok' })).toBe('referral')
      expect(deriveChannel({ landing: '/events/summer-bbq' })).toBe('event_guest')
      expect(deriveChannel({ landing: '/give' })).toBe('donor')
    })

    it('entry route beats a utm param', () => {
      expect(deriveChannel({ landing: '/q/x', utm: { medium: 'email' } })).toBe('qr_scan')
    })
  })

  describe('deriveChannel — utm', () => {
    it('reads medium + source', () => {
      expect(deriveChannel({ landing: '/', utm: { medium: 'email' } })).toBe('email')
      expect(deriveChannel({ landing: '/', utm: { medium: 'video' } })).toBe('video')
      expect(deriveChannel({ landing: '/', utm: { source: 'youtube' } })).toBe('video')
      expect(deriveChannel({ landing: '/', utm: { medium: 'cpc', source: 'facebook' } })).toBe('social')
      expect(deriveChannel({ landing: '/', utm: { source: 'tiktok' } })).toBe('social')
      expect(deriveChannel({ landing: '/', utm: { source: 'google' } })).toBe('search')
      expect(deriveChannel({ landing: '/', utm: { medium: 'referral' } })).toBe('referral')
    })
  })

  describe('deriveChannel — referrer host', () => {
    it('classifies search / social / video / organic', () => {
      expect(deriveChannel({ landing: '/', ref: 'https://www.google.com/search?q=x' })).toBe('search')
      expect(deriveChannel({ landing: '/', ref: 'https://t.co/abc' })).toBe('social')
      expect(deriveChannel({ landing: '/', ref: 'https://youtu.be/abc' })).toBe('video')
      expect(deriveChannel({ landing: '/', ref: 'https://someblog.example/post' })).toBe('organic')
    })
  })

  describe('deriveChannel — direct', () => {
    it('no utm + no referrer → direct', () => {
      expect(deriveChannel({ landing: '/' })).toBe('direct')
      expect(deriveChannel({})).toBe('direct')
    })
  })

  it('referrerHost extracts hostname, null on garbage', () => {
    expect(referrerHost('https://Instagram.com/p/1')).toBe('instagram.com')
    expect(referrerHost('not a url')).toBe(null)
    expect(referrerHost(null)).toBe(null)
  })
})
