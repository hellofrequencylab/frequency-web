import { describe, it, expect } from 'vitest'
import { isSafeOgUrl, normalizeSeo } from './seo'

describe('page-settings SEO validation', () => {
  it('accepts an https URL, a root-relative path, or empty as a safe share image', () => {
    expect(isSafeOgUrl('https://cdn.example.com/og.png')).toBe(true)
    expect(isSafeOgUrl('/images/og.png')).toBe(true)
    expect(isSafeOgUrl('')).toBe(true)
    expect(isSafeOgUrl(null)).toBe(true)
  })

  it('rejects unsafe share-image URLs (http, javascript:, protocol-relative)', () => {
    expect(isSafeOgUrl('http://insecure.example.com/og.png')).toBe(false)
    expect(isSafeOgUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeOgUrl('//evil.example.com/og.png')).toBe(false)
    expect(isSafeOgUrl('not a url')).toBe(false)
  })

  it('normalizes + bounds the fields, trimming and emptying to null', () => {
    const f = normalizeSeo({ title: '  Hello  ', description: '  ', ogImage: ' /og.png ', headerImage: ' /header.png ' })
    expect(f).toEqual({ seo_title: 'Hello', seo_description: null, og_image_url: '/og.png', header_image_url: '/header.png', header_image_focal: null })
  })

  it('rejects the save when the header image URL is unsafe', () => {
    expect(normalizeSeo({ title: 'ok', headerImage: 'http://x' })).toBeNull()
  })

  it('stores a moved header focal point, drops the centered default, and never keeps a focal with no image', () => {
    expect(normalizeSeo({ headerImage: '/h.png', headerFocal: '50% 30%' })?.header_image_focal).toBe('50% 30%')
    expect(normalizeSeo({ headerImage: '/h.png', headerFocal: '50% 50%' })?.header_image_focal).toBeNull()
    expect(normalizeSeo({ headerFocal: '50% 30%' })?.header_image_focal).toBeNull()
  })

  it('clamps an over-long title + description', () => {
    const f = normalizeSeo({ title: 'a'.repeat(500), description: 'b'.repeat(500) })
    expect(f?.seo_title?.length).toBe(120)
    expect(f?.seo_description?.length).toBe(320)
  })

  it('returns null (rejects the whole save) when the og URL is unsafe', () => {
    expect(normalizeSeo({ title: 'ok', ogImage: 'http://x' })).toBeNull()
  })
})
