# Interaction states — the second half of every component

> **The contract.** Nine named states, a required set per component class, and one
> sanctioned motion vocabulary. A component is not finished when its rest state is
> beautiful; it is finished when every state its class requires renders on purpose.
>
> This is [UX-MATURITY-PLAN.md](UX-MATURITY-PLAN.md) Lift 8a. Companions:
> [DESIGN.md](DESIGN.md) (the look), [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) (the layout
> kit), [PRESENTATION.md](PRESENTATION.md) (the status legend used below).

Legend: ✅ present · ⚠️ partial · 🔴 missing · ➖ not required for this class.

---

## 1. The nine states

| State | What it means | How it is expressed here |
|---|---|---|
| **rest** | Nothing is happening. | Semantic tokens only. No hex, ever. |
| **hover** | A pointer is over it. Pointer-only; never the sole carrier of meaning. | `hover:` utilities on color/border/shadow. |
| **active / pressed** | The pointer or key is down. | `.press` (a 0.99 scale on `:active`), or a `active:` color step. Never a new shadow. |
| **focus-visible** | Keyboard focus is here. | The global ring in `app/globals.css` (amber for chrome, neutral for fields). Do not re-declare it unless you are overriding on purpose. |
| **loading** | A result is coming and there is nothing yet. | `Skeleton` for content shape; `aria-busy="true"` on the region; a disabled control with its label unchanged. |
| **empty** | The request succeeded and there is genuinely nothing. | `EmptyState` with the right variant. Never a blank pane, never a spinner that never resolves. |
| **error** | The thing failed, or the input is invalid. | `aria-invalid` + the danger border on fields; `EmptyState variant="error"` or `RouteError` for a surface. |
| **disabled** | Not available right now. | `disabled` attribute (never a click handler that no-ops). Reads at 50% and keeps enough contrast to be legible. |
| **optimistic-pending** | We already showed the result; the server has not confirmed it. | §4. `.dimmed`, no layout shift, revert plus a message on failure. |

**Two states that are not on the list, on purpose.** "Selected" and "current" are not
interaction states, they are data (`aria-pressed`, `aria-current`, `aria-checked`) that
happens to have a look. And "success" is not a state of a control; it is a transient
message beside one.

## 2. Required states per component class

Class is decided by **what the component does**, not by which folder it lives in.

| Class | rest | hover | pressed | focus-visible | loading | empty | error | disabled | optimistic |
|---|---|---|---|---|---|---|---|---|---|
| **Action control** (Button, IconButton, Switch — invokes something) | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ | when it writes |
| **Field** (Input, Textarea, Field, search, dropdown — accepts input) | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ |
| **Card** (EntityCard, RowCard, StatCard — a container) | ✅ | when it navigates | when it navigates | when it navigates | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Reading** (Counter, Meter, ProgressTrack, StreakMeter — renders a number) | ✅ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ |
| **State surface** (EmptyState, GateNotice, RouteError, Skeleton — *is* a state) | ✅ | ➖ | ➖ | ➖ | its own | its own | its own | ➖ | ➖ |
| **Navigation** (UnderlineTabs, SectionHeader, PageHeading) | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Overlay** (Dialog) | ✅ | ➖ | ➖ | ✅ trap + restore | ➖ | ➖ | ➖ | ➖ | ➖ |
| **Display** (badges, tips) | ✅ | tips only | ➖ | tips only | ➖ | ➖ | ➖ | ➖ | ➖ |

Reading the table:

- **An input needs error; a card does not.** A card that cannot load is an empty or error
  *surface*, and that is the caller's `EmptyState`, not a state of the card.
- **A Reading needs an empty state** because zero is a real answer. `<Counter value={0}>`
  and `<StreakMeter days={[]}>` must both render something a person can read, not a
  collapsed box or a divide-by-zero.
- **focus-visible is mostly free.** `app/globals.css` rings every `button`, `a`, `select`
  and `[tabindex="0"]`. A component only owes an explicit ring when its focusable child is
  not its visual body (`has-[:focus-visible]:ring-*`, the EntityCard pattern) or when it
  opts out. ⚠️ There are three sanctioned opt-outs today — the composer textarea, the
  brandmark link, and `.admin-search-field` — and two of them replace the ring with
  nothing but a caret. That is a Lift 3c item, recorded here so it is not lost.
- **Hover is never alone.** Anything hover communicates must also be reachable by keyboard
  and readable on a touch screen, which has no hover.

## 3. Motion vocabulary — the only sanctioned one

State transitions use these and nothing else. All are declared in `app/globals.css` and
re-tuned per feel preset and per skin, so a hardcoded `duration-200` silently opts out of
the whole system.

| Token / class | Value (DAWN default) | Use for |
|---|---|---|
| `--motion-fast` | `130ms` | hover, pressed, focus — anything the finger is still on. |
| `--motion-base` | `260ms` | the workhorse: color, border, shadow, small transforms. |
| `--motion-slow` | `700ms` | reveals, sheens, arrivals. Never a state change on a control. |
| `--ease-pop` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | an arrival that should overshoot (the cue-pop beat). |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | everything else: reveal, lift, settle. |
| `.press` | `scale(0.99)` on `:active` | **the** pressed state. Do not invent a second one. |
| `.dimmed` | `opacity: 0.72; filter: grayscale(0.5)` | receded content, and the optimistic-pending look (§4). |

Rules:

- Consume them as `duration-[var(--motion-base)]` / `ease-[var(--ease-out)]` in Tailwind,
  or `transition: … var(--motion-base) var(--ease-out)` in CSS.
- **Reduced motion is already handled** for `--motion-*` (they collapse toward `0ms`) and
  for `.press`. Any *new* keyframe animation must sit inside a `prefers-reduced-motion`
  guard or carry a written exemption — Lift 3d checks this.
- A state change never animates layout. Color, border, shadow, opacity and `transform` are
  in scope; width, height, padding and margin are not.

## 4. Optimistic UI — the convention

The repo already flips things before the server answers (Follow, reactions, practice
toggles, admin switches). This is how it is done from here.

| Rule | |
|---|---|
| **1. Flip immediately** | Set local state, then `startTransition` the server action. The label, the count and the icon all change at once. |
| **2. Pending look is `.dimmed`** | Not a spinner, not a disabled grey. The control stays legible and reads as "this is real but not settled." |
| **3. No layout shift, ever** | Pending must not add a spinner that widens the button, swap a label for a longer one, or change the row height. If the confirmed and pending states are different widths, you have the wrong pending style. |
| **4. Block the double-fire** | `disabled={isPending}` on the control while the action is in flight. Disabled here is a re-entrancy guard, not a communication. |
| **5. Failure reverts and says so** | Revert to the pre-click state **and** show a message. The message is a toast where a toast host exists, and an adjacent `aria-live="polite"` line where one does not. Silent revert is banned: the UI lied and then quietly un-lied, and the member is left thinking they mis-tapped. |
| **6. Never optimistic for money or identity** | Payments, plan changes, claims, deletes and role changes wait for the server. Optimism is for cheap, reversible, high-frequency acts. |

**Reference implementation:** `components/spaces/follow-space-button.tsx` — flip, transition,
revert on `isError`. ⚠️ It is missing rule 5's message and rule 2's `.dimmed`; it is the
shape to copy, not yet the finished pattern.

**⚠️ Dependency, flagged not invented.** There is no global toast host today. The two
toasts that exist (`components/zap-toast.tsx`, `components/achievement-toast.tsx`) are
event-specific `CustomEvent` listeners, not a generic surface. Until a host exists, rule 5
is satisfied by an adjacent `aria-live="polite"` line. Building the host is a Lift 8c
prerequisite, not something this contract can assume.

## 5. Coverage today — the metric Lift 8 tracks

Measured against §2 by reading every file, **re-measured 2026-08-12** against `origin/main`.
This table is the scoreboard; update it in the same PR as each sweep.

**Headline: 25 of 29 kit entries (86%) are at full required-state coverage, and 7 of the 10
action + field controls are.** The 2026-08-04 reading of this table was *"0 of 10"*; PR #2084
(`ec80e693c`) shipped five of the six sweep items below and it went unrecorded here for a week.
The four entries still short are named in the sweep list at the end of this section, and they
are what Lift 8b is now scoped to.

### Action controls — 3 / 5 ✅

| Component | rest | hover | pressed | focus | loading | disabled | Verdict |
|---|---|---|---|---|---|---|---|
| `ui/button.tsx` Button | ✅ | ✅ | ✅ `.press` (`:69`) | ✅ global | ✅ `loading` prop (`:95`, `aria-busy`) | ✅ | ✅ |
| `ui/icon-button.tsx` IconButton / IconLink | ✅ | ✅ | ✅ `.press` (`:51`) | ✅ explicit | 🔴 | ✅ `disabled:` + `aria-disabled:` | ⚠️ no `loading` prop |
| `ui/confirm-submit-button.tsx` | ✅ | ✅ | ✅ inherits `buttonClasses()` | ✅ global | ⚠️ `useRef` re-entrancy guard only (`:25-39`) | ✅ | ⚠️ blocks the double-fire but shows nothing |
| `ui/staff-edit-button.tsx` | ✅ | ✅ | ✅ `.press` (`:23`) | ✅ global | ➖ | ➖ | ✅ |
| `ui/switch.tsx` Switch | ✅ | ✅ gated on `inert` (`:49`) | ✅ `.press` (`:45`) | ✅ explicit | ✅ `pending` → `aria-busy` + `.dimmed` | ✅ | ✅ |

### Fields — 4 / 5 ✅

| Component | rest | focus | error | disabled | Verdict |
|---|---|---|---|---|---|
| `ui/field.tsx` Input | ✅ | ✅ neutral halo | ✅ `aria-[invalid=true]:border-danger` (`:33`) | ✅ | ✅ |
| `ui/field.tsx` Textarea | ✅ | ✅ | ✅ same `fieldClasses` | ✅ | ✅ |
| `ui/field.tsx` Field | ✅ | ➖ | ✅ `error` slot in an `aria-live` region (`:186`, `:197`) | ➖ | ✅ |
| `ui/directory-search.tsx` | ✅ | ✅ | ➖ | ✅ (`:14`, `:57`, `:65`) | ⚠️ no in-flight cue; it fetches, so §1 "loading" applies even though the Field class does not require it |
| `ui/facet-dropdown.tsx` | ✅ | ✅ + Esc | ➖ | ✅ (`:21`, `:85-86`) | ✅ |

### Cards — 4 / 5 ✅

| Component | rest | hover | pressed | focus | Verdict |
|---|---|---|---|---|---|
| `cards/entity-card.tsx` | ✅ | ✅ | ✅ `.press` | ✅ `has-[:focus-visible]` | ✅ **the exemplar** |
| `cards/person-card.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ inherits EntityCard |
| `cards/row-card.tsx` | ✅ | ✅ | 🔴 | ⚠️ inner link only | ⚠️ surface never rings or presses (`:100`) |
| `ui/stat-card.tsx` | ✅ | ✅ linked variant | ✅ `.press` on the linked variant (`:127`) | ✅ global | ✅ the unlinked tile is inert on purpose, so it owes neither |
| `ui/sidebar-card.tsx` | ✅ | ➖ | ➖ | ➖ | ✅ non-interactive container |

### Readings — 4 / 4 ✅

| Component | rest | empty | Verdict |
|---|---|---|---|
| `ui/counter.tsx` | ✅ | ✅ renders `0` | ✅ |
| `ui/meter.tsx` | ✅ | ✅ guards `cap === 0` | ✅ |
| `ui/progress-track.tsx` | ✅ | ✅ clamps 0-100 | ✅ |
| `ui/streak-meter.tsx` | ✅ | ✅ `days: []` reads "No days logged yet" (`:43-46`) | ✅ |

### State surfaces — 4 / 4 ✅

| Component | Verdict |
|---|---|
| `ui/empty-state.tsx` | ✅ five variants: first-use · no-results · cleared · error · permission |
| `ui/gate-notice.tsx` | ✅ four kinds: preview · gated · dormant · hold |
| `ui/route-error.tsx` | ✅ error + retry + escape hatch |
| `ui/skeleton.tsx` | ✅ `aria-hidden` (`:53`); `aria-busy` on the region stays the caller's job, stated in the file header |

### Navigation, overlay, display — 6 / 6 ✅

| Component | Verdict |
|---|---|
| `admin/underline-tabs.tsx` | ✅ rest · hover · `aria-current` · global ring (slated to move to `components/ui`, Lift 2b) |
| `ui/section-header.tsx` | ✅ **the state exemplar**: hover, `.press`, explicit ring, `motion-reduce` |
| `templates/page-heading.tsx` | ✅ back-link hover + ring |
| `ui/dialog.tsx` | ✅ focus trap, restore-on-close, Esc, backdrop rule |
| Badges (`demo` · `featured` · `starter` · `unclaimed` · `verified`) | ✅ display only |
| Tips (`hover-tip` · `info-tip`) | ✅ hover + focus |

### The sweep list, in payoff order

Five of the six shipped in PR #2084 (`ec80e693c`). What is left is item 5 plus the three
control-level gaps the tables above mark ⚠️.

| # | Fix | Reach | State |
|---|---|---|---|
| 1 | `.press` on Button + IconButton | Every clickable control in the app inherits a pressed state from two files. | ✅ shipped |
| 2 | `aria-invalid` + danger border in `fieldClasses`, and an `error` slot on `Field` | Every form on the site gains an error state from one file. | ✅ shipped |
| 3 | A `loading` prop on Button (`aria-busy`, label unchanged, fixed width) | Removes the "did my tap register" gap on every submit. | ✅ shipped |
| 4 | Switch: hover, `.press`, and a pending look | The settings surfaces are all switches. | ✅ shipped |
| 5 | RowCard: ring + `.press` on the surface | Brings the third card primitive level with EntityCard. | ⏳ open |
| 6 | StreakMeter empty reading, Skeleton `aria-hidden` | Small, and both are visible to a screen reader today. | ✅ shipped |
| 7 | A `loading` prop on IconButton, matching Button's | Icon-only controls are the ones where a tap leaves no other evidence it landed. | ⏳ open |
| 8 | A visible busy state on `ConfirmSubmitButton` | The ref guard already blocks the second fire; nothing tells the member the first one took. | ⏳ open |
| 9 | An in-flight cue on `DirectorySearch` | It fetches. Until it says so, an empty result and a pending one look identical. | ⏳ open |

## 6. The gate

📋 Not built yet. Lift 8d extends `check:elements`: a new `components/ui/*` primitive must
ship a colocated `*.test.tsx` that names the state strings its class requires (§2), else CI
fails. Machine-checkable proxy, deliberately: the test file exists and mentions the states.

**Seventeen** primitives carry colocated tests today (`ls components/ui/*.test.tsx`, read
2026-08-12 and identical on `origin/main`), and they name states rather than just rendering:
`button.test.tsx` has `describe` blocks for rest+hover, pressed, disabled and loading;
`icon-button.test.tsx` walks every variant's required states; `switch.test.tsx` covers
hover, pressed and focus; `field.test.tsx` covers the error, disabled and focus looks for
Input, Textarea and Field.

Against §5's own populations that is **3 of 5 action controls** (`button`, `icon-button`,
`switch`) and **3 of 5 fields** (the three `field.tsx` rows). The gate's remaining
population is `confirm-submit-button`, `staff-edit-button`, `directory-search` and
`facet-dropdown` — so 8d costs four test files plus the check, not fourteen.

---

*Owner of this table: whoever lands the next kit sweep. It is the Lift 8 metric — if it is
stale, the metric is fiction.*
