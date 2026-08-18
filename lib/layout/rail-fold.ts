// ── THE RAIL FOLD LADDER — one three-position instruction, shared by both rails ───────────
//
// DAWN's law (design_handoff/dawn/readme.md § "Rails"):
//
//   "Both rails are tracks of one grid… A folded rail is a VISIBLE STRIP, never a missing
//    track. Each side runs a three-position ladder: Auto follows the room, Open and Strip are
//    standing instructions honoured until the window is too narrow."
//
// What production had instead, and what this file replaces:
//
//   • The LEFT rail could not fold on desktop at all. `NavLinkList` has carried a working
//     `compact` (icon-strip) path for a long time and nothing ever passed it — a dead path.
//   • The RIGHT rail's fold lived in a `useState` keyed on `pathname`, so the member's choice
//     was thrown away on every navigation. A standing instruction that forgets itself the
//     moment you click a link is not a standing instruction.
//
// ── The three positions ───────────────────────────────────────────────────────────────────
//
//   auto   Follow the room. The ROUTE decides: a builder surface arrives folded ("folding
//          gives the space to the canvas, which is why the editors arrive folded"), every
//          other surface arrives open ("both rails are primarily open").
//   open   A standing instruction: keep this rail open, on every route, across reloads.
//   strip  A standing instruction: keep this rail folded to its icon strip.
//
// ── Where "the window is too narrow" is enforced ──────────────────────────────────────────
//
// NOT here, deliberately. The narrow-window yield is a RESPONSIVE rule, and the shell already
// owns it in CSS: the left rail is `hidden md:flex` (below it the menu leaves the layout and
// arrives as the overlay drawer) and the right rail is `hidden lg:flex`. Those rules win over
// any stored position without this module knowing the viewport — which matters, because a
// viewport measurement is only available on the CLIENT, and folding the rail on a value the
// server could not know is exactly how you ship a layout flash. So: the position decides the
// fold, the media query decides whether there is a rail to fold at all.
//
// (RULED 2026-08-11, DAWN's answer to BRIEF-07 Q3: THE NUMBER IS 768, and DAWN's 1000 is
// re-scoped rather than overruled, because the two were never measuring the same thing.
// DAWN does not run one line either — `ui_kits/screens/frame.jsx` runs four: overlayMenu at
// w < 1000, autoLeft at 1180, forceRightStrip at 1100, autoRight at 1400. Its readme compresses
// those to "under 1000px the menu leaves the layout", which is true of DAWN's MENU MODE and not
// of its shell.
//   1000 is a MENU-MODE line. DAWN can overlay there because its TopBar's nav toggle is always
//        on screen, so the overlay always has an opener.
//   768  is this repo's INPUT-MODE line. Below it the shell becomes touch chrome: tab bar in,
//        rail out, drawer in. The drawer's ONLY opener is the tab bar, and the tab bar is
//        md:hidden — so moving the rail to 1000 leaves 768-999 with no rail, no tab bar, and
//        therefore no way to open the menu at all. The "contained fix" is not contained.
// So `--breakpoint-md` is NOT redefined and `--breakpoint-rail` is NOT added. Two further
// reasons, both measurable: `rg -oE '\b(md|lg):' components app lib` is ~870 sites, three orders
// of magnitude past the five it would fix; and `--breakpoint-rail: 62.5rem` would land at 1000
// CSS px, because a MEDIA QUERY resolves rem against 16px, while every rem in the layout it
// governs renders at this app's 17px root. Two unit bases in one decision, permanently.
// DAWN's 1180 / 1400 / 1100 are not breakpoints at all: they are AUTO-FOLD thresholds, which
// move a rail's position on this ladder rather than removing it from the layout. `autoStrip`
// below is keyed on the ROUTE, so "Auto follows the room" is the half not built — and it is not
// a breakpoint edit either, for the same server-cannot-know-the-viewport reason stated above.)

/** One side's position on the ladder. */
export type RailFold = 'auto' | 'open' | 'strip'

/** Which rail. The left rail is the menu; the right rail is the status/Vault rail. */
export type RailSide = 'left' | 'right'

/** How a resolved rail actually renders. There is no third value: a folded rail is a visible
 *  strip, never a missing track. */
export type RailState = 'open' | 'strip'

/** Both sides' standing instructions. */
export type RailFolds = Record<RailSide, RailFold>

/** Nobody has said anything yet, so both sides follow the room. */
export const DEFAULT_RAIL_FOLDS: RailFolds = { left: 'auto', right: 'auto' }

/** localStorage key. The theme (`freq-theme`) established the `freq-*` namespace + the
 *  read-on-the-client convention this follows. */
export const RAIL_FOLD_STORAGE_KEY = 'freq-rail-fold'

/** Cookie mirror of the same value, written alongside localStorage.
 *
 *  WHY BOTH. localStorage is the client's source of truth, but a rail fold is MARKUP (an icon
 *  strip is a different tree from an open rail), not a CSS class like the theme — so a
 *  pre-paint inline script CANNOT fix it the way `themeScript` fixes dark mode: the server has
 *  already rendered the open rail into the HTML by then. The only way to paint a persisted fold
 *  on the FIRST frame is for the server to know it, and a cookie is the one client-writable
 *  store the server can read. `readRailFoldCookie` is the reader; the shell takes the result as
 *  its `railFold` prop. */
export const RAIL_FOLD_COOKIE = 'freq-rail-fold'

/** A year. The fold is a preference, not a session. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const POSITIONS: readonly RailFold[] = ['auto', 'open', 'strip']

function isRailFold(value: unknown): value is RailFold {
  return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value)
}

/** One position, or 'auto' for anything unrecognised. Fail-safe by design: an unknown stored
 *  value must never be able to hide a rail. */
export function parseRailFold(value: unknown): RailFold {
  return isRailFold(value) ? value : 'auto'
}

/**
 * Resolve a stored position into how the rail renders.
 *
 * `autoStrip` is what the ROUTE wants when nobody has given a standing instruction — the shell
 * passes `railStartsCollapsed(pathname)`, so a builder surface arrives folded and everything
 * else arrives open. A standing 'open' / 'strip' overrides it; that is the whole point of a
 * standing instruction.
 */
export function resolveRailFold(position: RailFold, autoStrip: boolean): RailState {
  if (position === 'auto') return autoStrip ? 'strip' : 'open'
  return position
}

/**
 * What one press of the rail's fold tick does.
 *
 * The control is ONE quiet mark on the corner of the rail's tab, so it cannot be a three-way
 * switch — but it still has to be able to reach all three positions, and it must never strand a
 * member in a standing instruction they cannot tell apart from Auto.
 *
 * The rule: press = "do the opposite of what I see". If Auto would already give that, hand
 * control BACK to Auto rather than pinning a redundant standing instruction.
 *
 *   Normal route (autoStrip false):  auto/open → strip → auto → …
 *   Builder route (autoStrip true):  auto/strip → open → auto → …
 *
 * So on a normal route a member who folds the menu gets a standing 'strip' that survives
 * navigation and reload, and unfolding hands the rail back to the room. On a builder route,
 * unfolding is the standing instruction — which is exactly the case production could not
 * express at all, because its per-path state forgot the choice on the next click.
 */
export function nextRailFold(position: RailFold, autoStrip: boolean): RailFold {
  const showing = resolveRailFold(position, autoStrip)
  const wanted: RailState = showing === 'open' ? 'strip' : 'open'
  return resolveRailFold('auto', autoStrip) === wanted ? 'auto' : wanted
}

/** Both sides, from a stored JSON blob. Any shape we don't recognise resolves to Auto, so a
 *  corrupt value can only ever cost the member their preference — never their menu. */
export function parseRailFolds(raw: string | null | undefined): RailFolds {
  if (!raw) return { ...DEFAULT_RAIL_FOLDS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_RAIL_FOLDS }
    const record = parsed as Record<string, unknown>
    return { left: parseRailFold(record.left), right: parseRailFold(record.right) }
  } catch {
    return { ...DEFAULT_RAIL_FOLDS }
  }
}

/** The stored spelling. One JSON object for both sides, so the two can never half-write. */
export function serializeRailFolds(folds: RailFolds): string {
  return JSON.stringify({ left: folds.left, right: folds.right })
}

/**
 * Read the fold out of a cookie value (the SERVER's half of the no-flash path).
 *
 * Server usage is one line in the app's authed layout:
 *
 *     const jar = await cookies()
 *     <AppShell railFold={readRailFoldCookie(jar.get(RAIL_FOLD_COOKIE)?.value)} … />
 *
 * Same fail-safe as everything else here: no cookie, or a cookie we cannot read, means Auto.
 */
export function readRailFoldCookie(value: string | null | undefined): RailFolds {
  if (!value) return { ...DEFAULT_RAIL_FOLDS }
  try {
    return parseRailFolds(decodeURIComponent(value))
  } catch {
    return parseRailFolds(value)
  }
}

/** The cookie mirror as the CLIENT sees it, or null when there is no readable cookie.
 *
 *  This exists so the two halves of the store cannot disagree — see `readStoredRailFolds`. */
function readCookieRailFolds(): RailFolds | null {
  if (typeof document === 'undefined') return null
  try {
    const prefix = `${RAIL_FOLD_COOKIE}=`
    const hit = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
    return hit ? readRailFoldCookie(hit.slice(prefix.length)) : null
  } catch {
    return null
  }
}

/** The client's stored instruction, or Auto. Safe to call in any environment: no window, no
 *  localStorage (private mode, blocked storage) and a throwing getter all fall through — first to
 *  the cookie, then to Auto.
 *
 *  🔴 WHY THE COOKIE IS A FALLBACK HERE and not only on the server. `writeStoredRailFolds` is
 *  explicitly built to survive blocked localStorage ("the cookie below may still land"), and the
 *  cookie IS the value the server just painted the first frame from. If this reader ignored it,
 *  that fail-safe would fire and then immediately be undone: the server renders the folded strip,
 *  hydration renders it (the server snapshot is the cookie), and the very next client snapshot
 *  reads blocked storage, answers Auto, and shoves the rail back open one frame after paint. The
 *  member would watch their standing instruction be honoured and then revoked. localStorage stays
 *  the source of truth whenever it has anything to say; the cookie only answers when it does not. */
export function readStoredRailFolds(): RailFolds {
  if (typeof window === 'undefined') return { ...DEFAULT_RAIL_FOLDS }
  try {
    const raw = window.localStorage.getItem(RAIL_FOLD_STORAGE_KEY)
    if (raw) return parseRailFolds(raw)
  } catch {
    /* storage blocked — fall through to the cookie, which is what the server already read */
  }
  return readCookieRailFolds() ?? { ...DEFAULT_RAIL_FOLDS }
}

/** Persist both sides: localStorage for the client, the cookie mirror so the SERVER can paint
 *  the fold on the first frame. Never throws — a member with storage disabled just loses the
 *  standing instruction at the end of the session, which is strictly better than a crash in the
 *  shell's click handler. */
export function writeStoredRailFolds(folds: RailFolds): void {
  if (typeof window === 'undefined') return
  const value = serializeRailFolds(folds)
  try {
    window.localStorage.setItem(RAIL_FOLD_STORAGE_KEY, value)
  } catch {
    /* storage blocked — the cookie below may still land */
  }
  try {
    document.cookie = `${RAIL_FOLD_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  } catch {
    /* no cookie access — the fold still holds for this session via React state */
  }
}

// ── THE STORE ─────────────────────────────────────────────────────────────────────────────
//
// localStorage is an EXTERNAL system, so the shell subscribes to it with `useSyncExternalStore`
// rather than copying it into `useState` inside an effect. Two reasons, and the second is the
// real one:
//
//   • `react-hooks/set-state-in-effect` fails the build on the copy-into-state version, and it
//     is right to: that pattern is a cascading render on every mount.
//   • useSyncExternalStore has a SERVER snapshot as a first-class concept, which is exactly the
//     shape of this problem — the server renders the seed (the cookie, or Auto), the client then
//     renders what is actually stored. One API, both halves, no effect.
//
// The snapshot is cached because useSyncExternalStore compares snapshots by identity: reading
// localStorage fresh on every call would return a new object every render and spin forever.

let snapshot: RailFolds | null = null
const listeners = new Set<() => void>()

function onStorageChange(event: StorageEvent) {
  // key === null is a whole-store clear.
  if (event.key !== null && event.key !== RAIL_FOLD_STORAGE_KEY) return
  snapshot = null
  for (const listener of listeners) listener()
}

/** Subscribe to the stored instruction. Also picks up a change made in ANOTHER TAB — the member
 *  folded the menu over there, and this window should not disagree with itself. */
export function subscribeRailFolds(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageChange)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageChange)
    }
  }
}

/** The client snapshot — stable by identity until something actually changes it. */
export function railFoldsSnapshot(): RailFolds {
  if (!snapshot) snapshot = readStoredRailFolds()
  return snapshot
}

/** Set both sides, persist, and tell every subscriber. The one write path. */
export function setRailFolds(next: RailFolds): void {
  snapshot = next
  writeStoredRailFolds(next)
  for (const listener of listeners) listener()
}

/** Test seam: drop the cached snapshot so the next read hits storage again. */
export function resetRailFoldsCache(): void {
  snapshot = null
}

/** The control's accessible name + tooltip. Names the SIDE and what the press will do, because
 *  "Collapse" alone does not say which of the two rails is about to move. */
export function railFoldControlLabel(side: RailSide, showing: RailState): string {
  const what = side === 'left' ? 'the menu' : 'the rail'
  return showing === 'open' ? `Fold ${what} to a strip` : `Unfold ${what}`
}

/**
 * DOM id of one rail's fold TICK — the micro mark on the corner of that rail's bottom tab (owner,
 * 2026-08-05; it replaced the mid-edge handle, which itself replaced a glyph at the rail's foot).
 * The id names the SIDE, not the position: each rail has exactly one tick in the document at a
 * time, wherever that rail's tab currently is.
 *
 * It exists for one caller, and only because that caller cannot hold a ref to it. DockBar renders
 * the RIGHT rail's tick but from md, while the rail column only exists from lg — and the LEFT
 * tick lives in the shell's own tree. When folding takes the Vault segment, and whatever focus was
 * sitting in it, off the screen, the bar hands focus here rather than letting the browser drop a
 * keyboard member onto <body> and restart their tab order — the same duty `close()` performs in
 * components/vera/vera-launcher.tsx.
 *
 * The id is on the BUTTON itself. It used to be on a wrapper box, because back then the wrapper
 * was the positioned strip and the button was inside it; the tick IS the positioned element, so
 * the lookup no longer has to go hunting for a child to focus.
 */
export function railHandleId(side: RailSide): string {
  return `fq-rail-handle-${side}`
}
