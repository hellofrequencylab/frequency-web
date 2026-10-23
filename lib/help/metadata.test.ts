import { expect, it } from 'vitest'
import type { Metadata, ResolvingMetadata } from 'next'
import { helpPageMetadata } from './metadata'
import { ROOT_OG_IMAGES } from '@/lib/site'

const resolveParent = (value: object) => Promise.resolve(value) as ResolvingMetadata
const input: Metadata = {
  title: 'Help Center',
  alternates: { canonical: '/help' },
  openGraph: { title: 'Help Center · Frequency', description: 'Answers for members and hosts.', url: '/help' },
}

it('keeps the real parent image descriptor and hash when page copy replaces openGraph', async () => {
  const images = [{ url: new URL('https://frequencylocal.com/opengraph-image-help?build=fixture'), width: 1200, height: 630 }]
  const result = await helpPageMetadata(input, resolveParent({ openGraph: { images } }))
  expect(result.openGraph?.images).toEqual(images)
  expect(result.openGraph?.title).toBe('Help Center · Frequency')
  expect(result.alternates).toEqual({ canonical: '/help' })
})

it('gives Twitter the page copy while retaining its own inherited file card', async () => {
  const images = [{ url: new URL('https://frequencylocal.com/twitter-image-help?build=fixture') }]
  const result = await helpPageMetadata(input, resolveParent({ twitter: { title: 'Generic home', images } }))
  expect(result.twitter?.title).toBe('Help Center · Frequency')
  expect(result.twitter?.description).toBe('Answers for members and hosts.')
  expect(result.twitter?.images).toEqual(images)
})

it('falls back to the real static brand image when the parent has no cards', async () => {
  const result = await helpPageMetadata(input, resolveParent({ openGraph: { images: [] } }))
  expect(result.openGraph?.images).toEqual(ROOT_OG_IMAGES)
  expect(result.twitter?.images).toEqual(ROOT_OG_IMAGES)
})

it('retains explicit page images and Twitter copy', async () => {
  const page = { ...input, openGraph: { ...input.openGraph, images: ['/explicit.jpg'] }, twitter: { title: 'Explicit title', images: ['/explicit-twitter.jpg'] } } as Metadata
  const result = await helpPageMetadata(page, resolveParent({}))
  expect(result.openGraph?.images).toEqual(['/explicit.jpg'])
  expect(result.twitter?.title).toBe('Explicit title')
  expect(result.twitter?.images).toEqual(['/explicit-twitter.jpg'])
})

it('preserves the caller’s robots and canonical declarations', async () => {
  const result = await helpPageMetadata({ ...input, robots: { index: false, follow: true } }, resolveParent({}))
  expect(result.robots).toEqual({ index: false, follow: true })
  expect(result.alternates).toEqual(input.alternates)
})
