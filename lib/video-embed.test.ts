import { describe, it, expect } from 'vitest'
import { parseVideoEmbed } from '@/lib/video-embed'

describe('parseVideoEmbed', () => {
  it('returns null for empty / linkless text', () => {
    expect(parseVideoEmbed(null)).toBeNull()
    expect(parseVideoEmbed('')).toBeNull()
    expect(parseVideoEmbed('Just read the chapter, no link here.')).toBeNull()
  })

  it('parses a youtube watch URL into an embed src', () => {
    const v = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(v).toEqual({
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses youtu.be, embed, and shorts forms', () => {
    expect(parseVideoEmbed('https://youtu.be/abc123')?.src).toBe('https://www.youtube.com/embed/abc123')
    expect(parseVideoEmbed('https://www.youtube.com/embed/abc123')?.src).toBe('https://www.youtube.com/embed/abc123')
    expect(parseVideoEmbed('https://youtube.com/shorts/abc123')?.src).toBe('https://www.youtube.com/embed/abc123')
  })

  it('keeps the v param even with extra query params', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=xyz789&t=42s&list=PL1')?.src).toBe(
      'https://www.youtube.com/embed/xyz789',
    )
  })

  it('parses vimeo (short + player) forms', () => {
    expect(parseVideoEmbed('https://vimeo.com/123456789')?.src).toBe('https://player.vimeo.com/video/123456789')
    expect(parseVideoEmbed('https://player.vimeo.com/video/123456789')?.src).toBe(
      'https://player.vimeo.com/video/123456789',
    )
  })

  it('parses a direct media file as a file embed', () => {
    const v = parseVideoEmbed('https://cdn.example.com/clips/intro.mp4')
    expect(v).toEqual({
      provider: 'file',
      url: 'https://cdn.example.com/clips/intro.mp4',
      src: 'https://cdn.example.com/clips/intro.mp4',
    })
    expect(parseVideoEmbed('https://cdn.example.com/a.webm')?.provider).toBe('file')
  })

  it('finds the link inside surrounding prose and trims trailing punctuation', () => {
    const v = parseVideoEmbed('Watch this first: https://youtu.be/abc123. Then journal.')
    expect(v?.src).toBe('https://www.youtube.com/embed/abc123')
    expect(v?.url).toBe('https://youtu.be/abc123')
  })

  it('ignores non-video links', () => {
    expect(parseVideoEmbed('https://example.com/article')).toBeNull()
    expect(parseVideoEmbed('https://vimeo.com/channels/staffpicks')).toBeNull()
  })
})
