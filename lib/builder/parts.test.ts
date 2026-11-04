import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { tuneProjection } from './tune'
import { focalFieldFor, pictureFieldFor } from './parts'

describe('canvas parts (BLD-104)', () => {
  const hero = tuneProjection('Hero', config)
  const fields = [...hero.layer1, ...hero.layer2]
  const props = { image: 'https://cdn.example.com/a b.jpg', title: 'Hi' }

  it('a click on the picture finds the field that stores it, however the page wrote its address', () => {
    expect(pictureFieldFor(fields, props, 'https://cdn.example.com/a b.jpg')?.key).toBe('image')
    expect(pictureFieldFor(fields, props, 'https://cdn.example.com/a%20b.jpg')?.key).toBe('image')
    expect(pictureFieldFor(fields, props, `/_next/image?url=${encodeURIComponent(props.image)}&w=1080&q=75`)?.key).toBe('image')
  })

  it('a picture the props do not name still opens the block\'s picture field', () => {
    expect(pictureFieldFor(fields, {}, 'https://elsewhere.example.com/x.jpg')?.key).toBe('image')
  })

  it('the focal point that crops the picture sits beside it', () => {
    expect(focalFieldFor(fields, 'image')?.key).toBe('focal')
  })
})
