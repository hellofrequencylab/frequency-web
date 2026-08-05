import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DOCK_HEAD_H_CLASS,
  DOCK_SEGMENT_OPEN_EVENT,
  RAIL_END_OPENS,
  announceDockDismissed,
  announceDockSegmentOpen,
  dockDismissalDue,
  getDockPanelOwner,
  getServerDockGeometry,
  getServerDockPanelOwner,
  onOtherDockSegmentOpen,
  railEndOpenDue,
  setDockPanelOpen,
  subscribeDockPanel,
  type DockAnnouncement,
} from './dock-bar'

// ── THE FOLD TAKES THE VAULT, NOT THE BAR (owner, 2026-08-05 — AMENDS ADR-946) ─────────────
//
// 🔴 THE ORIGINAL BUG. DockBar is `fixed bottom-0 right-3 w-72`, and `w-72` is the OPEN right rail
// (288px). The rail folds to a 56px strip on ANY route (lib/layout/rail-fold.ts), and the bar had
// no input for it — so at strip width it went on spanning 288px and overhung the content column by
// ~232px. ADR-946 answered that by hiding the whole bar.
//
// 🔴 THE AMENDMENT. The owner has now seen that live and wants the CHAT TAB specifically to
// survive the fold. So the two segments stop sharing a fate: the Vault segment goes with the rail
// (`lg:hidden`), the chat tab stays, and the bar shrinks to fit it (`lg:w-auto`) so the overhang
// the hide was for is fixed by SIZING instead. Messages is a conversation somebody may be waiting
// on; a score is something you can look at later.
//
// Four things have to hold for that to be a fix rather than a new defect, and each is pinned
// below by a test that was watched go red with the defect put back:
//
//   1. Everything the fold takes, it takes at lg and up ONLY. The fold is a standing per-member
//      instruction; the right rail is `hidden lg:flex`. A member who folded on a desktop and
//      opened a tablet has no rail on screen and therefore no fold tick — taking anything there
//      would leave nothing anywhere to bring it back.
//   2. The dismissal now reads the VAULT's box, not the bar's. The bar is never zero-width at lg+
//      any more, so a bar-width test would report "no fold happened" on every fold and leave an
//      open Vault panel hanging over a column that no longer exists.
//   3. Dismissing does not strand an open panel. Both segments close through their OWN close(), on
//      the channel the bar already had, so focus return and the collapse timer run exactly once.
//   4. The rail-end sentinel survives. It lives inside the OPEN rail's subtree, so every fold
//      destroys the node the ride-up observer was watching.

const dock = readFileSync('components/layout/dock-bar.tsx', 'utf8')
const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
const launcher = readFileSync('components/vera/vera-launcher.tsx', 'utf8')
const vaultSegment = readFileSync('components/sidebar/game-stats-dock.tsx', 'utf8')

// ── The announcement channel, run for real ─────────────────────────────────────────────────
//
// vitest runs in the `node` environment, so `window` is the one thing these functions need and
// the only thing stubbed. An EventTarget IS the whole of the contract they use (addEventListener /
// removeEventListener / dispatchEvent), so this exercises the real dispatch, the real filter and
// the real unsubscribe — not a re-implementation of them.

// Typed as a bare bag rather than `typeof globalThis & …`: the DOM lib declares `window` as a
// non-optional `Window & typeof globalThis`, so intersecting with it makes the stub unassignable
// AND makes `delete` illegal. The only contract under test is EventTarget's.
const host = globalThis as unknown as { window?: EventTarget }
const hadWindow = 'window' in host
const realWindow = host.window

beforeAll(() => {
  host.window = new EventTarget()
})
afterAll(() => {
  if (hadWindow) host.window = realWindow
  else delete host.window
})

describe('folding the rail closes whatever the bar had open', () => {
  let vault = 0
  let chat = 0
  let offVault = () => {}
  let offChat = () => {}

  beforeEach(() => {
    offVault()
    offChat()
    vault = 0
    chat = 0
    // Both segments open at once — the state this whole channel exists for. Each subscribes the
    // way its own component does: only while ITS panel is open, closing through its own setter.
    offVault = onOtherDockSegmentOpen('vault', () => { vault += 1 })
    offChat = onOtherDockSegmentOpen('chat', () => { chat += 1 })
  })

  it('a dismissal closes BOTH segments, exactly once each', () => {
    announceDockDismissed()
    expect([vault, chat]).toEqual([1, 1])
  })

  it('rides the SAME event as an open, so neither segment needs a second rule', () => {
    const seen: (DockAnnouncement | undefined)[] = []
    const spy = (e: Event) =>
      seen.push((e as CustomEvent<{ segment?: DockAnnouncement }>).detail?.segment)
    host.window!.addEventListener(DOCK_SEGMENT_OPEN_EVENT, spy)
    announceDockSegmentOpen('chat')
    announceDockDismissed()
    host.window!.removeEventListener(DOCK_SEGMENT_OPEN_EVENT, spy)
    // One channel, one shape of message. A separate `fq-dock-dismissed` event would be a second
    // place for the close paths to drift apart, and this is what would notice.
    expect(seen).toEqual(['chat', 'dismissed'])
  })

  it('still lets a segment ignore its OWN announcement', () => {
    // The property that makes opening safe: announcing must never close what just opened. The
    // filter is "anyone who is not me", which is also what lets 'dismissed' through to both.
    announceDockSegmentOpen('vault')
    expect([vault, chat]).toEqual([0, 1])
  })

  it('never asks a closed segment to close — the listener only exists while it is open', () => {
    offVault()
    announceDockDismissed()
    expect([vault, chat]).toEqual([0, 1])
    offVault = () => {}
  })
})

describe('dockDismissalDue — when a fold actually owes a dismissal', () => {
  it('fires on the fold that hides the VAULT segment', () => {
    // lg+: the class lands, the Vault's box goes to zero, the panels have to go.
    expect(dockDismissalDue(false, true, 0)).toBe(true)
  })

  it('🔴 does NOT fire in the md–lg band, where the Vault is still on screen', () => {
    // THE TABLET TRAP. Below lg there is no right rail, so there is no fold tick either — a
    // standing 'strip' set on a desktop must not take the Vault away here. It keeps its box,
    // nothing was dismissed, and announcing would slam shut a panel the member can still see.
    expect(dockDismissalDue(false, true, 288)).toBe(false)
  })

  it('does not fire on a mount that is ALREADY folded', () => {
    // Nothing is open on a fresh page, and a `?chat=…` deep link opens the panel on the same
    // tick (vera-launcher reads the URL in its own mount effect). Announcing here would close it.
    expect(dockDismissalDue(true, true, 0)).toBe(false)
  })

  it('does not fire on unfolding, in either band', () => {
    expect(dockDismissalDue(true, false, 288)).toBe(false)
    expect(dockDismissalDue(true, false, 0)).toBe(false)
  })

  it('does not fire when nothing changed', () => {
    expect(dockDismissalDue(false, false, 288)).toBe(false)
  })
})

describe('the fold takes the VAULT and leaves the chat tab (the ADR-946 amendment)', () => {
  it('🔴 the chat tab is NOT hidden by the fold any more', () => {
    // The one-line statement of the amendment, asserted on the BAR's own class string — the
    // Vault segment one line down legitimately still carries `lg:hidden`, so a file-wide
    // "must not contain" would be answering a different question.
    expect(dock).not.toMatch(/md:flex print:hidden\$\{\s*folded \? ' lg:hidden'/)
  })

  it('the bar SHRINKS instead, so the ~232px overhang is still gone', () => {
    // Hiding was never the point — the overhang was. `lg:w-auto` collapses the bar onto the one
    // segment left in it, which is a ~48px corner tab rather than a 288px bar under a 56px strip.
    expect(dock).toMatch(/md:flex print:hidden\$\{\s*folded \? ' lg:w-auto' : ''\s*\}/)
  })

  it('the Vault segment is the half that yields, and only at lg+', () => {
    expect(dock).toContain("folded ? ' lg:hidden' : ''}`}\n        >\n          {vault}")
  })

  it('🔴 never returns null on the fold — that is the md–lg trap', () => {
    // Unmounting reads as the obvious implementation and is the wrong one: it would take the
    // Vault and Messages off a tablet, where the fold that caused it is not even visible.
    expect(dock).not.toMatch(/if\s*\(\s*folded\s*\)\s*return null/)
  })

  it('the dismissal reads the VAULT segment, which is the thing that actually left', () => {
    // 🔴 THE DEFECT THE AMENDMENT INTRODUCES IF THIS IS MISSED. `dockDismissalDue` used to take
    // the BAR's width, because the bar going to zero and the Vault going away were the same fact.
    // They are not any more: the bar survives every fold, so a bar-width reading is `false`
    // forever and an open Vault panel is left hanging over a column that has gone.
    expect(dock).toContain('const vaultBox = vaultRef.current')
    expect(dock).toContain('vaultBox?.getBoundingClientRect().width ?? 0')
    expect(dock).toContain('const hadFocus = !!vaultBox && vaultBox.contains(document.activeElement)')
  })

  it('the clip moved off the bar so the fold TICK is not sliced in half', () => {
    // `overflow-hidden` on the bar clipped every descendant, and the tick is deliberately centred
    // ON the bar's top-left corner. It now belongs to the segment row, which is the thing that
    // actually needs clipping (the chat button's square corner).
    expect(dock).toContain('flex flex-1 items-stretch overflow-hidden rounded-tl-card rounded-tr-control')
    expect(dock).not.toMatch(/fixed bottom-0[^\n]*overflow-hidden/)
  })

  it('takes the fold as an INPUT, from the shell that already derives it', () => {
    expect(dock).toContain('folded: boolean')
    // No second source of truth: the bar must not read the fold store itself.
    expect(dock).not.toContain('resolveRailFold')
    expect(dock).not.toContain('railFoldsSnapshot')
  })

  it('and the fold TICK is optional, so a bar with no ladder draws no control', () => {
    // /admin's info rail mounts this same bar and cannot be folded. A defaulted no-op handler
    // would paint a control that does nothing; omission says it out loud.
    expect(dock).toContain('onFold?: () => void')
    expect(dock).toContain('{onFold && (')
  })

  it('and it only appears where there IS a right rail to fold', () => {
    // 🔴 The bar renders from md; the right rail is `hidden lg:flex`. A tick in the md–lg band
    // would offer to fold a rail that is not on screen. It works because Tailwind emits `.flex`
    // (the tick's own base display) BEFORE `.hidden`, and both before the `lg` block — so `hidden`
    // wins below lg and `lg:flex` wins above it. Verified against the compiled sheet.
    expect(dock).toContain('className="hidden lg:flex"')
  })
})

describe('the rail-end sentinel survives the fold', () => {
  it('re-resolves on every fold, because the fold destroys the node it was watching', () => {
    // `RAIL_END_SENTINEL_ID` lives inside the OPEN rail's <aside>. Folding replaces that whole
    // subtree, so an observer held across the fold is attached to a detached node and can never
    // fire again — and unfolding builds a new node it knows nothing about. Without `folded` in
    // the deps the ride-up silently stops working after the first fold.
    expect(dock).toContain('}, [measure, folded])')
  })

  it('never constructs an observer over a missing sentinel', () => {
    // While folded there is no sentinel at all: `new ResizeObserver(...).observe(null)` throws,
    // it does not no-op. The guard is the reason this is safe, so it is asserted verbatim.
    expect(dock).toContain('sentinel?.parentElement ? new ResizeObserver(schedule) : null')
    expect(dock).toContain('if (ro && sentinel?.parentElement) ro.observe(sentinel.parentElement)')
  })

  it('the measurement itself still refuses to run without a bar node', () => {
    expect(dock).toContain('const bar = barRef.current\n    if (!bar) return')
  })
})

describe('focus is handed over, not dropped', () => {
  it('reads focus in a LAYOUT effect, while the node is still focused', () => {
    // Once the segment is display:none the browser has already blurred whatever was inside it and
    // document.activeElement is <body> — the very drop this prevents, and by then unreadable.
    expect(dock).toContain('useIsoLayoutEffect(')
    expect(dock).toContain('const hadFocus = !!vaultBox && vaultBox.contains(document.activeElement)')
  })

  it('moves focus only when it was inside the part that LEFT', () => {
    expect(dock).toContain('if (hadFocus) {')
    // The destination is the fold tick on this bar's own corner: the affordance that caused this,
    // and the way back. Looked up by id because the launcher and the shell both need it and
    // neither can hold a ref across the portal — and the id is now on the BUTTON, so the lookup
    // does not have to go hunting for a focusable child.
    expect(dock).toContain("document.getElementById(railHandleId('right'))?.focus()")
    // A member focused on the chat tab keeps their place: it survives the fold, so nothing is owed.
    expect(dock).not.toContain('bar.contains(document.activeElement)')
  })

  it('closes the panels through THEIR close(), never by reaching into them', () => {
    expect(dock).toContain('announceDockDismissed()')
    expect(dock).not.toContain('setOpen')
    expect(dock).not.toContain('panelRef')
  })
})

describe('both segments still close through the one path they already had', () => {
  it('the Vault segment', () => {
    expect(vaultSegment).toContain("onOtherDockSegmentOpen('vault', () => setOpen(false))")
  })

  it('the chat panel — through `close`, which owns focus return and the collapse timer', () => {
    expect(launcher).toContain("onOtherDockSegmentOpen('chat', close)")
    // Bound only WHILE OPEN. That is what makes "close me" idempotent without a guard, and it is
    // what keeps a dismissal from running close() on a panel that is already shut.
    expect(launcher).toContain('if (!open) return\n    return onOtherDockSegmentOpen')
  })
})

describe('the chat launcher reads the bar, and never the fold', () => {
  it('anchors only while there is a published bar box', () => {
    // Folded, the slot is still in the document (hidden), so the trigger keeps portalling into it
    // and no EdgePill comes back — the fold is meant to cost one-tap Messages. But a chat opened
    // by ⌘K / open-chat / a ?chat= link must not anchor to a bar that is not on screen.
    expect(launcher).toContain('const anchor = slot && geometry.bar ? measured : null')
  })

  it('has no second source of truth for the fold', () => {
    expect(launcher).not.toContain('rail-fold')
    expect(launcher).not.toContain('railFold')
  })
})

describe('the operator bar answers the same question', () => {
  it('/admin passes the prop rather than inheriting a default', () => {
    // A new call site has to state its fold. The operator info rail is not on the ladder — no
    // RailFoldControl, so nothing can fold it — and `folded` is required so that is said out loud.
    const adminLayout = readFileSync('app/(main)/admin/layout.tsx', 'utf8')
    expect(adminLayout).toContain('<DockBar folded={false}')
  })
})

describe('the sentinel-driven store still says "no bar" honestly', () => {
  it('the server snapshot anchors nothing', () => {
    const server = getServerDockGeometry()
    expect(server.bar).toBeNull()
    expect(server.railTopAboveBottom).toBeNull()
    expect(server.atRailEnd).toBe(false)
  })

})

// ── The rail's end OPENS the Vault (owner, 2026-08-05) ─────────────────────────────────────

describe('railEndOpenDue — the rising edge', () => {
  it('opens on arrival at the rail\'s end', () => {
    expect(railEndOpenDue(false, true)).toBe(true)
  })

  it("🔴 does NOT re-open while you are still sitting there", () => {
    // THE DEFECT THIS EXISTS FOR. `atRailEnd` stays true for as long as you are at the end of the
    // rail, and the geometry store notifies on every scroll frame that changes anything — so an
    // unguarded `if (atRailEnd) open()` re-opens the panel on the next scroll pixel after the
    // member closes it. That is why the auto-open branch sat wired-but-inert instead of shipping.
    expect(railEndOpenDue(true, true)).toBe(false)
  })

  it('and re-arms once you leave', () => {
    expect(railEndOpenDue(true, false)).toBe(false)
    expect(railEndOpenDue(false, true)).toBe(true)
  })
})

describe('exactly ONE segment claims the rail end', () => {
  it('and it is the Vault', () => {
    // "Scroll-to-bottom OR click opens the Vault."
    expect(RAIL_END_OPENS).toBe('vault')
  })

  it('the Vault subscribes to it, through the announcing open path', () => {
    expect(vaultSegment).toContain("if (RAIL_END_OPENS !== 'vault') return")
    expect(vaultSegment).toContain('if (due) openVault()')
  })

  it('the chat launcher yields it, rather than keeping a second constant', () => {
    // Two segments claiming the rail's end would each announce on arrival and close the other,
    // and which survived would come down to subscription order. One owner, one place.
    expect(launcher).toContain("if (RAIL_END_OPENS !== 'chat') return")
    expect(launcher).not.toContain('RAIL_END_ACTIVATION')
  })

  it('both readers use the SAME rising-edge rule, not a hand-rolled one each', () => {
    expect(vaultSegment).toContain('railEndOpenDue(wasAtRailEnd.current, atEnd)')
    expect(launcher).toContain('railEndOpenDue(wasAtRailEnd.current, atEnd)')
  })
})

describe('the Vault has ONE way in, so every open announces (items 6 + 7)', () => {
  it('the auto-open and the click go through the same function', () => {
    // 🔴 THE DEFECT. The announcement used to be written inline in the head button's onClick.
    // With a second opening path (the rail's end) that shape leaves one path announcing and one
    // not — and a scroll to the bottom would open the Vault ON TOP of an open Messages panel.
    expect(vaultSegment).toContain('function openVault() {')
    expect(vaultSegment).toContain("announceDockSegmentOpen('vault')")
    // Exactly one announcement site in the file: the funnel.
    expect(vaultSegment.match(/announceDockSegmentOpen\('vault'\)/g)?.length).toBe(1)
    expect(vaultSegment).toContain('onClick={() => (open ? setOpen(false) : openVault())}')
    // 🔴 AND NOTHING ELSE OPENS IT. `setOpen(true)` written anywhere but inside the funnel is an
    // open that does not announce — which is the failure mode in the owner's own words: scrolling
    // to the bottom would open the Vault on top of an open Messages panel. The funnel's own line
    // is the ONE allowed occurrence, so the count is what pins this rather than a spot check.
    expect(vaultSegment.match(/setOpen\(true\)/g)?.length).toBe(1)
    expect(vaultSegment).toContain('function openVault() {\n    setOpen(true)')
  })

  it('and closing still runs through the shared setter, not a second path', () => {
    expect(vaultSegment).toContain("onOtherDockSegmentOpen('vault', () => setOpen(false))")
  })
})

// ── "When the Vault is open, the message tab stays closed" (owner, 2026-08-05) ──────────────

describe('the panel-owner store — the standing fact the open EVENT cannot give', () => {
  beforeEach(() => {
    setDockPanelOpen('vault', false)
    setDockPanelOpen('chat', false)
  })

  it('reports who owns the open panel', () => {
    expect(getDockPanelOwner()).toBeNull()
    setDockPanelOpen('vault', true)
    expect(getDockPanelOwner()).toBe('vault')
  })

  it('🔴 a segment can only clear its OWN ownership', () => {
    // THE DEFECT A NAIVE `open ? segment : null` SHIPS. The chat panel unmounts (route change,
    // the collapse timer) and reports closed while the Vault is up — and a null-on-close would
    // erase the Vault's ownership, so the chat tab would light back up beside an open Vault.
    setDockPanelOpen('vault', true)
    setDockPanelOpen('chat', false)
    expect(getDockPanelOwner()).toBe('vault')
  })

  it('tells subscribers, and only when something actually changed', () => {
    let told = 0
    const off = subscribeDockPanel(() => { told += 1 })
    setDockPanelOpen('vault', true)
    setDockPanelOpen('vault', true) // idempotent: no second notification
    expect(told).toBe(1)
    setDockPanelOpen('vault', false)
    expect(told).toBe(2)
    off()
    setDockPanelOpen('chat', true)
    expect(told).toBe(2)
  })

  it('the server owns no panel, so the first client render agrees with the HTML', () => {
    expect(getServerDockPanelOwner()).toBeNull()
  })
})

describe('the chat tab YIELDS to an open Vault rather than hiding or going inert', () => {
  it('withholds the active fill while the Vault owns the panel', () => {
    // 🔴 WHAT THE OWNER SAW. `unread > 0` lights this tab independently of whether its own panel
    // is open, so an unread put it in the full amber fill NEXT TO an open Vault panel: two lit
    // things, one of them not open. The `!yielding &&` is the whole fix.
    expect(launcher).toContain('!yielding && (unread > 0 || open) ? \'primary\' : \'primarySoft\'')
    expect(launcher).toContain("yielding={panelOwner === 'vault'}")
  })

  it('but stays MOUNTED and PRESSABLE — yielding is tone, not removal', () => {
    // Hiding it would strand the member's one-tap route out of the Vault into Messages, and
    // would shrink the bar under a panel that is being read. Nothing gates the trigger's render
    // or its handler on `yielding`.
    expect(launcher).not.toMatch(/yielding\s*&&\s*[\s\S]{0,40}return null/)
    expect(launcher).not.toContain('disabled={yielding}')
    expect(launcher).toContain('onClick={onOpen}')
  })

  it('both segments publish their own state, so neither latches', () => {
    expect(vaultSegment).toContain("setDockPanelOpen('vault', open)")
    expect(vaultSegment).toContain("return () => setDockPanelOpen('vault', false)")
    expect(launcher).toContain("setDockPanelOpen('chat', open)")
    expect(launcher).toContain("return () => setDockPanelOpen('chat', false)")
  })
})

describe('the chat panel is sized to its CONTENT, and grows left out of the tab', () => {
  it('🔴 no longer takes the bar\'s width', () => {
    // THE BUG, off a live screenshot: the panel took `{left: bar.left, width: bar.width}`, and at
    // lg+ the bar spans the rail — so a message inbox was 288px wide and every preview was cut
    // mid-word ("Heyooo! I'm planning on heading out to Ro…"). The panel was sized to the door it
    // comes through instead of to the thing it holds.
    //
    // Matched against the CODE, not the file: the comment above `panelBox` quotes the old
    // expression on purpose, because a reader has to know what was wrong to understand the fix.
    // A raw "must not contain" would fail on its own documentation.
    const code = launcher.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('width: bar.width')
    expect(code).not.toContain('left: bar.left')
    // And the `bar` binding itself is gone: the only thing it still did was gate the anchor, and
    // `anchor` already carries that gate. A live binding with one dead use is where the old
    // sizing creeps back in.
    expect(code).not.toContain('const bar = slot ? geometry.bar : null')
  })

  it('pins the RIGHT edge to the tab and takes its width from a stated measurement', () => {
    // Right edge on the tab keeps the reveal reading as "out from behind this tab"; the width is
    // derived in PANEL_WIDTH's comment from the preview line it has to fit, not rounded to a
    // number that looked nice.
    expect(launcher).toContain('{ right: anchor.right, bottom: anchor.bottom, left: \'auto\' as const, width: PANEL_WIDTH }')
    expect(launcher).toContain("const PANEL_WIDTH = 'min(26rem, calc(100vw - 5rem))'")
  })

  it('leaves the phone sheet alone', () => {
    // `panelBox` only exists when there is a bar to anchor to, which is md and up — below that
    // the sheet keeps its own class box, including the `md:max-h-none` that releases the cap
    // ABOVE md and must not start applying below it.
    expect(launcher).toContain('const panelBox = anchor')
    expect(launcher).toContain('fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md')
    // The exact class run, not a bare `md:max-h-none`: the comment above it names the token, so a
    // loose search would be satisfied by the prose after the class had been deleted.
    expect(launcher).toContain('md:h-[35rem] md:max-h-none md:pb-2')
  })
})

describe('both bottom tabs are one height (owner: "both tabs the same height")', () => {
  it('is a shared class, not a claim in a comment', () => {
    // 🔴 They were 72px (left) and 48px (right) under a comment asserting they matched.
    expect(DOCK_HEAD_H_CLASS).toBe('h-11')
    expect(vaultSegment).toContain('${DOCK_HEAD_H_CLASS}')
    expect(shell).toContain('${DOCK_HEAD_H_CLASS}')
  })

  it('neither tab hardcodes a head height beside it', () => {
    // The Vault head was `h-10`; the identity bar was a `w-11` avatar in `py-3.5`.
    expect(vaultSegment).not.toContain('flex h-10 w-full items-center')
    expect(shell).not.toContain('flex items-center gap-2.5 px-3 py-3.5')
  })

  it('the left tab wears the right tab\'s crest, mirrored', () => {
    // Owner: "the profile box takes the same radius and styles as the right rail tab."
    expect(dock).toContain('rounded-tl-card rounded-tr-control border-x border-t border-chrome-border bg-chrome/95')
    expect(shell).toContain('rounded-tl-control rounded-tr-card border-x border-t border-chrome-border bg-chrome/95')
  })
})
