import { describe, it, expect } from 'vitest'
import { gatherImageNames } from './associate'
import type { WhatsAppMessage } from './types'

function msg(
  ref: number,
  author: string,
  opts: { text?: string; attachmentName?: string } = {},
): WhatsAppMessage {
  return {
    ref,
    timestamp: '',
    rawTimestamp: '',
    author,
    text: opts.text ?? '',
    system: false,
    attachmentOnly: !!opts.attachmentName && !opts.text,
    attachmentName: opts.attachmentName ?? null,
  }
}

// Sara posts a listing then two photos; Bob replies and posts his own photo.
const thread: WhatsAppMessage[] = [
  msg(1, 'Sara', { text: 'Sunny room in North Park, $1200' }),
  msg(2, 'Sara', { attachmentName: 'IMG-1.jpg' }),
  msg(3, 'Sara', { attachmentName: 'IMG-2.jpg' }),
  msg(4, 'Bob', { text: 'is it still available?' }),
  msg(5, 'Bob', { attachmentName: 'IMG-3.jpg' }),
]

describe('gatherImageNames', () => {
  it("gathers the poster's adjacent photos", () => {
    expect(gatherImageNames(thread, { refs: [1] })).toEqual(['IMG-1.jpg', 'IMG-2.jpg'])
  })

  it("excludes a different author's nearby photo", () => {
    const names = gatherImageNames(thread, { refs: [1] }, { window: 10 })
    expect(names).not.toContain('IMG-3.jpg')
  })

  it('returns [] when the item references no known message', () => {
    expect(gatherImageNames(thread, { refs: [999] })).toEqual([])
  })

  it('skips non-image attachments', () => {
    const msgs = [
      msg(1, 'Sara', { text: 'lease attached below' }),
      msg(2, 'Sara', { attachmentName: 'lease.pdf' }),
      msg(3, 'Sara', { attachmentName: 'room.png' }),
    ]
    expect(gatherImageNames(msgs, { refs: [1] })).toEqual(['room.png'])
  })

  it('dedupes and respects the cap', () => {
    const msgs = [
      msg(1, 'Sara', { text: 'photos' }),
      msg(2, 'Sara', { attachmentName: 'a.jpg' }),
      msg(3, 'Sara', { attachmentName: 'a.jpg' }),
      msg(4, 'Sara', { attachmentName: 'b.jpg' }),
    ]
    expect(gatherImageNames(msgs, { refs: [1] })).toEqual(['a.jpg', 'b.jpg'])
    expect(gatherImageNames(msgs, { refs: [1] }, { cap: 1 })).toEqual(['a.jpg'])
  })

  it('respects the window (a far-away photo is not pulled in)', () => {
    const msgs = [
      msg(1, 'Sara', { text: 'a room listing' }),
      ...Array.from({ length: 8 }, (_, i) => msg(i + 2, 'Sara', { text: `chatter ${i}` })),
      msg(10, 'Sara', { attachmentName: 'late.jpg' }),
    ]
    expect(gatherImageNames(msgs, { refs: [1] }, { window: 3 })).toEqual([])
  })
})
