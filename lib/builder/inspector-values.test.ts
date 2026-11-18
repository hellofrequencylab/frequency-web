import { describe, expect, it } from 'vitest'
import { sanitizeInlineHtml } from '@/lib/entity-blocks/block-content'
import { calloutBlock } from '@/lib/entity-blocks/contract/callout'
import { canvasInspectorFor } from './canvas-inspector'
import { inspectorFieldViews, withRichText } from './inspector-fields'
import { imageAddress, inspectorImage, plainToRich, richHasMarks, richRuns, richWords } from './inspector-values'

describe('rich text in the inspector (PROG-E5 item 4)', () => {
  it('reads stored markup as words and marks, never as tags or entities', () => {
    const stored = sanitizeInlineHtml('Tom & "Jerry"\n<b>bold</b> <a href="https://x.example">site</a>')
    expect(stored).toContain('&amp;')
    expect(richWords(stored)).toBe('Tom & "Jerry"\nbold site')
    expect(richRuns(stored)).toContainEqual({ text: 'bold', bold: true })
    expect(richRuns(stored)).toContainEqual({ text: 'site', link: true })
    expect(richHasMarks(stored)).toBe(true)
    expect(richHasMarks(sanitizeInlineHtml('Just words & more'))).toBe(false)
  })

  it('drops tags outside the allowlist and keeps their words as text', () => {
    expect(richWords('<script>alert(1)</script>hi')).toBe('alert(1)hi')
    expect(richRuns('<span>a</span>').every((run) => !run.bold && !run.italic && !run.link)).toBe(true)
  })

  it('sends a plain edit back in the stored form, so a save stores words and not markup', () => {
    const typed = 'Fish & chips\n<b>not bold</b>'
    const sent = plainToRich(typed)
    expect(sent).not.toContain('\n')
    expect(richWords(sent)).toBe(typed)
  })
})

describe('images in the inspector (PROG-E5 item 4)', () => {
  it('draws a picture held as a library asset, and a typed https address', () => {
    expect(inspectorImage({ assetId: 'a1', url: 'https://cdn.example/p.jpg', alt: 'Sunrise' })).toEqual({ src: 'https://cdn.example/p.jpg', library: true, alt: 'Sunrise' })
    expect(inspectorImage('https://cdn.example/q.jpg')).toEqual({ src: 'https://cdn.example/q.jpg', library: false, alt: '' })
    expect(inspectorImage('/media/r.jpg').src).toBe('/media/r.jpg')
    expect(imageAddress({ assetId: 'a1', url: 'https://cdn.example/p.jpg' })).toBe('https://cdn.example/p.jpg')
  })

  it('never loads an address that is not https or a path on this site', () => {
    for (const unsafe of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.example/x.jpg', 'http://plain.example/x.jpg']) {
      expect(inspectorImage(unsafe).src).toBeNull()
    }
    expect(inspectorImage(undefined)).toEqual({ src: null, library: false, alt: '' })
  })
})

describe('field views carry the image and rich flags', () => {
  it('marks the single image field and, for a block that stores markup, its long text', () => {
    const fields = withRichText(inspectorFieldViews(calloutBlock, 'space-profile').fields)
    expect(fields.find((f) => f.key === 'image')).toMatchObject({ kind: 'url', image: true })
    expect(fields.find((f) => f.key === 'buttonUrl')).not.toHaveProperty('image')
    expect(fields.find((f) => f.key === 'body')).toMatchObject({ kind: 'textarea', rich: true })
    expect(inspectorFieldViews(calloutBlock, 'space-profile').fields.find((f) => f.key === 'body')).not.toHaveProperty('rich')
    expect(fields.find((f) => f.key === 'title')).not.toHaveProperty('rich')
  })

  it('reads a content block as rich from the registry, on the server', () => {
    expect(canvasInspectorFor('callout').fields.find((f) => f.key === 'body')).toMatchObject({ rich: true })
  })
})
