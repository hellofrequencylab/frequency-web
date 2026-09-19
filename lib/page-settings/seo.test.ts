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
    expect(f).toEqual({
      seo_title: 'Hello',
      seo_description: null,
      og_image_url: '/og.png',
      og_image_asset_id: null,
      header_image_url: '/header.png',
      header_image_asset_id: null,
      header_image_focal: null,
    })
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

  it('keeps a companion asset id when the url is set, and drops it when the url is cleared', () => {
    const id = 'a1b2c3d4-1111-4222-8333-444455556666'
    expect(normalizeSeo({ ogImage: '/og.png', ogImageAssetId: id })?.og_image_asset_id).toBe(id)
    expect(normalizeSeo({ headerImage: '/h.png', headerImageAssetId: id })?.header_image_asset_id).toBe(id)
    expect(normalizeSeo({ ogImage: '', ogImageAssetId: id })?.og_image_asset_id).toBeNull()
    expect(normalizeSeo({ headerImage: '', headerImageAssetId: id })?.header_image_asset_id).toBeNull()
  })

  it('returns null (rejects the whole save) when the og URL is unsafe', () => {
    expect(normalizeSeo({ title: 'ok', ogImage: 'http://x' })).toBeNull()
  })
})
