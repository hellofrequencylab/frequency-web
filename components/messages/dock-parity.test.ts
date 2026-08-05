import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Drift guard: dock parity for rename, leave and the roster (ADR-896 acceptance) ────────
// `chat_dm_routes_retired` was gated on the dock carrying the three capabilities that used to
// live only on app/(main)/messages/[id]/page.tsx. It does, and the flag is ON in production, so
// these assertions have changed job: they were the acceptance criteria and they are now the
// regression guard. With the page retired the dock is the ONLY way to rename a group, leave one,
// or see who is in it — losing any of them would take the capability away outright, and nothing
// would throw. That silence is why these are source-level, the same reason
// message-member-button.test.ts and series-wiring.test.ts are.

const dockChat = readFileSync('components/messages/dock-chat.tsx', 'utf8')
const details = readFileSync('components/messages/dock-thread-details.tsx', 'utf8')
const actions = readFileSync('app/(main)/messages/actions.ts', 'utf8')
const loader = readFileSync('app/(main)/messages/popover-actions.ts', 'utf8')
const dmPage = readFileSync('app/(main)/messages/[id]/page.tsx', 'utf8')
const launcher = readFileSync('components/vera/vera-launcher.tsx', 'utf8')

describe('the files under test are non-trivial (guards a vacuous pass)', () => {
  it('every source read is a real file', () => {
    for (const src of [dockChat, details, actions, loader, dmPage, launcher]) {
      expect(src.length).toBeGreaterThan(1000)
    }
  })
})

// ── 1. The dock and the page share the SAME server actions ────────────────────────────────
// This is the load-bearing assertion of the whole job. Parity built on a second copy of a
// mutation is not parity; it is two gates that will disagree.

describe('the dock and the page share one implementation of every capability', () => {
  it('rename is the page action, reused unchanged', () => {
    expect(dockChat).toContain('renameConversation')
    expect(dmPage).toContain('ConversationRenameButton')
    expect(readFileSync('components/messages/conversation-rename-button.tsx', 'utf8'))
      .toContain('renameConversation')
    // One definition, in the page's own action file.
    expect(actions).toContain('export async function renameConversation')
    expect(dockChat).toContain("from '@/app/(main)/messages/actions'")
  })

  it('both leave paths run through one shared delete, so the gate cannot drift', () => {
    expect(actions).toContain('async function deleteMyParticipation')
    const navigating = actions.slice(actions.indexOf('export async function leaveConversation('))
    const inPlace = actions.slice(actions.indexOf('export async function leaveConversationInPlace'))
    expect(navigating.slice(0, navigating.indexOf('\n}'))).toContain('deleteMyParticipation(conversationId)')
    expect(inPlace).toContain('deleteMyParticipation(conversationId)')
    // The delete is scoped to the caller's OWN row: that IS the authorization, and it lives in
    // the shared helper rather than being re-stated per exit.
    const shared = actions.slice(actions.indexOf('async function deleteMyParticipation'))
    const body = shared.slice(0, shared.indexOf('\n}\n'))
    expect(body).toContain("eq('profile_id', myProfileId)")
    expect(body).toContain('await getMyProfileId()')
  })

  it('the dock uses the non-navigating twin and never the redirecting one', () => {
    expect(dockChat).toContain('leaveConversationInPlace')
    // A redirect from a client-invoked action navigates the member to /messages: the exact
    // page the dock exists to replace. Forbid the CALL, not the substring — the twin's own
    // name starts with it, and prose about it is not a regression.
    expect(dockChat).not.toContain('leaveConversation(')
    const inPlace = actions.slice(actions.indexOf('export async function leaveConversationInPlace'))
    expect(inPlace).not.toContain('redirect(')
  })

  it('the page keeps its redirecting exit while the flag is off', () => {
    // The route still renders. Removing this would break leaving from the page TODAY.
    expect(dmPage).toContain('leaveConversation.bind')
    const navigating = actions.slice(
      actions.indexOf('export async function leaveConversation('),
      actions.indexOf('export async function leaveConversationInPlace'),
    )
    expect(navigating).toContain("redirect('/messages')")
  })

  it('the in-place twin returns a result instead of throwing', () => {
    // A thrown Error in a client-invoked action reaches the browser as an opaque production
    // digest, so any UI reading err.message is rendering a lie.
    const inPlace = actions.slice(actions.indexOf('export async function leaveConversationInPlace'))
    expect(inPlace).toContain('Promise<ActionResult<void>>')
    expect(inPlace).toContain('return ok()')
    expect(inPlace).toContain('fail(')
  })
})

// ── 2. Rename prefills from the STORED name, not the derived label ────────────────────────

describe('rename cannot promote a derived label into a stored name', () => {
  it('the loader returns the raw conversations.name beside the derived title', () => {
    expect(loader).toContain('title: string; name: string | null')
    expect(loader).toContain('return { myProfileId, participants, messages, title, name }')
  })

  it('the details panel prefills from `name`', () => {
    expect(details).toContain('name: string | null')
    expect(details).toContain('useState(name ?? ')
    expect(dockChat).toContain('name={dm.name}')
  })

  it('both renderers derive the fallback label from ONE shared rule', () => {
    // The loader's inline copy had already drifted from the page's (no `+N` overflow).
    expect(loader).toContain("from '@/lib/messages/dm-title'")
    expect(dockChat).toContain("from '@/lib/messages/dm-title'")
    expect(loader).toContain('dmTitle(name, participants, myProfileId)')
  })
})

// ── 3. The roster ─────────────────────────────────────────────────────────────────────────

describe('the roster renders from data already on the wire', () => {
  it('the loader already returned participants and myProfileId (no new query)', () => {
    expect(loader).toContain('participants: DockPeer[]')
    expect(dockChat).toContain('participants={dm.participants}')
    expect(dockChat).toContain('myProfileId={dm.myProfileId}')
  })

  it('rows link to the member profile and mark the caller', () => {
    expect(details).toContain('href={`/people/${p.handle}`}')
    expect(details).toContain('p.id === myProfileId')
    expect(details).toContain('People (')
  })

  it('it is reachable on a phone, unlike the page aside it replaces', () => {
    // The page's roster is `hidden lg:flex`: below 1024px there has never been a way to see
    // who is in a conversation. The dock version must not inherit that.
    expect(dmPage).toContain('hidden lg:flex')
    expect(details).not.toContain('hidden lg:')
    expect(details).not.toContain('hidden md:')
  })
})

// ── 4. Gates are MIRRORED, never widened ──────────────────────────────────────────────────

describe('the group-only affordance matches the page byte for byte', () => {
  it('the page computes isGroup from the other participants', () => {
    expect(dmPage).toContain('const isGroup = others.length > 1')
  })

  it('the dock computes it the same way and feeds both capabilities', () => {
    expect(dockChat).toContain('const isGroup = others.length > 1')
    expect(dockChat).toContain('canRename={isGroup}')
    expect(dockChat).toContain('canLeave={isGroup}')
  })

  it('rename still re-gates on the server regardless of what renders', () => {
    const rename = actions.slice(actions.indexOf('export async function renameConversation'))
    expect(rename).toContain('conversation_participants')
    expect(rename).toContain('You must be a participant to rename this conversation')
  })
})

// ── 5. Focus + keyboard ───────────────────────────────────────────────────────────────────

describe('the details layer is keyboard-reachable and never traps focus', () => {
  it('the toggle is a labelled, expandable control wired to the panel', () => {
    expect(dockChat).toContain('aria-expanded={detailsOpen}')
    // Emitted only while the layer is mounted: aria-controls pointing at an absent id is a
    // dangling reference.
    expect(dockChat).toContain("aria-controls={detailsOpen ? 'dock-thread-details' : undefined}")
    expect(dockChat).toContain('aria-label="Conversation details"')
    expect(details).toContain('id="dock-thread-details"')
  })

  it('the layer is mounted on open and keyed, so it needs no reset effect', () => {
    // Unmounting IS the reset. Without the key, a half-typed name or a primed "Yes, leave"
    // could survive into a different conversation; without the mount gate, resetting it would
    // need setState inside an effect, which this repo's lint rejects for good reason.
    expect(dockChat).toContain('detailsOpen && (')
    expect(dockChat).toContain('key={open.id}')
    // Exactly one effect in the panel, and it is the focus one. Any second effect would be a
    // prop-sync reset creeping back in.
    expect(details.match(/useEffect\(/g)?.length).toBe(1)
    expect(details).toContain('panelRef.current?.focus()')
  })

  it('the covered thread is inert rather than trapped', () => {
    // The dock is non-modal (aria-modal="false"); a focus trap would contradict the ARIA and
    // break "members keep navigating while chatting". inert stops tabbing into a composer
    // hidden behind the layer.
    expect(launcher).toContain('aria-modal="false"')
    expect(dockChat).toContain('inert={detailsOpen || undefined}')
    expect(details).not.toContain('focus-trap')
  })

  it('closing the layer returns focus to the toggle, never to <body>', () => {
    expect(dockChat).toContain('detailsButtonRef.current?.focus()')
    // Deferred by a macrotask on purpose: each trigger is REPLACED by its expanded form, so a
    // synchronous focus call lands before React has re-mounted it and silently does nothing.
    expect(details).toContain('function focusAfterRender')
    expect(details).toContain('focusAfterRender(renameTriggerRef)')
    expect(details).toContain('focusAfterRender(leaveTriggerRef)')
  })

  it('leaving names its own focus target and announces itself', () => {
    expect(dockChat).toContain('inboxFirstRef.current?.focus()')
    expect(dockChat).toContain('role="status"')
  })

  it('the panel consumes Escape before the launcher can see it', () => {
    expect(details).toContain('e.stopPropagation()')
    // The layering works only because the launcher listens on `window` in the BUBBLE phase
    // (window is the last node in the path). A capture-phase third argument would silently
    // break it, so pin the signature.
    expect(launcher).toContain("window.addEventListener('keydown', onKey)")
    expect(launcher).not.toContain("addEventListener('keydown', onKey, true)")
    expect(launcher).not.toContain("addEventListener('keydown', onKey, { capture")
  })

  it('an Escape that reaches the launcher closes the layer before popping the thread', () => {
    // The DOCK_BACK_EVENT listener is registered once with [] deps on purpose, so reading
    // detailsOpen directly inside it would read the first render's value forever.
    expect(dockChat).toContain('const detailsOpenRef = useRef(false)')
    expect(dockChat).toContain('if (detailsOpenRef.current)')
    expect(dockChat).toContain('}, [])')
    // Back must also clear the layer, or the inbox renders behind a stale open panel.
    expect(dockChat).toMatch(/function back\(\)[^\n]*setDetailsOpen\(false\)/)
  })

  it('there is no native confirm (unstyleable, and it freezes a mid-animation iOS sheet)', () => {
    expect(details).not.toContain('window.confirm')
    expect(details).not.toContain('alert(')
    expect(dockChat).not.toContain('alert(')
    // Two steps, which is strictly safer than the page (one click leaves, no confirmation).
    expect(details).toContain('Leave this conversation?')
  })
})

// ── 6. Mobile ─────────────────────────────────────────────────────────────────────────────

describe('the layer behaves as a bottom sheet on a phone, not a desktop panel', () => {
  it('it stays inside the sheet (absolute, never fixed)', () => {
    // A fixed child escapes the dock's bottom sheet and sits under the browser toolbar.
    expect(details).toContain('absolute inset-0')
    expect(details).not.toContain('fixed inset-0')
  })

  it('the roster is the only scroller, so Leave cannot be pushed off the sheet', () => {
    expect(details).toContain('min-h-0 flex-1 overflow-y-auto')
    expect(details.match(/overflow-y-auto/g)?.length).toBe(1)
  })

  it('the rename input does not trigger the iOS focus zoom', () => {
    // Safari zooms the viewport for any input under 16px; inside a 68dvh sheet the
    // zoom-and-restore jump is worse than on a full page.
    expect(details).toContain('text-body')
    expect(details).toContain('sm:text-body-sm')
  })

  it('touch targets are real ones', () => {
    expect(details).toContain('min-h-11') // roster rows
    expect(details.includes('min-h-10')).toBe(true) // buttons
    expect(dockChat).toContain('h-10 w-10') // header icon buttons
  })
})

// ── 7. Cache consistency ──────────────────────────────────────────────────────────────────

describe('the inbox does not contradict what just happened', () => {
  it('mutations force a summary re-read through the existing seam', () => {
    expect(dockChat).toContain('export function refreshDockSummary')
    expect(dockChat).toContain('loadSummaryCached(true)')
    // Both mutations, or the 20s cache shows a thread you just left.
    expect(dockChat.match(/refreshDockSummary\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

// ── 8. The panel stays presentational ─────────────────────────────────────────────────────

describe('the details panel imports no server action', () => {
  it('it takes callbacks instead', () => {
    // Importing a 'use server' module would drag @/lib/supabase/admin into the a11y render
    // test and the component would never mount.
    expect(details).not.toContain('@/app/(main)/messages/actions')
    expect(details).not.toContain('use server')
    expect(details).toContain('onRename: (next: string) => Promise<string | null>')
    expect(details).toContain('onLeave: () => Promise<string | null>')
  })
})
