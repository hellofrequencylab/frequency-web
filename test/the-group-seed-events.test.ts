// The Group seed places every event in a circle (handoff task E, SCAN-949; LIVE-952).
import { describe, expect, it } from 'vitest'
import { buildEvents, circleFor, circleId, CIRCLES, NETWORK_CIRCLES, renderSql } from '../scripts/seed-the-group.mts'

describe('the-group seed: events into circles', () => {
  const events = buildEvents()

  it('every handoff circle has at least one seeded series placed in it', () => {
    const placed = new Set(events.map((e) => e.circle))
    for (const c of CIRCLES) expect(placed, c.name).toContain(c.key)
  })

  it('a title is matched case-insensitively and across apostrophes, a chapter meeting falls back to the Space Circle', () => {
    expect(circleFor('Swami’s Beach Gathering in the Grass')).toBe('swamis')
    expect(circleFor("Women's Group Coffee Meetup ☕️")).toBe('womens-coffee')
    expect(circleFor('The Wellness Club')).toBe('wellness')
    expect(circleFor('Feel Good Friday')).toBeNull()
    expect(circleFor('Team Up Tuesday at Maya Moon')).toBeNull()
  })

  it('the SQL writes the placement columns livePlacementPatch writes, and never a public scope', () => {
    const sql = renderSql()
    const inserts = sql.split('\n').filter((l) => l.startsWith('insert into events (slug, title'))
    expect(inserts.length).toBe(events.length)
    expect(sql).not.toMatch(/\(select region_id from _tg\), 'public'/)
    for (const e of events) {
      const ref = e.circle ? `'${circleId(e.circle)}'` : 'is_space_primary'
      const at = sql.indexOf(`values ('${e.slug}'`)
      const row = sql.slice(at, sql.indexOf('\non conflict (slug)', at))
      expect(row, e.slug).toContain(ref)
      expect(row, e.slug).toContain(", 'circle', ")
    }
    expect(sql).toContain('scope_type = excluded.scope_type, scope_circle_id = excluded.scope_circle_id')
    expect(sql).toContain('a.scope_type, a.scope_circle_id,')
  })

  it('the three new circles get a placeholder meetup that an owner edit beats', () => {
    const sql = renderSql()
    for (const c of NETWORK_CIRCLES) {
      expect(sql).toContain(`'${circleId(c.key)}', '${c.name}', 'tg-${c.key}'`)
      expect(c.meetup).toMatch(/June confirms/)
      expect(sql).toContain(`('${circleId(c.key)}', '${JSON.stringify({ text: c.meetup, length: '' }).replace(/'/g, "''")}'::jsonb) on conflict (circle_id) do update set meetup = excluded.meetup, updated_at = now() where coalesce(circle_profiles.meetup->>'text', '') = ''`)
    }
    expect(events.some((e) => e.circle === 'masterminds' || e.circle === 'pickleball')).toBe(false)
  })
})
