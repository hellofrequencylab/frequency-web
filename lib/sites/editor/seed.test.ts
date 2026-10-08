import { describe, expect, it } from 'vitest'
import { entityWebsiteProps, initialWebsiteTheme, seedWebsiteHome, withWebsiteIds } from './seed'
import { validWebsiteSnapshot } from './state'
import type { Space } from '@/lib/spaces/types'
const original = 'https://original.example/photo.jpg'
describe('website initialization from original site content', () => {
  it('maps authored fields without dropping copy, photos or buttons', () => {
    expect(entityWebsiteProps('text', { text: 'Original paragraph' })).toMatchObject({ body: 'Original paragraph' })
    expect(entityWebsiteProps('image', { src: original })).toMatchObject({ image: original })
    const ref = { assetId: 'aaaaaaaa-0000-4000-a000-00000000000a', url: original }
    expect(entityWebsiteProps('gallery', { images: [original, ref] })).toMatchObject({ items: [{ image: original }, { image: ref }] })
    expect(entityWebsiteProps('editorial', { body: 'Original story' })).toMatchObject({ body: 'prose', lead: 'Original story' })
    expect(entityWebsiteProps('cardGrid', { cards: [{ title: 'Original', text: 'Original caption', image: original }] })).toMatchObject({ cards: [{ body: 'Original caption', image: original }] })
    expect(entityWebsiteProps('photoHero', { buttonLabel: 'Join', buttonUrl: '/book' })).toMatchObject({ actionPrimaryLabel: 'Join', actionPrimaryHref: '/book' })
    expect(entityWebsiteProps('memberships', { title: 'Our plans', body: 'Owner copy' })).toMatchObject({ heading: 'Our plans', body: 'Owner copy', ctaHref: '/book' })
  })
  it('keeps original legacy document copy and deduplicates nested IDs', () => {
    const doc = withWebsiteIds({ root: {}, content: [{ type: 'Text', props: { id: 'same', body: 'First', children: [{ type: 'Text', props: { id: 'same', body: 'Child' } }] } }, { type: 'Text', props: { id: 'same', body: 'Second' } }] })
    expect(doc.content.map((b) => b.props.body)).toEqual(['First', 'Second'])
    expect(validWebsiteSnapshot({ theme: 'DAWN', pages: [{ slug: 'home', label: 'Home', doc, seo: { title: '', description: '' }, comments: [] }] })).toBe(true)
  })
  it('seeds grid content in visible order using original URLs and no duplicate placements', () => {
    const space = { name: 'Original site', coverImageUrl: original, preferences: { profileLayout: { rows: [{ id: 'r0', columns: 1, cells: [['text', 'image', 'text']] }], content: { text: { text: 'Real copy' }, image: { src: original } } } } } as unknown as Space
    const doc = seedWebsiteHome(space, { root: {}, content: [] })
    expect(doc.content.map((b) => b.type)).toEqual(['PhotoHero', 'Text', 'Image'])
    expect(doc.content[1].props.body).toBe('Real copy')
    expect(doc.content[2].props.image).toBe(original)
  })
  it('reads website skin independently while supporting the existing Menswork site theme', () => {
    expect(initialWebsiteTheme({ websiteTheme: 'Midnight', theme: 'bold' })).toBe('Midnight')
    expect(initialWebsiteTheme({ theme: 'menswork' })).toBe('Menswork')
    expect(initialWebsiteTheme({ theme: 'classic' })).toBe('DAWN')
    expect(initialWebsiteTheme({ websiteTheme: 'DAWN', theme: 'menswork' })).toBe('DAWN')
  })
})
