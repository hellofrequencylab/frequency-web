import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// THE EVENTS LISTING HORIZON (owner ruling 2026-08-20). Two jobs here, because this knob has two
// ways to be useless, and the bug it fixes was invisibility:
//
//   1. THE COERCION. Zero configuration must mean NO CAP, and every degenerate stored value —
//      absent row, text, negative, fraction, NaN, a read that throws — must ALSO mean no cap.
//      Showing more is the safe direction; a settings hiccup must never re-hide a host's event.
//   2. THE CONSUMER WIRING. A setting nobody reads is the failure mode this repo has shipped
//      before, so the source-level assertions below pin that /events actually asks for the value,
//      no longer hardcodes 60 days, and OMITS its upper bound when uncapped.

// The settings read is mocked at the admin-client boundary, so the real getPlatformSetting ->
// coercion -> accessor path runs without a database. `store.throws` simulates it being unreachable.
const store: { value: string | null; throws: boolean; written: Record<string, unknown>[] } = {
  value: null,
  throws: false,
  written: [],
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (store.throws) throw new Error('platform_settings unreachable')
            return { data: store.value === null ? null : { value: store.value } }
          },
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        store.written.push(row)
        store.value = String(row.value)
        return { error: null }
      },
    }),
  }),
}))

const {
  coerceListingHorizonDays,
  eventsListingHorizonDays,
  setEventsListingHorizonDays,
  EVENTS_LISTING_HORIZON_KEY,
  NO_LISTING_HORIZON,
} = await import('./platform-flags')

beforeEach(() => {
  store.value = null
  store.throws = false
  store.written = []
})

describe('coerceListingHorizonDays — every degenerate value means NO CAP', () => {
  it('reads an absent or empty row as no cap', () => {
    for (const raw of ['', '   ', null, undefined]) {
      expect(coerceListingHorizonDays(raw)).toBe(NO_LISTING_HORIZON)
    }
  })

  it('reads garbage as no cap rather than as some accidental number', () => {
    for (const raw of ['sixty', 'NaN', '{}', [], {}, true, false, Number.NaN, Infinity, -Infinity]) {
      expect(coerceListingHorizonDays(raw)).toBe(0)
    }
  })

  it('reads a negative as no cap (never as a ceiling in the past, which would empty the listing)', () => {
    expect(coerceListingHorizonDays(-1)).toBe(0)
    expect(coerceListingHorizonDays('-90')).toBe(0)
  })

  it('respects a valid positive number, from a string or a number', () => {
    expect(coerceListingHorizonDays(90)).toBe(90)
    expect(coerceListingHorizonDays('90')).toBe(90)
    expect(coerceListingHorizonDays('60')).toBe(60)
    expect(coerceListingHorizonDays(1)).toBe(1)
  })

  it('floors a fraction to whole days, and a fraction under a day is no cap', () => {
    expect(coerceListingHorizonDays(3.7)).toBe(3)
    expect(coerceListingHorizonDays('0.5')).toBe(0)
  })

  it('explicitly: 0 is no cap, and 0 is the shipped default', () => {
    expect(NO_LISTING_HORIZON).toBe(0)
    expect(coerceListingHorizonDays(0)).toBe(0)
    expect(coerceListingHorizonDays('0')).toBe(0)
  })

  it('never throws, whatever it is handed', () => {
    for (const raw of [Symbol('x'), () => 1, new Date(), BigInt(10)]) {
      expect(() => coerceListingHorizonDays(raw)).not.toThrow()
    }
  })

  it('is stored under the one key', () => {
    expect(EVENTS_LISTING_HORIZON_KEY).toBe('events_listing_horizon_days')
  })
})

describe('eventsListingHorizonDays — zero configuration, and the fail-safe direction', () => {
  it('is NO CAP with no settings row written anywhere', async () => {
    store.value = null
    expect(await eventsListingHorizonDays()).toBe(0)
    expect(store.written).toHaveLength(0)
  })

  it('reads a stored positive number', async () => {
    store.value = '90'
    expect(await eventsListingHorizonDays()).toBe(90)
  })

  it('degrades to NO CAP when the settings read THROWS', async () => {
    // The deliberate direction, and the opposite of most flags in this file. The bug this setting
    // fixes was invisibility, so a transient hiccup must show more, never less.
    store.throws = true
    expect(await eventsListingHorizonDays()).toBe(0)
  })

  it('degrades to NO CAP on a garbage stored value', async () => {
    store.value = 'sixty-ish'
    expect(await eventsListingHorizonDays()).toBe(0)
  })
})

describe('setEventsListingHorizonDays', () => {
  it('writes the ONE key and returns the STORED value, so a typed -5 visibly becomes 0', async () => {
    const stored = await setEventsListingHorizonDays(-5, 'profile-1')
    expect(stored).toBe(0)
    expect(store.written).toHaveLength(1)
    expect(store.written[0].key).toBe(EVENTS_LISTING_HORIZON_KEY)
    expect(store.written[0].value).toBe('0')
    expect(store.written[0].updated_by).toBe('profile-1')
  })

  it('stores a valid number as text', async () => {
    expect(await setEventsListingHorizonDays(120, null)).toBe(120)
    expect(store.written[0].value).toBe('120')
  })
})

// ── The wiring guard: the setting must actually reach the listing ────────────────────────────────
// (source-level, house archetype — lib/events/series-config.test.ts. A knob nothing reads, and a
// hardcoded number left behind beside it, are both invisible failures.)

const indexData = readFileSync('app/(main)/events/index-data.ts', 'utf8')
const flagsSrc = readFileSync('lib/platform-flags.ts', 'utf8')
const adminPage = readFileSync('app/(main)/admin/events/page.tsx', 'utf8')
const adminAction = readFileSync('app/(main)/admin/events/series-actions.ts', 'utf8')
const adminSection = readFileSync('app/(main)/admin/events/listing-horizon-section.tsx', 'utf8')

describe('the horizon setting reaches the listing it claims to tune', () => {
  it('guards non-trivially (an empty read passes every assertion below)', () => {
    for (const src of [indexData, flagsSrc, adminPage, adminAction, adminSection]) {
      expect(src.length).toBeGreaterThan(400)
    }
  })

  it('the /events loader reads the setting', () => {
    // The CALL, on comment- and import-free source (scan2 L8-04, proven by mutation): the setting is
    // also named in a comment of index-data.ts, so a bare toContain stayed green with the call gone.
    expect(sourceWithoutComments('app/(main)/events/index-data.ts', { imports: true })).toContain(
      'eventsListingHorizonDays()',
    )
  })

  it('no longer hardcodes a 60-day horizon', () => {
    // The exact expression that hid a gathering published 64 days out.
    expect(indexData).not.toContain('60 * 24 * 60 * 60 * 1000')
    expect(indexData).not.toMatch(/const future\s*=/)
  })

  it('OMITS the upper bound when uncapped, on all three reads, with no sentinel date', () => {
    // Each of the circle / public / hosted queries applies .lte only behind the null check. A
    // far-future sentinel would be a hardcoded 60 wearing a bigger number, so there must be none.
    const guarded = indexData.match(/if \(listUntil\) \w+ = \w+\.lte\('starts_at', listUntil\)/g) ?? []
    expect(guarded).toHaveLength(3)
    // ...and no unguarded .lte on starts_at survives anywhere in the loader.
    const allLte = indexData.match(/\.lte\('starts_at'/g) ?? []
    expect(allLte).toHaveLength(3)
    expect(indexData).not.toMatch(/lte\('starts_at', '2\d{3}-/)
  })

  it('keeps the ADR-897 row budget and series fold on all three reads', () => {
    // Removing the date ceiling must not remove the row budget.
    expect((indexData.match(/\.limit\(SERIES_WIDE_READ\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(indexData).toContain('getSeriesDisplayConfig(')
    expect(indexData).toContain('collapseSeriesRows')
  })

  it('the console renders the control and its action re-gates on janitor', () => {
    expect(adminPage).toContain('eventsListingHorizonDays()')
    expect(adminPage).toContain('<ListingHorizonSection')
    // The chrome decides what renders; the action is the law. /admin/events admits community host
    // and community staff, but this number is platform-wide.
    expect(adminAction).toContain("requireAdmin('janitor')")
    expect(adminAction).toContain('setEventsListingHorizonDays(')
    // The change must take effect on the listing immediately.
    expect(adminAction).toContain("revalidatePath('/events')")
  })

  it('the control tells the operator what 0 means', () => {
    expect(adminSection).toContain('0 shows every upcoming event')
  })

  it('the control never imports the service-role settings module', () => {
    expect(adminSection).toContain("'use client'")
    expect(adminSection).not.toContain("from '@/lib/platform-flags'")
  })

  it('adds NO parallel admin-menu catalog (MENU-CONTRACT: /admin/events is already registered)', () => {
    const catalog = /\bconst\s+[A-Z][A-Z0-9_]*_MODULES\b\s*[:=]/
    for (const src of [adminPage, adminSection, adminAction]) expect(src).not.toMatch(catalog)
  })
})

// ── Every boolean flag the code READS has a seed row in a migration ──────────────────────────────
// (2026-09-05, scan2 L3-07 / L4-07.) Eight read keys had no seed anywhere, so each reader's
// hardcoded default was the only thing deciding, and the admin had no row to show which default
// was in force. supabase/migrations/20270345000400_seed_missing_platform_flags.sql seeds them.
// This walks every `.eq('key', '<flag>')` read of platform_flags in the reader modules and fails
// on a key no migration inserts, so the next unseeded reader cannot land silently.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const FLAG_READERS = ['lib/platform-flags.ts', 'lib/onboarding/flags.ts', 'lib/onboarding/status.ts']

function readFlagKeys(): string[] {
  const keys = new Set<string>()
  for (const file of FLAG_READERS) {
    const src = readFileSync(file, 'utf8')
    // Only a read that sits inside a platform_flags query: the key literal is what a seed must match.
    for (const m of src.matchAll(/from\('platform_flags'\)[\s\S]{0,120}?\.eq\('key',\s*'([a-z_]+)'\)/g)) keys.add(m[1])
  }
  return [...keys].sort()
}

function seededFlagKeys(): Set<string> {
  const dir = join('supabase', 'migrations')
  const seeded = new Set<string>()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/\('([a-z_]+)',\s*(?:true|false)\)/g)) seeded.add(m[1])
  }
  return seeded
}

describe('every platform_flags key the code reads is seeded by a migration', () => {
  it('guards non-trivially (the walk finds the readers it claims to)', () => {
    const keys = readFlagKeys()
    expect(keys.length).toBeGreaterThanOrEqual(12)
    for (const k of [
      'auto_popups_enabled',
      'next_steps_enabled',
      'referrals_enabled',
      'sms_enabled',
      'vera_autonomy_enabled',
      'vera_breaker_armed',
      'host_payouts_enabled',
      'chat_dm_routes_retired',
    ]) {
      expect(keys).toContain(k)
    }
  })

  it('has no read key without a seed row', () => {
    const seeded = seededFlagKeys()
    const unseeded = readFlagKeys().filter((k) => !seeded.has(k))
    expect(unseeded).toEqual([])
  })

  it('seeds each late-seeded key with its reader default, so the row changes nothing on apply', () => {
    const sql = readFileSync('supabase/migrations/20270345000400_seed_missing_platform_flags.sql', 'utf8')
    const expected: Record<string, boolean> = {
      auto_popups_enabled: false,
      next_steps_enabled: false,
      referrals_enabled: true,
      sms_enabled: false,
      vera_autonomy_enabled: false,
      vera_breaker_armed: true,
      host_payouts_enabled: false,
      chat_dm_routes_retired: false,
    }
    for (const [key, value] of Object.entries(expected)) {
      expect(sql).toMatch(new RegExp(`\\('${key}',\\s*${value}\\)`))
    }
    // Idempotent: a later operator flip must survive a re-run.
    expect(sql).toMatch(/on conflict \(key\) do nothing/)
  })
})

