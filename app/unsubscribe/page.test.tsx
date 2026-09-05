import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

// ── A GET of /unsubscribe must NEVER unsubscribe anyone (L2-01) ──────────────────────────────────
//
// WHY THIS TEST EXISTS. This page is the URL in every bulk email's footer ("Unsubscribe:") and the
// second entry in its `List-Unsubscribe` header. Until 2026-09-05 the page called
// `processUnsubscribe` DURING RENDER, so any HTTP GET performed the unsubscribe. Corporate link
// scanners and mail-client prefetchers GET every URL in an email before the member reads it, so
// members were opted out without a click, and nothing failed: the page rendered "You're
// unsubscribed." into a fetch nobody was looking at.
//
// Now a GET only verifies the token and renders a confirm button; the write runs from the server
// action the click invokes (a POST by construction). Three things are pinned here:
//   1. rendering the page with a VALID token calls no action and touches no table;
//   2. the token check itself is unchanged (a bad token gets the invalid layout, no button);
//   3. the source shape: page.tsx never names the action, and the only call site lives inside the
//      click handler of the client confirm step, never in a render body.

const actions = vi.hoisted(() => ({
  processUnsubscribe: vi.fn(async () => ({ ok: true, data: { category: 'events' } })),
  processSpaceUnsubscribe: vi.fn(async () => ({ ok: true, data: { scope: 'space' } })),
  setContactTopicPreference: vi.fn(async () => ({ ok: true })),
}))
const db = vi.hoisted(() => ({ tables: [] as string[] }))

vi.mock('./actions', () => actions)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      db.tables.push(table)
      throw new Error(`unexpected table access on GET: ${table}`)
    },
  }),
}))
vi.mock('@/lib/comms/contact-preferences', () => ({
  CONTACT_TOPICS: ['dispatches', 'events', 'marketing'],
  getContactPreferences: vi.fn(async () => []),
}))
// The card frame pulls in the page-heading grammar (client hooks behind PageAdminBar); the page's
// own markup is what is under test, so the template is reduced to its slots.
vi.mock('@/components/templates', () => ({
  FocusTemplate: ({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  ),
}))

import UnsubscribePage from './page'
import { makeUnsubscribeToken } from '@/lib/unsubscribe-tokens'

// Comments are stripped before the shape checks: the page's header comment names the action ON
// PURPOSE (it is the record of what went wrong), and a shape test measures code, not prose.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const PAGE = stripComments(readFileSync('app/unsubscribe/page.tsx', 'utf8'))
const CONFIRM = stripComments(readFileSync('app/unsubscribe/confirm-unsubscribe.tsx', 'utf8'))

async function render(sp: Record<string, string>) {
  const el = await UnsubscribePage({ searchParams: Promise.resolve(sp) })
  return renderToStaticMarkup(el)
}

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-unsubscribe-page-test-0000')
  actions.processUnsubscribe.mockClear()
  db.tables.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /unsubscribe?p=&c=&t= with a valid token', () => {
  it('renders a confirm button and performs nothing', async () => {
    const t = makeUnsubscribeToken('profile-1', 'events')
    const html = await render({ p: 'profile-1', c: 'events', t })

    expect(html).toContain('Unsubscribe from event reminders?')
    expect(html).toMatch(/<button[^>]*>Unsubscribe<\/button>/)
    expect(html).not.toContain("You're unsubscribed.")

    expect(actions.processUnsubscribe).not.toHaveBeenCalled()
    expect(db.tables).toEqual([])
  })
})

describe('the token check is unchanged on GET', () => {
  it('shows the invalid layout, and no button, for a wrong token', async () => {
    const html = await render({ p: 'profile-1', c: 'events', t: 'f'.repeat(32) })
    expect(html).toContain('This link is invalid or expired.')
    expect(html).not.toMatch(/<button/)
    expect(actions.processUnsubscribe).not.toHaveBeenCalled()
  })

  it('rejects a token minted for another category (the HMAC covers profile + category)', async () => {
    const t = makeUnsubscribeToken('profile-1', 'events')
    const html = await render({ p: 'profile-1', c: 'dispatches', t })
    expect(html).toContain('This link is invalid or expired.')
    expect(html).not.toMatch(/<button/)
  })

  it('shows the incomplete-link layout when a param is missing', async () => {
    const html = await render({ p: 'profile-1', c: 'events' })
    expect(html).toContain('Missing unsubscribe details.')
    expect(html).not.toMatch(/<button/)
  })
})

describe('source shape: the write can only happen from the click', () => {
  it('page.tsx never names processUnsubscribe and never imports ./actions', () => {
    expect(PAGE).not.toMatch(/processUnsubscribe/)
    expect(PAGE).not.toMatch(/from ['"]\.\/actions['"]/)
    // Positive control: the page still VERIFIES on GET, so the confirm button is not offered
    // for a bad link.
    expect(PAGE).toMatch(/verifyUnsubscribeToken\(/)
  })

  it('confirm-unsubscribe.tsx is a client component whose only call sits inside startTransition', () => {
    expect(CONFIRM.trimStart().startsWith("'use client'")).toBe(true)
    const calls = CONFIRM.match(/processUnsubscribe\(/g) ?? []
    expect(calls).toHaveLength(1)
    // The call is inside the transition callback (a click handler), not the component body: the
    // text between `startTransition(async () => {` and the call contains no closing of that block.
    const start = CONFIRM.indexOf('startTransition(async () => {')
    const call = CONFIRM.indexOf('processUnsubscribe(')
    expect(start).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(start)
    expect(CONFIRM.slice(start, call)).not.toMatch(/\n\s*\}\)/)
  })
})
