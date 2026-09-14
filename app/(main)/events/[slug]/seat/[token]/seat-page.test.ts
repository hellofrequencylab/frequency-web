import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PROG-GD2, the row's own required test: THE PAGE DOES NOTHING ON GET.
//
// Mail scanners pre-click links. The seat page must render state and wait for a submit; it must
// never act on arrival. Three things make that true and this file pins all three by SOURCE SHAPE,
// which is the earliest place it can be pinned and the one a refactor cannot route around:
//
//   1. the page imports no server action and calls no mutation: no seat-actions import, no
//      .insert/.update/.delete/.upsert, and no rpc other than the one read the SQL declares STABLE;
//   2. read_guest_seat is declared STABLE in the migration, which Postgres enforces (a STABLE
//      function cannot INSERT, UPDATE or DELETE), and the write doors are NOT stable;
//   3. the page is never indexed (its URL carries a capability) and is dynamic (a token is
//      resolved per request, never cached).
//
// Plus the shape of the release: the action runs the SHARED promoteFromWaitlist + notifyPromotedSeat
// pair, not a copy of the waitlist, and never imports the admin client.

const here = (f: string) => join(process.cwd(), 'app/(main)/events/[slug]/seat/[token]', f)
const page = readFileSync(here('page.tsx'), 'utf8')
const actions = readFileSync(here('seat-actions.ts'), 'utf8')
const form = readFileSync(here('seat-form.tsx'), 'utf8')
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20270345004200_guest_seat_token.sql'),
  'utf8',
)

/** Source with comments stripped, so a comment naming a forbidden token cannot trip the pin. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the seat page has no side effect on GET (source shape)', () => {
  const body = code(page)

  it('imports no server action and no mutation surface', () => {
    expect(body).not.toMatch(/seat-actions/)
    expect(body).not.toMatch(/['"]use server['"]/)
    expect(body).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    expect(body).not.toMatch(/\.from\(/)
    expect(body).not.toMatch(/createAdminClient|lib\/supabase\/admin/)
  })

  it('reads through loadGuestSeat and names no write-bearing rpc', () => {
    expect(body).toMatch(/loadGuestSeat\(/)
    expect(body).not.toMatch(/\.rpc\(/)
    expect(body).not.toMatch(/update_guest_seat|release_guest_seat|mint_guest_seat_token/)
  })

  it('is dynamic and never indexed', () => {
    expect(body).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(body).toMatch(/robots:\s*\{\s*index:\s*false/)
  })

  it('composes a shell and hands every submit to the client form', () => {
    expect(body).toMatch(/<FocusTemplate/)
    expect(body).toMatch(/<GuestSeatForm/)
  })

  it('shows no address, venue or host field', () => {
    expect(body).not.toMatch(/location|venue|street|hide_address|host_id|display_name/)
  })
})

describe('the read door cannot write (migration shape)', () => {
  it('declares read_guest_seat and the resolver STABLE, and the write doors volatile', () => {
    const fn = (name: string) => {
      const m = migration.match(new RegExp(`create or replace function ${name.replace('.', '\\.')}\\([^)]*\\)[\\s\\S]*?as \\$\\$`))
      expect(m, `${name} is defined in the migration`).not.toBeNull()
      return m![0]
    }
    expect(fn('public.read_guest_seat')).toMatch(/\bstable\b/)
    expect(fn('private.guest_seat_for_token')).toMatch(/\bstable\b/)
    expect(fn('public.update_guest_seat')).not.toMatch(/\bstable\b/)
    expect(fn('public.release_guest_seat')).not.toMatch(/\bstable\b/)
    expect(fn('public.mint_guest_seat_token')).not.toMatch(/\bstable\b/)
  })

  it('returns no location, venue, street or host from the read door', () => {
    const start = migration.indexOf('create or replace function public.read_guest_seat')
    const end = migration.indexOf('comment on function public.read_guest_seat')
    const readDoor = migration.slice(start, end).replace(/^\s*--.*$/gm, '')
    expect(readDoor).not.toMatch(/location|venue|street|hide_address|host_id|city|region/)
  })

  it('the release writes the row a member release writes, and clears the token in the same statement', () => {
    const start = migration.indexOf('create or replace function public.release_guest_seat')
    const end = migration.indexOf('comment on function public.release_guest_seat')
    const release = migration.slice(start, end)
    expect(release).toMatch(/status = 'not_going'/)
    expect(release).toMatch(/plus_ones = 0/)
    expect(release).toMatch(/seat_token_hash = null/)
  })

  it('mint is service_role only and the three token doors reach anon', () => {
    expect(migration).toMatch(/revoke execute on function public\.mint_guest_seat_token\(uuid\) from public, anon, authenticated;/)
    expect(migration).toMatch(/grant\s+execute on function public\.mint_guest_seat_token\(uuid\) to service_role;/)
    for (const sig of ['read_guest_seat(uuid)', 'update_guest_seat(uuid, integer, jsonb)', 'release_guest_seat(uuid)']) {
      expect(migration).toMatch(new RegExp(`grant\\s+execute on function public\\.${sig.replace(/[()]/g, '\\$&')} to anon, authenticated, service_role;`))
    }
  })
})

describe('the release is the member release, not a copy of it', () => {
  const body = code(actions)

  it('runs the shared promoteFromWaitlist + notifyPromotedSeat pair after release_guest_seat', () => {
    expect(body).toMatch(/import \{ promoteFromWaitlist \} from '@\/lib\/events\/capacity'/)
    expect(body).toMatch(/import \{ notifyPromotedSeat \} from '@\/lib\/events\/waitlist-notify'/)
    const release = body.slice(body.indexOf('export async function releaseGuestSeat'))
    expect(release).toMatch(/rpc\('release_guest_seat'/)
    expect(release.indexOf('promoteFromWaitlist(')).toBeGreaterThan(release.indexOf("rpc('release_guest_seat'"))
    expect(release).toMatch(/notifyPromotedSeat\(promoted, eventId\)/)
    // No second waitlist: nothing here reads or writes event_rsvps itself.
    expect(body).not.toMatch(/\.from\('event_rsvps'\)/)
  })

  it('stays on the session client and off the admin client', () => {
    expect(body).toMatch(/from '@\/lib\/supabase\/server'/)
    expect(body).not.toMatch(/createAdminClient|lib\/supabase\/admin/)
  })
})

describe('the form acts only on a tap', () => {
  const body = code(form)

  it('calls no action from an effect or on mount', () => {
    expect(body).not.toMatch(/useEffect/)
    // Every action call sits inside a startTransition, which only a handler enters.
    const calls = body.match(/(updateGuestSeat|releaseGuestSeat)\(\{/g) ?? []
    expect(calls.length).toBe(2)
    expect(body.match(/startTransition\(async/g)?.length).toBe(2)
  })

  it('puts the release behind a confirmation', () => {
    expect(body).toMatch(/setConfirming\(true\)/)
    expect(body).toMatch(/Keep it/)
  })
})
