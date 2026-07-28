import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHANNEL_CATEGORIES,
  CHANNEL_CATEGORY_ICON,
  FALLBACK_CHANNEL_CATEGORY_ICON,
  FALLBACK_CHANNEL_CATEGORY_ACCENT,
  isChannelCategory,
  channelCategoryIcon,
  channelCategoryAccent,
  channelCategoryLabel,
} from './categories'

// THE CHANNEL CATEGORY VOCABULARY (ADR-879). Before this file the vocabulary was implied by two
// hand-written icon maps while the operator typed the value as free text, so a typo silently broke the
// icon. Locked here:
//   1. The seven keys, exactly, in the order the settings select lists them, each with a label, an
//      Icon, and a token-only accent.
//   2. Every reader is TOTAL: an off-list legacy value (the old free-text default was 'general')
//      keeps its own text as the label and gets the generic icon. Nothing is renamed behind an
//      operator's back.
//   3. ONE SOURCE (source shape): the channel page, the channels directory card, and the staff
//      settings select all read THIS file, and none of them re-declares a category map of its own.

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

const CHANNEL_PAGE = ['app', '(main)', 'channels', '[id]', 'page.tsx']
const CHANNELS_LIST = ['components', 'widgets', 'channels', 'channels-list.tsx']
const SETTINGS_MODULE = ['components', 'admin', 'modules', 'channel-settings-module.tsx']

describe('CHANNEL_CATEGORIES', () => {
  it('is the seven-key closed set, in select order', () => {
    expect(CHANNEL_CATEGORIES.map((c) => c.key)).toEqual([
      'spirituality',
      'movement',
      'holistic-health',
      'human-relating',
      'activism',
      'creative',
      'business-support',
    ])
  })

  it('gives every category a label, an icon, and a token-only accent', () => {
    for (const c of CHANNEL_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(typeof c.Icon).not.toBe('undefined')
      expect(c.accent).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(c.accent).not.toMatch(/text-\[\d+px\]/)
    }
  })

  it('keeps the labels on-voice: no em dashes (CONTENT-VOICE §10)', () => {
    for (const c of CHANNEL_CATEGORIES) expect(c.label).not.toContain('—')
  })

  it('guards the closed set', () => {
    expect(isChannelCategory('creative')).toBe(true)
    expect(isChannelCategory('general')).toBe(false)
    expect(isChannelCategory('')).toBe(false)
    expect(isChannelCategory(null)).toBe(false)
    expect(isChannelCategory(42)).toBe(false)
  })
})

describe('the readers are total', () => {
  it('resolves a known category to its own icon, accent, and label', () => {
    expect(channelCategoryIcon('creative')).toBe(CHANNEL_CATEGORIES.find((c) => c.key === 'creative')!.Icon)
    expect(channelCategoryAccent('creative')).toBe(CHANNEL_CATEGORIES.find((c) => c.key === 'creative')!.accent)
    expect(channelCategoryLabel('holistic-health')).toBe('Holistic Health')
  })

  it('falls back for an off-list value without renaming it', () => {
    expect(channelCategoryIcon('general')).toBe(FALLBACK_CHANNEL_CATEGORY_ICON)
    expect(channelCategoryAccent('general')).toBe(FALLBACK_CHANNEL_CATEGORY_ACCENT)
    // The stored word is what the operator sees, so a legacy value is never silently relabelled.
    expect(channelCategoryLabel('general')).toBe('general')
  })

  it('handles empty and malformed values', () => {
    expect(channelCategoryLabel('')).toBe('Channel')
    expect(channelCategoryLabel(null)).toBe('Channel')
    expect(channelCategoryIcon(undefined)).toBe(FALLBACK_CHANNEL_CATEGORY_ICON)
    expect(channelCategoryAccent(7)).toBe(FALLBACK_CHANNEL_CATEGORY_ACCENT)
  })
})

describe('one source (source shape): nobody re-declares the vocabulary', () => {
  const readers: [string, string[]][] = [
    ['the channel page', CHANNEL_PAGE],
    ['the channels directory card', CHANNELS_LIST],
    ['the staff settings select', SETTINGS_MODULE],
  ]

  for (const [name, path] of readers) {
    it(`${name} imports from lib/channels/categories`, () => {
      expect(read(...path)).toContain("from '@/lib/channels/categories'")
    })

    it(`${name} declares no category map of its own`, () => {
      const src = read(...path)
      expect(src).not.toMatch(/const\s+CATEGORY_(ICON|ACCENT|LABEL)\b/)
    })

    it(`${name} hard-codes no category key`, () => {
      const src = read(...path)
      // A key spelled out in a reader is a second vocabulary waiting to drift. The settings select
      // renders the shared array; the page and the card call the shared readers.
      for (const c of CHANNEL_CATEGORIES) {
        expect(src, `${name} still mentions '${c.key}'`).not.toContain(`'${c.key}'`)
      }
    })
  }
})

// ── THE ICON MAP CANNOT BE POISONED BY ITS OWN PROTOTYPE ─────────────────────────────────────────
//
// CHANNEL_CATEGORY_ICON is indexed directly with a STORED category (page hero, directory card),
// guarded by `?? FALLBACK`. Built with plain Object.fromEntries it inherited Object.prototype, so a
// stored category of 'toString' returned a real truthy FUNCTION, the ?? never fired, and React
// threw rendering it - the Channel page and the whole /channels directory went down together. The
// column is free text at the DB and the create action is host-reachable, so the keys were
// reachable, not theoretical. The map now sits on a null prototype; these lock it there.
describe('CHANNEL_CATEGORY_ICON is safe to index with hostile keys', () => {
  it('returns undefined (so ?? falls back) for every Object.prototype name', () => {
    for (const k of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(CHANNEL_CATEGORY_ICON[k]).toBeUndefined()
    }
  })

  it('still resolves every registered key to its icon', () => {
    for (const c of CHANNEL_CATEGORIES) {
      expect(CHANNEL_CATEGORY_ICON[c.key]).toBe(c.Icon)
    }
  })
})
