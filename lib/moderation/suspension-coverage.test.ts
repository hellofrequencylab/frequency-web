import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  ACTOR_COLUMNS,
  CONTENT_COLUMNS,
  SUSPENSION_COVERED,
  SUSPENSION_EXEMPT,
} from './suspension-coverage'

// THE GATE THAT STOPS THE NEXT "ENFORCED ON TWO TABLES" (ADR-TBD, B3-3).
//
// The suspension rule lived in one trigger on two tables for two years, and the reason nobody
// noticed is that nothing stated which tables it was supposed to reach. This test states it three
// ways and fails when they disagree:
//
//   1. THE UNIVERSE. Every table in the generated schema with an actor-shaped column AND a
//      content-shaped column must be on the covered list or the exempt list. A new member-write
//      table is red until someone decides, in the ledger, whether the sanction reaches it.
//   2. THE LEDGER IS TRUE. Every covered (table, actor) pair is a real column, and a real FK to
//      profiles, in lib/database.types.ts, which is proven byte-identical to production. A ledger
//      row naming a column the table does not have is exactly the misattachment the trigger
//      function refuses at runtime; here it is refused at PR time.
//   3. THE SQL MATCHES THE LEDGER, BOTH WAYS. The migration attaches the trigger to every covered
//      table with the ledger's actor column and edit columns, and to nothing else.
//
// Plus the two properties of the function body that the original version got wrong or nearly
// wrong: no service_role bypass (the app's own compose path IS service_role), and suspended_until
// is honoured (a timed suspension lapses on its own).
//
// The behavioural half (a suspended member's insert actually raises) is
// supabase/tests/suspension_reaches_every_member_write.test.sql under `supabase test db`; only a
// real Postgres can prove a trigger fires.

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const TYPES = read('lib/database.types.ts')
const SQL = read('supabase/migrations/20270344000000_suspension_reaches_every_member_write.sql')

/** Table → { columns, profileFkColumns } parsed from the generated Database type. */
function schemaTables(): Map<string, { columns: Set<string>; profileFks: Set<string> }> {
  const start = TYPES.indexOf('    Tables: {')
  const end = TYPES.indexOf('    Views: {', start)
  const block = TYPES.slice(start, end)
  const out = new Map<string, { columns: Set<string>; profileFks: Set<string> }>()
  // Each table: `      <name>: {\n        Row: {...}\n ... Relationships: [...]` up to the next
  // table at the same indent.
  const TABLE = /\n {6}([a-z0-9_]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}([\s\S]*?)(?=\n {6}[a-z0-9_]+: \{\n {8}Row: \{|$)/g
  for (const m of block.matchAll(TABLE)) {
    const columns = new Set([...m[2].matchAll(/^ {10}([a-z0-9_]+)\??:/gm)].map((x) => x[1]))
    const profileFks = new Set<string>()
    const REL = /columns: \["([a-z0-9_]+)"\]\n\s+isOneToOne: (?:true|false)\n\s+referencedRelation: "profiles"/g
    for (const r of m[3].matchAll(REL)) profileFks.add(r[1])
    out.set(m[1], { columns, profileFks })
  }
  return out
}

const SCHEMA = schemaTables()
const COVERED = SUSPENSION_COVERED as Record<string, { actor: string; edit?: readonly string[] }>

describe('the ledger is well-formed', () => {
  it('parsed the generated schema (a scan of nothing passes everything)', () => {
    // 274 tables on 2026-09-04; the floor is well under so a regenerate never trips it, and well
    // over zero so a regex that stops matching cannot pass by scanning nothing.
    expect(SCHEMA.size).toBeGreaterThan(200)
    expect(SCHEMA.get('posts')?.columns.has('author_id')).toBe(true)
    expect(SCHEMA.get('posts')?.profileFks.has('author_id')).toBe(true)
  })

  it('no table is both covered and exempt', () => {
    const both = Object.keys(COVERED).filter((t) => t in SUSPENSION_EXEMPT)
    expect(both).toEqual([])
  })

  it('every exemption carries a reason', () => {
    for (const [t, reason] of Object.entries(SUSPENSION_EXEMPT)) {
      expect(reason.trim().length, `${t} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('every ledger table exists in the schema (a dropped table must leave the ledger)', () => {
    const missing = [...Object.keys(COVERED), ...Object.keys(SUSPENSION_EXEMPT)].filter(
      (t) => !SCHEMA.has(t),
    )
    expect(missing).toEqual([])
  })
})

describe('1. the universe: every actor+content table has a verdict', () => {
  it('lists every table with an actor column and a content column on one list or the other', () => {
    const actor = new Set<string>(ACTOR_COLUMNS)
    const content = new Set<string>(CONTENT_COLUMNS)
    const unclassified: string[] = []
    for (const [table, { columns }] of SCHEMA) {
      const hasActor = [...columns].some((c) => actor.has(c))
      const hasContent = [...columns].some((c) => content.has(c))
      if (!hasActor || !hasContent) continue
      if (table in COVERED || table in SUSPENSION_EXEMPT) continue
      unclassified.push(table)
    }
    // A red run here is the gate doing its job: decide whether a suspension reaches the new
    // table and add it to SUSPENSION_COVERED (plus a trigger in a new migration) or to
    // SUSPENSION_EXEMPT with the reason. Never widen CONTENT_COLUMNS to make it pass.
    expect(unclassified, `unclassified member-write tables: ${unclassified.join(', ')}`).toEqual([])
  })

  it('the universe is not vacuous (the scan found the tables the finding named)', () => {
    const actor = new Set<string>(ACTOR_COLUMNS)
    const content = new Set<string>(CONTENT_COLUMNS)
    const inUniverse = (t: string) => {
      const cols = SCHEMA.get(t)?.columns ?? new Set<string>()
      return [...cols].some((c) => actor.has(c)) && [...cols].some((c) => content.has(c))
    }
    for (const t of ['posts', 'messages', 'room_messages', 'space_reviews', 'spotlight_guestbook']) {
      expect(inUniverse(t), t).toBe(true)
    }
  })
})

describe('2. the ledger is true to the schema', () => {
  it('every covered actor column is a real column and a FK to profiles', () => {
    for (const [table, { actor }] of Object.entries(COVERED)) {
      const entry = SCHEMA.get(table)
      expect(entry?.columns.has(actor), `${table}.${actor} is not a column`).toBe(true)
      expect(entry?.profileFks.has(actor), `${table}.${actor} is not a FK to profiles`).toBe(true)
    }
  })

  it('every covered edit column is a real column', () => {
    for (const [table, { edit }] of Object.entries(COVERED)) {
      for (const col of edit ?? []) {
        expect(SCHEMA.get(table)?.columns.has(col), `${table}.${col} is not a column`).toBe(true)
      }
    }
  })
})

describe('3. the migration matches the ledger, both ways', () => {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  it('attaches BEFORE INSERT to every covered table with the ledger actor column', () => {
    for (const [table, { actor }] of Object.entries(COVERED)) {
      const re = new RegExp(
        `create trigger trg_${esc(table)}_block_suspended\\s+before insert on public\\.${esc(table)}\\s+for each row execute function public\\.enforce_member_not_suspended\\('${esc(actor)}'\\)`,
      )
      expect(SQL, `${table}: missing BEFORE INSERT trigger with actor ${actor}`).toMatch(re)
    }
  })

  it('attaches BEFORE UPDATE OF exactly the ledger edit columns, and only where the ledger says', () => {
    for (const [table, { actor, edit }] of Object.entries(COVERED)) {
      const re = new RegExp(
        `create trigger trg_${esc(table)}_block_suspended_edit\\s+before update of ([a-z_, ]+) on public\\.${esc(table)}\\s+for each row execute function public\\.enforce_member_not_suspended\\('${esc(actor)}'\\)`,
      )
      const m = SQL.match(re)
      if (!edit) {
        expect(m, `${table}: has an edit trigger the ledger does not declare`).toBeNull()
        continue
      }
      expect(m, `${table}: missing BEFORE UPDATE OF trigger`).not.toBeNull()
      expect(m![1].split(',').map((s) => s.trim())).toEqual([...edit])
    }
  })

  it('every drop is paired with a create (idempotent re-run)', () => {
    const drops = [...SQL.matchAll(/drop trigger if exists (trg_[a-z_]+) on public\.([a-z_]+)/g)].map(
      (m) => `${m[1]}@${m[2]}`,
    )
    const creates = [...SQL.matchAll(/create trigger (trg_[a-z_]+)\s+before (?:insert|update of [a-z_, ]+) on public\.([a-z_]+)/g)].map(
      (m) => `${m[1]}@${m[2]}`,
    )
    expect(drops.sort()).toEqual(creates.sort())
  })

  it('attaches to NO table outside the covered list (an exempt table must never carry it)', () => {
    const attached = new Set(
      [...SQL.matchAll(/create trigger trg_[a-z_]+\s+before (?:insert|update of [a-z_, ]+) on public\.([a-z_]+)/g)].map(
        (m) => m[1],
      ),
    )
    const stray = [...attached].filter((t) => !(t in COVERED))
    expect(stray).toEqual([])
    // And the set of attached tables IS the covered set, not merely a subset of it.
    expect([...attached].sort()).toEqual(Object.keys(COVERED).sort())
  })
})

describe('the function body', () => {
  const fn = SQL.slice(
    SQL.indexOf('create or replace function public.enforce_member_not_suspended()'),
    SQL.indexOf('-- ── BEFORE INSERT'),
  )

  it('has NO service_role bypass (the compose path writes as service_role)', () => {
    expect(fn).not.toMatch(/service_role/)
    expect(fn).not.toMatch(/auth\.role\(\)/)
  })

  it('honours suspended_until so a timed suspension lapses on its own', () => {
    expect(fn).toMatch(/suspended_until is null or p\.suspended_until > now\(\)/)
  })

  it('reads the actor column by trigger argument, defaulting to author_id', () => {
    expect(fn).toMatch(/coalesce\(tg_argv\[0\], 'author_id'\)/)
  })

  it('fails loudly on a misattached trigger rather than reading NULL and passing', () => {
    expect(fn).toMatch(/exception when undefined_column then/)
    expect(fn).toMatch(/using errcode = 'undefined_column'/)
  })

  it('lets a NULL actor through (guest RSVPs, channel rooms, poster-scanned drafts)', () => {
    expect(fn).toMatch(/if v_actor is null then\s+return new;/)
  })

  it('raises check_violation, the code the pgTAP test and the original trigger agree on', () => {
    expect(fn).toMatch(/using errcode = 'check_violation'/)
  })
})
