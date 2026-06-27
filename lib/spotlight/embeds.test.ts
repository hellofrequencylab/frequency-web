import { describe, it, expect } from 'vitest'
import { parseEmbedUrl, validateEmbedRef, buildEmbedSrc } from './embeds'

describe('parseEmbedUrl — host allowlist', () => {
  it('parses YouTube share forms to the 11-char id', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    ]) {
      expect(parseEmbedUrl(u)).toEqual({ provider: 'youtube', ref: 'dQw4w9WgXcQ' })
    }
  })

  it('parses Spotify URL + URI to type/id', () => {
    expect(parseEmbedUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'))
      .toEqual({ provider: 'spotify', ref: 'track/4cOdK2wGLETKBW3PvgPWqT' })
    expect(parseEmbedUrl('spotify:album:4cOdK2wGLETKBW3PvgPWqT'))
      .toEqual({ provider: 'spotify', ref: 'album/4cOdK2wGLETKBW3PvgPWqT' })
  })

  it('parses Vimeo + SoundCloud', () => {
    expect(parseEmbedUrl('https://vimeo.com/123456789')).toEqual({ provider: 'vimeo', ref: '123456789' })
    expect(parseEmbedUrl('https://soundcloud.com/artist/some-track'))
      .toEqual({ provider: 'soundcloud', ref: 'https://soundcloud.com/artist/some-track' })
  })

  it('rejects anything off the allowlist (no arbitrary iframe src)', () => {
    for (const bad of [
      'https://evil.com/embed',
      'javascript:alert(1)',
      'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://notsoundcloud.com/x/y',
      'data:text/html,<script>',
      'not a url',
      '',
      null,
    ]) {
      expect(parseEmbedUrl(bad)).toBeNull()
    }
  })
})

describe('validateEmbedRef — read-side authority', () => {
  it('rejects refs that do not match the provider pattern', () => {
    expect(validateEmbedRef('youtube', 'short')).toBeNull()
    expect(validateEmbedRef('youtube', '../../etc')).toBeNull()
    expect(validateEmbedRef('vimeo', 'abc')).toBeNull()
    expect(validateEmbedRef('spotify', 'track/short')).toBeNull()
    expect(validateEmbedRef('soundcloud', 'https://evil.com/x')).toBeNull()
    expect(validateEmbedRef('unknown', 'x')).toBeNull()
  })

  it('accepts valid refs', () => {
    expect(validateEmbedRef('youtube', 'dQw4w9WgXcQ')).toEqual({ provider: 'youtube', ref: 'dQw4w9WgXcQ' })
    expect(validateEmbedRef('soundcloud', 'https://soundcloud.com/a/b')?.provider).toBe('soundcloud')
  })
})

describe('buildEmbedSrc — reconstructed from validated parts', () => {
  it('builds known-safe embed URLs', () => {
    expect(buildEmbedSrc('youtube', 'dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(buildEmbedSrc('vimeo', '123456789')).toBe('https://player.vimeo.com/video/123456789')
    expect(buildEmbedSrc('spotify', 'track/abc')).toBe('https://open.spotify.com/embed/track/abc')
    expect(buildEmbedSrc('soundcloud', 'https://soundcloud.com/a/b')).toContain('w.soundcloud.com/player/?url=')
  })
})
