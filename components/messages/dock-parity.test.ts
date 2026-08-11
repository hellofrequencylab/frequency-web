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
    // The accessible NAME, not the attribute that happens to spell it. This pinned
    // `aria-label="Conversation details"` until the control moved onto IconButton, which takes
    // the name as `label` and emits the aria-label itself. The name never changed; only the
    // spelling did — so the assertion failed on a refactor that improved what it guards.
    expect(dockChat).toMatch(/label="Conversation details"/)
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
    // The header controls used to hardcode `h-10 w-10` — a fixed 42.5px for every pointer.
    // They compose IconButton now, which is strictly better: 32px for a mouse, 44px on a coarse
    // pointer, so the target answers the device instead of splitting the difference. Asserting
    // the literal would have forced the sweep to keep the worse implementation, which is the
    // failure mode of pinning markup rather than the contract.
    expect(dockChat).toContain('<IconButton') // header icon buttons own the floors
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

// ── The dock's own controls (owner pass, 2026-08-11) ──────────────────────────────────────
//
// 🔴 THE NEGATIVE ASSERTIONS BELOW READ `code()`, NOT THE RAW SOURCE, and that is not fussiness.
// Every "this control is gone" check here failed on its first run against strings sitting in the
// COMMENTS that explain the removal — `md:rounded-br-none`, `href="/people"`, `TAB_COUNT`. A file
// that documents what it deleted still contains the words, so a raw `not.toContain` makes good
// documentation fail the build and pressures the next person to delete the explanation. Strip
// comments, then assert on what actually ships.
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
// Four changes, each of which is invisible if it silently reverts: a redundant control comes
// back, a live field degrades to a link, or a corner squares off. Source-level for the same
// reason the rest of this file is — nothing renders the panel in a test.

describe('the redundant Messages pill is gone and the title is not', () => {
  it('no tab re-selects the view it is already on', () => {
    // The pill was `onClick={() => setTab('chat')}` inside a role="tablist", and initialTab()
    // defaults to 'chat' — so it could only ever be pressed when it did nothing. Two lines under
    // a header that already said "Messages".
    expect(code(launcher)).not.toMatch(/aria-selected=\{tab === 'chat'\}/)
    expect(code(launcher)).not.toContain("onClick={() => setTab('chat')}")
  })

  it('keeps the header title and subtitle that name the view', () => {
    expect(launcher).toContain('id="vera-launcher-title"')
    expect(launcher).toMatch(/headerTitle = helpOpen \? 'Help & support' : tab === 'vera' \? 'Vera' : 'Messages'/)
    expect(launcher).toContain("'Chat with members and your rooms.'")
  })

  it('leaves a way BACK from Vera, so removing the tab cannot strand anyone', () => {
    // The deleted pill was the only return path from Vera. The header's Back now covers both
    // pushed views; without this the panel would be a one-way door into Vera.
    expect(launcher).toContain("helpOpen || tab === 'vera' ?")
    expect(launcher).toContain("label={helpOpen ? 'Back' : 'Back to messages'}")
    expect(launcher).toContain("setTab('chat')")
  })

  it('does not leave a tablist of one behind', () => {
    // A single `role="tab"` in a `role="tablist"` announces a tab set that does not exist.
    expect(code(launcher)).not.toContain('role="tablist"')
  })

  it('Ask Vera moved into the action bar rather than being deleted', () => {
    // 🔴 THIS ASSERTION USED TO READ `expect(launcher).toContain('Ask Vera')` AND IT WAS A LIE.
    // When the control moved to DockChat the launcher kept the WORDS — in the comment explaining
    // the move — so the test went on passing over a file that no longer renders that control.
    //
    // Its first replacement was wrong in the other direction: `not.toContain('Ask Vera')` on the
    // launcher, which fails, because the HELP section still renders an Ask Vera row of its own
    // (vera-launcher.tsx ~783) and always should. That is a different control in a different
    // view. So the assertion is the HANDOFF — the launcher passes the switch down, DockChat
    // renders the button — which is the thing that actually moved.
    expect(code(launcher)).toContain('onAskVera={() => setTab(')
    expect(code(dockChat)).toContain('Ask Vera')
    expect(code(dockChat)).toContain('onClick={onAskVera}')
  })

  it('the strip that used to hold it is gone, not left empty', () => {
    expect(code(launcher)).not.toContain('border-b border-chrome-border bg-surface px-2 pb-2 pt-1.5')
  })

  it('still surfaces unread, on the dock tab where it has a job', () => {
    // TAB_COUNT went with the pill. The count has to survive somewhere a member can see it with
    // the panel SHUT, which is the trigger — not a badge only visible once you are already reading.
    expect(launcher).toContain('unread={unread}')
    expect(code(launcher)).not.toContain('TAB_COUNT')
    expect(code(launcher)).not.toContain('TAB_ON')
  })
})

describe('the panel is a card, not a chipped one', () => {
  it('rounds all four corners at md', () => {
    // `md:rounded-br-none` squared the bottom-right for a tab that PANEL_GAP moved 8px away.
    expect(code(launcher)).not.toContain('md:rounded-br-none')
    expect(launcher).toContain('md:rounded-card')
  })

  it('clips on the same silhouette it paints', () => {
    // The reveal wrapper is overflow-hidden with the panel's exact box. Square, it sheared the
    // rounded corner and cut lift-3's shadow flat — which is what read as a filled-in corner.
    expect(launcher).toContain("'rounded-t-card md:rounded-card',")
  })

  it('keeps the phone sheet square along the viewport edge', () => {
    // Not an oversight: a bottom sheet flush to the bottom has no page behind its lower corners.
    expect(launcher).toContain('rounded-t-card border border-chrome-border')
  })
})

describe('"Message someone" starts a DM without leaving the page', () => {
  it('Rooms is gone from the action bar, and rooms are still reachable', () => {
    // Rooms was a link OUT (/messages?filter=rooms), so the second control in a panel built for
    // staying put also closed it. Removing it only costs a shortcut: the caller's rooms are
    // listed as rows in this inbox, and "Open all messages" still opens the full one.
    expect(code(dockChat)).not.toContain("/messages?filter=rooms")
    expect(code(dockChat)).toContain('openRoom(r.id, r.name)')
    expect(code(dockChat)).toContain('href="/messages"')
  })

  it('the field asks you to find a member, not to message someone', () => {
    expect(code(dockChat)).toContain('placeholder="Find a member…"')
  })

  it('is a live field, not a link to /people', () => {
    // As a Link it closed the dock and navigated away: the one control for starting a
    // conversation was also the one that ended your visit to the panel.
    expect(code(dockChat)).not.toMatch(/href="\/people"/)
    expect(dockChat).toContain('aria-label="Find a member by name or @handle"')
    expect(dockChat).toContain('type="search"')
  })

  it('searches through the shared handle endpoint rather than a tenth implementation', () => {
    expect(dockChat).toContain('/api/search-handles?q=')
    expect(dockChat).toContain('setTimeout(')
    expect(dockChat).toMatch(/\}, 200\)/)
    expect(dockChat).toContain('ctrl.abort()')
  })

  it('opens the conversation in place through the shared action', () => {
    expect(dockChat).toContain('openDirectConversation')
    expect(dockChat).toContain('openDm(res.conversationId')
  })

  it('renders the friends-gate refusal instead of swallowing it', () => {
    // openDirectConversation returns { ok: false, error } for a non-friend and never throws, so
    // a caller that ignores the result fails silently — the picker would just do nothing.
    expect(dockChat).toContain('setPickError(res.error)')
    expect(dockChat).toMatch(/aria-live="polite"[\s\S]{0,120}?pickError|pickError[\s\S]{0,200}?aria-live="polite"/)
  })

  it('says a member is unreachable BEFORE the click, not after', () => {
    expect(dockChat).toContain("friend_status !== 'accepted'")
    expect(dockChat).toContain('Not connected')
  })

  it('keeps a focus target for the post-leave announcement', () => {
    // inboxFirstRef used to point at the removed Link. Focus after a leave has to land somewhere
    // named, or a keyboard member restarts their tab order at <body>.
    expect(dockChat).toContain('const inboxFirstRef = useRef<HTMLInputElement>(null)')
    expect(dockChat).toContain('ref={inboxFirstRef}')
  })
})

describe('the panel cannot grow wider than the box that clips it', () => {
  it('the grid child releases the min-content floor on BOTH axes', () => {
    // THE BUG, measured against the built stylesheet: with `min-h-0` alone the panel laid out at
    // 596px inside its 442px wrapper the moment the inbox rendered a conversation list. The
    // wrapper is a grid (the reveal animates grid-template-rows 0fr → 1fr) and an implicit `auto`
    // column is floored at MIN-CONTENT, so the track grew past the wrapper's fixed width; the
    // wrapper is overflow-hidden, so the extra 154px was cut off. Living in that 154px: the close
    // button, the Rooms button, the right end of every row, and the panel's own right border.
    //
    // It looked FINE while loading — a spinner has no min-content width to push with — which is
    // exactly what made it read as a rendering glitch rather than a layout bug.
    expect(launcher).toContain('className="min-h-0 min-w-0"')
  })

  it('keeps the two axes together, since one without the other is the defect', () => {
    // A future edit that drops either half restores the bug on that axis. They are a pair.
    expect(code(launcher)).not.toContain('className="min-h-0"')
    expect(code(launcher)).not.toContain('className="min-w-0"')
  })

  it('the wrapper still clips, which is what makes the overflow invisible rather than ugly', () => {
    // Stated so the fix above is understood as "stop overflowing", not "start showing the
    // overflow". The clip is correct and required by the reveal.
    expect(launcher).toContain("'grid overflow-hidden transition-[grid-template-rows]")
  })
})
