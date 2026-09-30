import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImageFocalPicker, markerOffset } from './image-focal-picker'

// LIVE-740: a focus saved at an edge hid the marker. The marker is drawn centred on the focal point
// inside an overflow-hidden, rounded frame, so "0% 0%" put its centre on the corner and the frame
// clipped all of it: the Space header control read as missing. The marker's centre is now clamped a
// marker's half-width inside the frame; the stored value and the crop (object-position) are untouched.

function markerStyle(value: string): string {
  const html = renderToStaticMarkup(
    <ImageFocalPicker imageUrl="https://example.com/header.jpg" value={value} onChange={() => {}} />,
  )
  const tag = html.match(/<div[^>]*data-focal-marker[^>]*>/)
  expect(tag, 'the marker is rendered').not.toBeNull()
  return tag![0]
}

describe('ImageFocalPicker marker (LIVE-740)', () => {
  it('keeps the marker inside the frame for a focus in the corner', () => {
    const tag = markerStyle('0% 0%')
    expect(tag).toContain('left:clamp(14px, 0%, calc(100% - 14px))')
    expect(tag).toContain('top:clamp(14px, 0%, calc(100% - 14px))')
  })

  it('keeps the marker inside the frame for a focus on the far edges', () => {
    const tag = markerStyle('100% 100%')
    expect(tag).toContain('left:clamp(14px, 100%, calc(100% - 14px))')
    expect(tag).toContain('top:clamp(14px, 100%, calc(100% - 14px))')
  })

  it('draws the marker at the focus itself away from the edges', () => {
    expect(markerStyle('30% 70%')).toContain('left:clamp(14px, 30%, calc(100% - 14px))')
    expect(markerOffset(50)).toBe('clamp(14px, 50%, calc(100% - 14px))')
  })

  it('leaves the crop at the stored focus, edge values included', () => {
    const html = renderToStaticMarkup(
      <ImageFocalPicker imageUrl="https://example.com/header.jpg" value="0% 0%" onChange={() => {}} />,
    )
    expect(html).toMatch(/<img[^>]*object-position:0% 0%/)
  })
})
