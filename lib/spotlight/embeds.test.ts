import { describe, it, expect } from 'vitest'
import { parseEmbedUrl, validateEmbedRef, buildEmbedSrc, embedHeight, parseLinkCard } from './embeds'

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

  it('parses Spotify URL + URI to type/id, incl. artist (whole account)', () => {
    expect(parseEmbedUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'))
      .toEqual({ provider: 'spotify', ref: 'track/4cOdK2wGLETKBW3PvgPWqT' })
    expect(parseEmbedUrl('spotify:album:4cOdK2wGLETKBW3PvgPWqT'))
      .toEqual({ provider: 'spotify', ref: 'album/4cOdK2wGLETKBW3PvgPWqT' })
    expect(parseEmbedUrl('https://open.spotify.com/artist/0TnOYISbd1XYRBk9myaseg'))
      .toEqual({ provider: 'spotify', ref: 'artist/0TnOYISbd1XYRBk9myaseg' })
  })

  it('parses a YouTube playlist and a channel (uploads) to a list/ ref', () => {
    // A bare playlist link.
    expect(parseEmbedUrl('https://www.youtube.com/playlist?list=PLabc123DEF456'))
      .toEqual({ provider: 'youtube', ref: 'list/PLabc123DEF456' })
    // A channel link → the channel's uploads playlist (UC… → UU…).
    expect(parseEmbedUrl('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'))
      .toEqual({ provider: 'youtube', ref: 'list/UUabcdefghijklmnopqrstuv' })
    // A watch link with a list still prefers the single video.
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123DEF456'))
      .toEqual({ provider: 'youtube', ref: 'dQw4w9WgXcQ' })
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

  it('builds a YouTube playlist via the videoseries player', () => {
    expect(buildEmbedSrc('youtube', 'list/PLabc123DEF456'))
      .toBe('https://www.youtube.com/embed/videoseries?list=PLabc123DEF456')
  })
})

describe('embedHeight — collections are taller than a single track', () => {
  it('gives Spotify collections more room', () => {
    expect(embedHeight('spotify', 'track/abc')).toBe(152)
    expect(embedHeight('spotify', 'playlist/abc')).toBe(352)
    expect(embedHeight('spotify', 'artist/abc')).toBe(352)
    expect(embedHeight('youtube')).toBe(240)
  })
})

describe('parseLinkCard — link-out hosts (no iframe)', () => {
  it('recognizes Insight Timer, rejects everything else', () => {
    expect(parseLinkCard('https://insighttimer.com/janedoe/guided-meditations/calm'))
      .toEqual({ provider: 'insighttimer', url: 'https://insighttimer.com/janedoe/guided-meditations/calm', label: 'Insight Timer' })
    expect(parseLinkCard('https://evil.com/x')).toBeNull()
    expect(parseLinkCard('http://insighttimer.com/x')).toBeNull() // https only
    expect(parseLinkCard('not a url')).toBeNull()
  })
})
