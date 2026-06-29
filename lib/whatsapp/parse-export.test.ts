import { describe, it, expect } from 'vitest'
import { parseWhatsAppExport, classifiableMessages } from './parse-export'

describe('parseWhatsAppExport — iOS format', () => {
  const ios = [
    '[2024-01-15, 10:23:45 PM] Sara Lee: Looking for a room in North Park, $1200/mo',
    '[2024-01-15, 10:24:01 PM] Daniel: ‎image omitted',
    '[2024-01-15, 10:25:00 PM] Sara Lee: Available March 1.',
    'Message me if interested.',
  ].join('\n')

  it('detects the iOS format', () => {
    expect(parseWhatsAppExport(ios).format).toBe('ios')
  })

  it('splits author from body on the first colon-space', () => {
    const { messages } = parseWhatsAppExport(ios)
    expect(messages[0].author).toBe('Sara Lee')
    expect(messages[0].text).toBe('Looking for a room in North Park, $1200/mo')
    expect(messages[0].system).toBe(false)
  })

  it('flags an attachment-only body and keeps the row', () => {
    const { messages, stats } = parseWhatsAppExport(ios)
    expect(messages[1].attachmentOnly).toBe(true)
    expect(stats.attachmentOnly).toBe(1)
  })

  it('folds a continuation line into the message above it', () => {
    const { messages } = parseWhatsAppExport(ios)
    expect(messages[2].text).toBe('Available March 1.\nMessage me if interested.')
  })

  it('records a 1-based source ref for each message', () => {
    const { messages } = parseWhatsAppExport(ios)
    expect(messages[0].ref).toBe(1)
    expect(messages[2].ref).toBe(3)
  })
})

describe('parseWhatsAppExport — Android format', () => {
  const android = [
    '1/15/24, 10:23 PM - Sara Lee: Looking for a room',
    '15/01/2024, 22:23 - Daniel: <Media omitted>',
    '1/15/24, 10:25 PM - Sara Lee: Sunny, near the park',
  ].join('\n')

  it('detects the Android format and parses authors', () => {
    const { format, messages } = parseWhatsAppExport(android)
    expect(format).toBe('android')
    expect(messages[0].author).toBe('Sara Lee')
    expect(messages[0].text).toBe('Looking for a room')
  })

  it('recognizes <Media omitted> as attachment-only', () => {
    const { messages } = parseWhatsAppExport(android)
    expect(messages[1].attachmentOnly).toBe(true)
  })

  it('handles 24-hour times and D/M/Y dates without throwing', () => {
    const { messages } = parseWhatsAppExport(android)
    expect(messages[1].rawTimestamp).toContain('22:23')
  })
})

describe('parseWhatsAppExport — system lines', () => {
  it('marks a no-author notice as a system line', () => {
    const text = '[2024-01-15, 10:00:00 AM] Messages and calls are end-to-end encrypted.'
    const { messages, stats } = parseWhatsAppExport(text)
    expect(messages[0].system).toBe(true)
    expect(messages[0].author).toBe('')
    expect(stats.system).toBe(1)
  })

  it('marks "X added Y" as system (no colon)', () => {
    const text = '1/15/24, 10:00 - Daniel added Sara Lee'
    expect(parseWhatsAppExport(text).messages[0].system).toBe(true)
  })

  it('treats a "changed the subject to:" notice as system despite the colon', () => {
    const text = '1/15/24, 10:00 - Daniel changed the subject to: Housing 2.0'
    const { messages } = parseWhatsAppExport(text)
    expect(messages[0].system).toBe(true)
  })

  it('keeps a real message that merely contains a colon in its body', () => {
    const text = '1/15/24, 10:00 - Sara Lee: meet at 5: sharp, bring water'
    const { messages } = parseWhatsAppExport(text)
    expect(messages[0].system).toBe(false)
    expect(messages[0].author).toBe('Sara Lee')
    expect(messages[0].text).toBe('meet at 5: sharp, bring water')
  })
})

describe('parseWhatsAppExport — robustness', () => {
  it('returns an empty parse for empty input', () => {
    const { messages, format, stats } = parseWhatsAppExport('')
    expect(messages).toEqual([])
    expect(format).toBe('unknown')
    expect(stats.total).toBe(0)
  })

  it('does not throw on garbage and treats it as a leading continuation', () => {
    const { messages } = parseWhatsAppExport('just some text\nwith no timestamps')
    expect(messages).toEqual([])
  })

  it('strips the left-to-right mark from bodies', () => {
    const text = '[2024-01-15, 10:00:00 AM] Sara: ‎hello there'
    expect(parseWhatsAppExport(text).messages[0].text).toBe('hello there')
  })

  it('normalizes CRLF line endings', () => {
    const text = '1/15/24, 10:00 - Sara: line one\r\n1/15/24, 10:01 - Sara: line two'
    const { messages } = parseWhatsAppExport(text)
    expect(messages).toHaveLength(2)
    expect(messages[1].text).toBe('line two')
  })

  it('computes honest authored counts', () => {
    const text = [
      '[2024-01-15, 10:00:00 AM] Messages and calls are end-to-end encrypted.',
      '[2024-01-15, 10:01:00 AM] Sara: a real listing here',
      '[2024-01-15, 10:02:00 AM] Daniel: ‎video omitted',
    ].join('\n')
    const { stats } = parseWhatsAppExport(text)
    expect(stats).toMatchObject({ total: 3, system: 1, attachmentOnly: 1, authored: 1 })
  })
})

describe('parseWhatsAppExport — media attachments (filenames)', () => {
  it('captures an iOS <attached: NAME> filename and flags the bare photo', () => {
    const text = '[2024-01-15, 10:23:45 PM] Sara: ‎<attached: 00000045-PHOTO-2024-01-15-10-23-45.jpg>'
    const m = parseWhatsAppExport(text).messages[0]
    expect(m.attachmentName).toBe('00000045-PHOTO-2024-01-15-10-23-45.jpg')
    expect(m.attachmentOnly).toBe(true)
    expect(m.text).toBe('')
  })

  it('captures an Android NAME (file attached) filename', () => {
    const text = '1/15/24, 10:23 PM - Sara: IMG-20240115-WA0001.jpg (file attached)'
    const m = parseWhatsAppExport(text).messages[0]
    expect(m.attachmentName).toBe('IMG-20240115-WA0001.jpg')
    expect(m.attachmentOnly).toBe(true)
  })

  it('keeps the caption as the body when a photo is captioned', () => {
    const text = [
      '1/15/24, 10:23 PM - Sara: IMG-20240115-WA0001.jpg (file attached)',
      'Sunny room in North Park, available now',
    ].join('\n')
    const m = parseWhatsAppExport(text).messages[0]
    expect(m.attachmentName).toBe('IMG-20240115-WA0001.jpg')
    expect(m.attachmentOnly).toBe(false)
    expect(m.text).toBe('Sunny room in North Park, available now')
  })

  it('leaves attachmentName null for a text-only "image omitted" export', () => {
    const text = '[2024-01-15, 10:23:45 PM] Sara: ‎image omitted'
    const m = parseWhatsAppExport(text).messages[0]
    expect(m.attachmentName).toBeNull()
    expect(m.attachmentOnly).toBe(true)
  })
})

describe('classifiableMessages', () => {
  it('keeps authored substantive messages and drops noise', () => {
    const text = [
      '[2024-01-15, 10:00:00 AM] Messages and calls are end-to-end encrypted.', // system
      '[2024-01-15, 10:01:00 AM] Daniel: ‎image omitted', // attachment
      '[2024-01-15, 10:02:00 AM] Sara: ok', // too short
      '[2024-01-15, 10:03:00 AM] Sara: Sunny room in North Park, available now', // keep
    ].join('\n')
    const kept = classifiableMessages(parseWhatsAppExport(text))
    expect(kept).toHaveLength(1)
    expect(kept[0].author).toBe('Sara')
  })
})
