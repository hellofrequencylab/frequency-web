import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEmbedUrl, validateEmbedRef, buildEmbedSrc, embedHeight, parseLinkCard, type EmbedProvider } from './embeds'

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

// ── The three deferred providers (PROG-SPOT increment 3, ADR-1279) ─────────────────────────────
// Each block proves the same three things the first four providers prove: the share forms a
// member pastes, the hosts that must NOT parse (no arbitrary iframe src), and the exact src the
// renderer reconstructs, which is what next.config.ts `frame-src` must carry.

describe('Bandcamp — the player URL from Share / Embed', () => {
  it('parses the EmbeddedPlayer album and track forms to kind/id', () => {
    expect(parseEmbedUrl('https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=small/transparent=true/'))
      .toEqual({ provider: 'bandcamp', ref: 'album/1234567890' })
    expect(parseEmbedUrl('https://bandcamp.com/EmbeddedPlayer/track=987654321/size=small/'))
      .toEqual({ provider: 'bandcamp', ref: 'track/987654321' })
    expect(parseEmbedUrl('https://bandcamp.com/EmbeddedPlayer/size=large/album=42/'))
      .toEqual({ provider: 'bandcamp', ref: 'album/42' })
  })

  it('rejects the artist-page share link (no id to embed) and look-alike hosts', () => {
    expect(parseEmbedUrl('https://someband.bandcamp.com/album/some-record')).toBeNull()
    expect(parseEmbedUrl('https://bandcamp.com.evil.com/EmbeddedPlayer/album=1/')).toBeNull()
    expect(parseEmbedUrl('https://bandcamp.com/EmbeddedPlayer/album=abc/')).toBeNull()
    expect(validateEmbedRef('bandcamp', 'album/../x')).toBeNull()
    expect(validateEmbedRef('bandcamp', 'playlist/1')).toBeNull()
  })

  it('reconstructs the fixed player src', () => {
    expect(buildEmbedSrc('bandcamp', 'album/1234567890'))
      .toBe('https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/tracklist=false/artwork=small/transparent=true/')
    expect(buildEmbedSrc('bandcamp', 'track/1')).toMatch(/^https:\/\/bandcamp\.com\/EmbeddedPlayer\/track=1\//)
    expect(embedHeight('bandcamp', 'album/1')).toBe(220)
    expect(embedHeight('bandcamp', 'track/1')).toBe(152)
  })
})

describe('Apple Music — storefront/kind/id', () => {
  it('parses album, song, playlist and artist links, dropping the slug', () => {
    expect(parseEmbedUrl('https://music.apple.com/us/album/random-access-memories/617154241'))
      .toEqual({ provider: 'applemusic', ref: 'us/album/617154241' })
    expect(parseEmbedUrl('https://music.apple.com/gb/song/get-lucky/617154556'))
      .toEqual({ provider: 'applemusic', ref: 'gb/song/617154556' })
    expect(parseEmbedUrl('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'))
      .toEqual({ provider: 'applemusic', ref: 'us/playlist/pl.f4d106fed2bd41149aaacabb233eb5eb' })
    expect(parseEmbedUrl('https://music.apple.com/us/artist/daft-punk/5468295'))
      .toEqual({ provider: 'applemusic', ref: 'us/artist/5468295' })
  })

  it('keeps a single song inside an album (?i=) and drops a malformed one', () => {
    expect(parseEmbedUrl('https://music.apple.com/us/album/random-access-memories/617154241?i=617154556'))
      .toEqual({ provider: 'applemusic', ref: 'us/album/617154241?i=617154556' })
    expect(parseEmbedUrl('https://music.apple.com/us/album/random-access-memories/617154241?i=<script>'))
      .toEqual({ provider: 'applemusic', ref: 'us/album/617154241' })
  })

  it('rejects other Apple hosts, an unknown kind, and a ref that is not the strict shape', () => {
    expect(parseEmbedUrl('https://apple.com/us/album/x/617154241')).toBeNull()
    expect(parseEmbedUrl('https://music.apple.com.evil.com/us/album/x/617154241')).toBeNull()
    expect(parseEmbedUrl('https://music.apple.com/us/station/x/ra.1')).toBeNull()
    expect(validateEmbedRef('applemusic', 'us/album/617154241/../x')).toBeNull()
    expect(validateEmbedRef('applemusic', 'usa/album/617154241')).toBeNull()
    expect(validateEmbedRef('applemusic', 'us/album/617154241?i=evil')).toBeNull()
  })

  it('reconstructs the embed.music.apple.com src', () => {
    expect(buildEmbedSrc('applemusic', 'us/album/617154241')).toBe('https://embed.music.apple.com/us/album/617154241')
    expect(buildEmbedSrc('applemusic', 'us/album/617154241?i=617154556')).toBe('https://embed.music.apple.com/us/album/617154241?i=617154556')
    expect(embedHeight('applemusic', 'us/album/617154241')).toBe(450)
    expect(embedHeight('applemusic', 'us/album/617154241?i=617154556')).toBe(152)
    expect(embedHeight('applemusic', 'us/song/617154556')).toBe(152)
  })
})

describe('Twitch — channel, video, clip', () => {
  it('parses the three share forms to a kind/id ref', () => {
    expect(parseEmbedUrl('https://www.twitch.tv/monstercat')).toEqual({ provider: 'twitch', ref: 'channel/monstercat' })
    expect(parseEmbedUrl('https://m.twitch.tv/monstercat/')).toEqual({ provider: 'twitch', ref: 'channel/monstercat' })
    expect(parseEmbedUrl('https://www.twitch.tv/videos/1234567890')).toEqual({ provider: 'twitch', ref: 'video/1234567890' })
    expect(parseEmbedUrl('https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage'))
      .toEqual({ provider: 'twitch', ref: 'clip/AwkwardHelplessSalamanderSwiftRage' })
    expect(parseEmbedUrl('https://www.twitch.tv/monstercat/clip/AwkwardHelplessSalamanderSwiftRage'))
      .toEqual({ provider: 'twitch', ref: 'clip/AwkwardHelplessSalamanderSwiftRage' })
  })

  it('rejects directory pages, look-alike hosts, and refs outside the pattern', () => {
    expect(parseEmbedUrl('https://www.twitch.tv/directory/gaming')).toBeNull()
    expect(parseEmbedUrl('https://www.twitch.tv/videos')).toBeNull()
    expect(parseEmbedUrl('https://twitch.tv.evil.com/monstercat')).toBeNull()
    expect(parseEmbedUrl('https://player.twitch.tv/?channel=x&parent=evil.com')).toBeNull()
    expect(validateEmbedRef('twitch', 'channel/a b')).toBeNull()
    expect(validateEmbedRef('twitch', 'channel/x&parent=evil.com')).toBeNull()
    expect(validateEmbedRef('twitch', 'stream/monstercat')).toBeNull()
  })

  it('reconstructs the player src with our own parent hosts, never a member-supplied one', () => {
    const channel = buildEmbedSrc('twitch', 'channel/monstercat')
    expect(channel.startsWith('https://player.twitch.tv/?channel=monstercat&parent=frequencylocal.com&parent=www.frequencylocal.com')).toBe(true)
    expect(buildEmbedSrc('twitch', 'video/1234567890')).toMatch(/^https:\/\/player\.twitch\.tv\/\?video=1234567890&parent=frequencylocal\.com/)
    expect(buildEmbedSrc('twitch', 'clip/Slug_1')).toMatch(/^https:\/\/clips\.twitch\.tv\/embed\?clip=Slug_1&parent=frequencylocal\.com/)
    expect(embedHeight('twitch')).toBe(240)
  })
})

describe('frame-src stays in sync with the providers', () => {
  it('every reconstructed src host is allowlisted in next.config.ts', () => {
    const csp = readFileSync(path.join(__dirname, '..', '..', 'next.config.ts'), 'utf8')
    const frameSrc = csp.match(/"frame-src ([^"]+)"/)?.[1] ?? ''
    const samples: [EmbedProvider, string][] = [
      ['youtube', 'dQw4w9WgXcQ'],
      ['vimeo', '123456789'],
      ['spotify', 'track/4cOdK2wGLETKBW3PvgPWqT'],
      ['soundcloud', 'https://soundcloud.com/a/b'],
      ['bandcamp', 'album/1'],
      ['applemusic', 'us/album/617154241'],
      ['twitch', 'channel/monstercat'],
      ['twitch', 'clip/Slug_1'],
    ]
    for (const [provider, ref] of samples) {
      const origin = new URL(buildEmbedSrc(provider, ref)).origin
      expect(frameSrc.split(/\s+/), `${provider} origin ${origin}`).toContain(origin)
    }
  })
})
