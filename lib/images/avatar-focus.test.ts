import { describe, expect, it } from 'vitest'
import {
  avatarFocusStyle,
  avatarSrc,
  readAvatarFocus,
  withAvatarFocusFragment,
} from './avatar-focus'

const URL = 'https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.jpg'

describe('withAvatarFocusFragment', () => {
  it('appends the focus as a #fp fragment', () => {
    expect(withAvatarFocusFragment(URL, '30% 68%')).toBe(`${URL}#fp=30,68`)
  })

  it('drops the fragment for the centered default (sparse URLs)', () => {
    expect(withAvatarFocusFragment(URL, '50% 50%')).toBe(URL)
    expect(withAvatarFocusFragment(URL, '')).toBe(URL)
    expect(withAvatarFocusFragment(URL, null)).toBe(URL)
  })

  it('replaces an existing fragment instead of stacking', () => {
    expect(withAvatarFocusFragment(`${URL}#fp=10,10`, '25% 75%')).toBe(`${URL}#fp=25,75`)
    expect(withAvatarFocusFragment(`${URL}#fp=10,10`, '50% 50%')).toBe(URL)
  })

  it('clamps and rounds out-of-range values', () => {
    expect(withAvatarFocusFragment(URL, '120% -5%')).toBe(`${URL}#fp=100,0`)
  })

  it('passes null URLs through', () => {
    expect(withAvatarFocusFragment(null, '30% 30%')).toBeNull()
    expect(withAvatarFocusFragment(undefined, '30% 30%')).toBeNull()
  })
})

describe('readAvatarFocus', () => {
  it('reads the fragment back as a CSS object-position', () => {
    expect(readAvatarFocus(`${URL}#fp=30,68`)).toBe('30% 68%')
  })

  it('returns null for plain URLs, empty input, and the centered default', () => {
    expect(readAvatarFocus(URL)).toBeNull()
    expect(readAvatarFocus(null)).toBeNull()
    expect(readAvatarFocus('')).toBeNull()
    expect(readAvatarFocus(`${URL}#fp=50,50`)).toBeNull()
  })

  it('ignores malformed fragments', () => {
    expect(readAvatarFocus(`${URL}#fp=abc,def`)).toBeNull()
    expect(readAvatarFocus(`${URL}#other`)).toBeNull()
  })
})

describe('avatarSrc + avatarFocusStyle', () => {
  it('strips the fragment for the rendered src', () => {
    expect(avatarSrc(`${URL}#fp=30,68`)).toBe(URL)
    expect(avatarSrc(URL)).toBe(URL)
  })

  it('pairs the src with an object-position style, or undefined when centered', () => {
    expect(avatarFocusStyle(`${URL}#fp=30,68`)).toEqual({ objectPosition: '30% 68%' })
    expect(avatarFocusStyle(URL)).toBeUndefined()
    expect(avatarFocusStyle(null)).toBeUndefined()
  })
})
