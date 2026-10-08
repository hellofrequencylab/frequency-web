import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { renderToStaticMarkup } from 'react-dom/server'
import { mensworkSign, mensworkSignStarting, MENSWORK_SIGNS } from '@/lib/theme/menswork'
import { SiteChrome } from '@/components/sites/site-chrome'
import { toProfileContext } from './profile-modules'
import type { Space } from './types'
import {
  PROGRAM_OVERVIEW_KEY,
  PROGRAM_OVERVIEW_MAX,
  buildProgramYear,
  courseChipTitle,
  gatheringNote,
  nextProgramOverviewPreferences,
  pickProgramYear,
  programEventKind,
  programHolidays,
  readProgramOverview,
  withoutLeadershipPreferences,
  type ProgramEvent,
} from './leadership'

// LIVE-862: the Leadership page's pure rules, and the proof the executive overview stays private.

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)
const ev = (dayKey: string, title: string, endDayKey: string | null = null): ProgramEvent => ({
  slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${dayKey}`,
  title,
  dayKey,
  endDayKey,
  timeLabel: '6:00 PM',
  draft: false,
  cancelled: false,
})

describe('the zodiac signs on the program calendar', () => {
  it('reads the sign on the fixed start lines', () => {
    expect(mensworkSign(d('2027-01-18')).name).toBe('Capricorn')
    expect(mensworkSign(d('2027-01-19')).name).toBe('Aquarius')
    expect(mensworkSign(d('2027-10-22')).name).toBe('Libra')
    expect(mensworkSign(d('2027-10-23')).name).toBe('Scorpio')
    expect(mensworkSign(d('2027-12-20')).name).toBe('Sagittarius')
    expect(mensworkSign(d('2027-12-21')).name).toBe('Capricorn')
  })

  it('marks the day a sign starts, and only that day', () => {
    expect(mensworkSignStarting(d('2027-02-18'))?.name).toBe('Pisces')
    expect(mensworkSignStarting(d('2027-02-19'))).toBeNull()
  })

  it('every glyph is in text presentation', () => {
    expect(MENSWORK_SIGNS).toHaveLength(12)
    for (const s of MENSWORK_SIGNS) expect(s.glyph.endsWith('︎')).toBe(true)
  })
})

describe('the program year', () => {
  it('leans into next year in the planning season, when next year has events and this one has none left', () => {
    expect(pickProgramYear(d('2026-10-07'), ['2027-01-05', '2027-03-09'])).toBe(2027)
    expect(pickProgramYear(d('2026-10-07'), [])).toBe(2026)
    expect(pickProgramYear(d('2027-02-10'), ['2027-03-09', '2028-01-04'])).toBe(2027)
    // The December lead-in belongs to the next year.
    expect(pickProgramYear(d('2026-10-07'), ['2026-12-08'])).toBe(2027)
  })

  it('draws thirteen months, the December lead-in first, with seasons, boundaries, signs and events', () => {
    const months = buildProgramYear(
      2027,
      [ev('2026-12-08', 'Enrollment opens'), ev('2027-01-05', 'Week 1'), ev('2027-10-29', 'Desert Retreat', '2027-10-31')],
      d('2026-10-07'),
    )
    expect(months).toHaveLength(13)
    expect(months[0]).toMatchObject({ id: 'm-2026-12', leadIn: true, seasons: ['fall', 'winter'] })
    expect(months[12].id).toBe('m-2027-12')
    const day = (key: string) => months.flatMap((m) => m.weeks.flat()).find((x) => x?.key === key)!
    expect(day('2026-12-21')).toMatchObject({ season: 'winter', boundaryFrom: 'fall' })
    expect(day('2026-12-21').signStart?.name).toBe('Capricorn')
    expect(day('2027-03-20')).toMatchObject({ season: 'spring', boundaryFrom: 'winter' })
    expect(day('2027-03-21').boundaryFrom).toBeNull()
    expect(day('2027-01-05').events[0]).toMatchObject({ kind: 'course', dayOf: 1, days: 1 })
    expect(day('2027-10-30').events[0]).toMatchObject({ kind: 'retreat', dayOf: 2, days: 3 })
    expect(day('2026-12-08').isPast).toBe(false)
    // Every week is seven cells.
    for (const m of months) for (const w of m.weeks) expect(w).toHaveLength(7)
  })

  it('styles by title only as a hint, and an unmatched title is a plain event', () => {
    expect(programEventKind(ev('2027-03-09', 'Circle Night'))).toBe('circle')
    expect(programEventKind(ev('2027-05-01', 'Spring Gathering'))).toBe('gathering')
    expect(programEventKind(ev('2027-01-05', 'Opening course: week 2'))).toBe('course')
    expect(programEventKind(ev('2027-06-01', 'Potluck'))).toBe('event')
  })
})

describe('the calendar marks (LIVE-864)', () => {
  it('computes the US holidays for the lead-in and the year', () => {
    const h = programHolidays(2027)
    expect(h.get('2026-12-25')).toBe('Christmas')
    expect(h.get('2027-01-18')).toBe('MLK Day')
    expect(h.get('2027-03-28')).toBe('Easter')
    expect(h.get('2027-05-31')).toBe('Memorial Day')
    expect(h.get('2027-11-25')).toBe('Thanksgiving')
    expect(programHolidays(2026).get('2026-04-05')).toBe('Easter')
  })

  it('names a course chip and a gathering note', () => {
    expect(courseChipTitle('Opening course, week 3')).toBe('Week 3')
    expect(courseChipTitle('Circle Night')).toBe('Circle Night')
    expect(gatheringNote('Imbolc. All circles together.', 'Aquarius')).toBe('Imbolc · mid-Aquarius')
    expect(gatheringNote('All circles together.', 'Aquarius')).toBeNull()
    expect(gatheringNote(null, 'Leo')).toBeNull()
  })
})

describe('the executive overview', () => {
  it('reads, writes only its own key, and an empty save removes it', () => {
    const current = { theme: 'menswork', websitePublished: true }
    const saved = nextProgramOverviewPreferences(current, '## One\r\nBody\n')
    expect(saved).toEqual({ preferences: { ...current, [PROGRAM_OVERVIEW_KEY]: '## One\nBody' } })
    if (!('preferences' in saved)) throw new Error('expected a save')
    expect(readProgramOverview(saved.preferences)).toBe('## One\nBody')
    expect(nextProgramOverviewPreferences(saved.preferences, '   ')).toEqual({ preferences: current })
    expect(nextProgramOverviewPreferences(current, 'x'.repeat(PROGRAM_OVERVIEW_MAX + 1))).toHaveProperty('error')
    expect(readProgramOverview(null)).toBe('')
  })
})

describe('the website Admin link', () => {
  const chrome = (skin: boolean) =>
    renderToStaticMarkup(
      <SiteChrome
        brandName="Heart on Fire"
        homeHref="/"
        links={[{ href: '/#about', label: 'About' }]}
        cta={null}
        themeFonts
        skin={skin ? { theme: 'menswork', season: 'fall' } : null}
        adminHref="/admin"
      >
        <p>Body</p>
      </SiteChrome>,
    )

  it('a skinned site ends its menu with a labelled Admin link to its own admin pages', () => {
    const html = chrome(true)
    expect(html).toContain('class="hs-nav-admin"')
    expect(html).toContain('href="/admin"')
    expect(html).toMatch(/>Admin<\/a>/)
  })

  it('a house-look site shows none', () => {
    expect(chrome(false)).not.toContain('hs-nav-admin')
  })
})

describe('🔴 the overview never reaches a public surface', () => {
  const space = {
    id: 's1',
    slug: 'heart-on-fire',
    name: 'Heart on Fire',
    type: 'nonprofit',
    preferences: { theme: 'menswork', [PROGRAM_OVERVIEW_KEY]: '## Open decisions\n\nMoney TBD.' },
  } as unknown as Space

  it('the public profile projection (the Space page, the website, every block) drops it', () => {
    const ctx = toProfileContext(space)
    expect(ctx.preferences).toEqual({ theme: 'menswork' })
    expect(JSON.stringify(ctx)).not.toContain('Money TBD')
    // The Space row itself is untouched.
    expect(readProgramOverview(space.preferences)).toContain('Money TBD')
  })

  it('strips nothing else, and hands back the same object when there is nothing to strip', () => {
    const plain = { theme: 'menswork' }
    expect(withoutLeadershipPreferences(plain)).toBe(plain)
    expect(withoutLeadershipPreferences(null)).toBeNull()
  })

  it('only the leadership module names the key, and only the console page and the website admin page read the overview', () => {
    // The key as a string literal: the one way code can name it besides PROGRAM_OVERVIEW_KEY.
    const names = execSync(`git grep -l -E "['\\"]programOverview['\\"]" -- app lib components`, { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !/\.test\.tsx?$/.test(f))
    expect(names).toEqual(['lib/spaces/leadership.ts'])
    const readers = execSync('git grep -l "readProgramOverview" -- app lib components', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !/\.test\.tsx?$/.test(f))
      .sort()
    expect(readers).toEqual([
      'app/(main)/spaces/[slug]/manage/leadership/page.tsx',
      'app/hosted/[host]/admin/[view]/page.tsx',
      'lib/spaces/leadership.ts',
    ])
  })
})
