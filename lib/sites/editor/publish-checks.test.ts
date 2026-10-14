import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { missingAltText, publishChecks } from './publish-checks'

const config = {
  components: {
    Hero: { fields: { image: { type: 'text' }, alt: { type: 'text' }, title: { type: 'text' } } },
    Gallery: { fields: { items: { type: 'array', arrayFields: { src: { type: 'text' }, alt: { type: 'text' } } } } },
    Text: { fields: { body: { type: 'textarea' } } },
    Columns: { fields: { left: { type: 'slot' } } },
  },
} as unknown as Config

const doc = (content: unknown[]): Data => ({ root: {}, content }) as unknown as Data

describe('publish checks', () => {
  it('counts an image with an address and no alt text, in blocks, arrays and slots', () => {
    const d = doc([
      { type: 'Hero', props: { id: 'a', image: 'https://x/y.jpg', alt: '' } },
      { type: 'Hero', props: { id: 'b', image: '', alt: '' } },
      { type: 'Gallery', props: { id: 'c', items: [{ src: '/p.png', alt: 'A room' }, { src: '/q.png' }] } },
      { type: 'Columns', props: { id: 'd', left: [{ type: 'Hero', props: { id: 'e', image: '/z.jpg' } }] } },
      { type: 'Text', props: { id: 'f', body: 'hi' } },
    ])
    expect(missingAltText(d, config)).toBe(3)
  })

  it('reads the design words when every check passes, and names what is missing', () => {
    const ok = publishChecks([{ label: 'Home', doc: doc([]), seo: { title: 'Home', description: 'Welcome' } }], config)
    expect(ok).toEqual([
      { ok: true, text: 'Every image has alt text' },
      { ok: true, text: 'Page title and description set' },
    ])
    const bad = publishChecks([{ label: 'Visit', doc: doc([{ type: 'Hero', props: { image: '/a.jpg' } }]), seo: { title: '', description: '' } }], config)
    expect(bad.map((c) => c.ok)).toEqual([false, false])
    expect(bad[1].text).toContain('Visit')
  })
})
