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
| **focus-visible** | Keyboard focus is here. | The global ring in `app/globals.css` (amber for chrome, neutral for fields). Do not re-declare it unless you are overriding on purpose. A surface carrying `.lift-*` is the one exception and it is not optional: the lift's own `box-shadow` is unlayered and eats the global ring, so a lifted card takes `.ring-focus` (§5). |
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

**Headline: 29 of 29 kit entries (100%) are at full required-state coverage, including all 10
action + field controls.** The 2026-08-04 reading of this table was *"0 of 10"*; PR #2084
(`ec80e693c`) shipped five of the six sweep items and it went unrecorded here for a week. Lift 8b
closed the remaining four (LIVE-001…LIVE-004).

🔴 **And it found the reason the ring had never worked.** RowCard was scoped as "copy
EntityCard's `has-[:focus-visible]:ring-*`", and those four utilities had never painted a pixel:
a Tailwind ring is a `box-shadow` in `@layer utilities`, `.lift-1` is a `box-shadow` in no layer
at all, and an unlayered declaration beats every layer whatever its specificity. So every lifted
card in the kit was painting its drop shadow over its own focus indicator, and no gate could see
it — tsc and eslint read a className as a string, and `check:phantom` asks whether a class emits
a rule, not whether that rule survives the cascade. The card focus ring is now `.ring-focus` in
`app/globals.css`, an `outline` (the one property `.lift-*` does not touch), and
`components/cards/card-focus-ring.test.ts` compiles the real sheet and reads the layers back, so
the claim under test is "the indicator wins" rather than "the class is spelled right".

### Action controls — 5 / 5 ✅

| Component | rest | hover | pressed | focus | loading | disabled | Verdict |
|---|---|---|---|---|---|---|---|
| `ui/button.tsx` Button | ✅ | ✅ | ✅ `.press` (`:69`) | ✅ global | ✅ `loading` prop (`:95`, `aria-busy`) | ✅ | ✅ |
| `ui/icon-button.tsx` IconButton / IconLink | ✅ | ✅ | ✅ `.press` (`:51`) | ✅ explicit | ✅ `loading` prop (`aria-busy`, nothing swapped in) | ✅ `disabled:` + `aria-disabled:` | ✅ |
| `ui/confirm-submit-button.tsx` | ✅ | ✅ | ✅ inherits `buttonClasses()` | ✅ global | ✅ `useRef` guard + `aria-busy` and `.dimmed` | ✅ | ✅ |
| `ui/staff-edit-button.tsx` | ✅ | ✅ | ✅ `.press` (`:23`) | ✅ global | ➖ | ➖ | ✅ |
| `ui/switch.tsx` Switch | ✅ | ✅ gated on `inert` (`:49`) | ✅ `.press` (`:45`) | ✅ explicit | ✅ `pending` → `aria-busy` + `.dimmed` | ✅ | ✅ |

### Fields — 5 / 5 ✅

| Component | rest | focus | error | disabled | Verdict |
|---|---|---|---|---|---|
| `ui/field.tsx` Input | ✅ | ✅ neutral halo | ✅ `aria-[invalid=true]:border-danger` (`:33`) | ✅ | ✅ |
| `ui/field.tsx` Textarea | ✅ | ✅ | ✅ same `fieldClasses` | ✅ | ✅ |
| `ui/field.tsx` Field | ✅ | ➖ | ✅ `error` slot in an `aria-live` region (`:186`, `:197`) | ➖ | ✅ |
| `ui/directory-search.tsx` | ✅ | ✅ | ➖ | ✅ | ✅ in-flight cue: `useTransition` → glyph swap + `aria-busy` + an `aria-live` status line |
| `ui/facet-dropdown.tsx` | ✅ | ✅ + Esc | ➖ | ✅ (`:21`, `:85-86`) | ✅ |

### Cards — 5 / 5 ✅

| Component | rest | hover | pressed | focus | Verdict |
|---|---|---|---|---|---|
| `cards/entity-card.tsx` | ✅ | ✅ | ✅ `.press` | ✅ `has-[:focus-visible]` | ✅ **the exemplar** |
| `cards/person-card.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ inherits EntityCard |
| `cards/row-card.tsx` | ✅ | ✅ | ✅ `.press` on the link row | ✅ `ring-focus` on the link row | ✅ the managed + destination-less rows owe neither, on purpose |
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

Five of the six shipped in PR #2084 (`ec80e693c`); item 5 and the three control-level gaps were
Lift 8b (`LIVE-001`…`LIVE-004`).

| # | Fix | Reach | State |
|---|---|---|---|
| 1 | `.press` on Button + IconButton | Every clickable control in the app inherits a pressed state from two files. | ✅ shipped |
| 2 | `aria-invalid` + danger border in `fieldClasses`, and an `error` slot on `Field` | Every form on the site gains an error state from one file. | ✅ shipped |
| 3 | A `loading` prop on Button (`aria-busy`, label unchanged, fixed width) | Removes the "did my tap register" gap on every submit. | ✅ shipped |
| 4 | Switch: hover, `.press`, and a pending look | The settings surfaces are all switches. | ✅ shipped |
| 5 | RowCard: ring + `.press` on the surface | Brings the third card primitive level with EntityCard. | ✅ shipped |
| 6 | StreakMeter empty reading, Skeleton `aria-hidden` | Small, and both are visible to a screen reader today. | ✅ shipped |
| 7 | A `loading` prop on IconButton, matching Button's | Icon-only controls are the ones where a tap leaves no other evidence it landed. | ✅ shipped |
| 8 | A visible busy state on `ConfirmSubmitButton` | The ref guard already blocks the second fire; nothing tells the member the first one took. | ✅ shipped |
| 9 | An in-flight cue on `DirectorySearch` | It fetches. Until it says so, an empty result and a pending one look identical. | ✅ shipped |

## 6. The gate

Lift 8d's gate lives in `scripts/check-elements.mjs`, as the plan asked — a second contract in
that file, next to the unrelated embeddable-elements one it shares a name with. A
`components/ui/*.tsx` primitive that is NOT on the frozen ledger and ships no colocated state
test fails it. Run it by hand with `node scripts/check-elements.mjs`; in CI it is
`scripts/check-ui-states.test.ts`, which vitest auto-discovers, so it cannot be dropped from a
guards array.

**The machine-checkable proxy, stated exactly.** A primitive has a state test iff some
`components/ui/*.test.tsx` (a) imports that module and (b) names **at least three** of the nine
§1 states in its own `describe`/`it` titles. Titles only: a `.press` inside a className
assertion exercises a state, it does not name one, and naming is what this section always asked
for. Three, not two, because `avatar.test.tsx` says "focus" about a focal *point* and
`.dimmed` about a receded avatar — it scores 2, and it is not a state test.

**The counts, measured not estimated (2026-08-17, banked after Lift 8b).**

| | |
|---|---|
| `components/ui/*.tsx` primitives | **42** |
| ship a state test | **8** — `button`, `checkbox`, `confirm-submit-button`, `directory-search`, `field`, `icon-button`, `select`, `switch` |
| grandfathered in `scripts/ui-state-test-ledger.txt` | **34** |

⚠️ **Two corrections to the paragraph this replaces.** It counted *seventeen* colocated test
files and named *four* of them as state tests. Seventeen files is right and it is the wrong
unit — a test file is not a primitive, and `badge.test.tsx` covers five. And the four were six:
`select.test.tsx` and `select-checkbox.test.tsx` name focus, error and disabled and always
did. It also said 8d "costs four test files plus the check". It cost **zero**: the debt is
frozen, not swept, which is the only version of this gate that could ship without a sweep in
front of it.

**The ledger is a ratchet, and it only shrinks.** Same shape as `scripts/templates-baseline.txt`
and `scripts/admin-client-baseline.txt` — a SET of paths, so one primitive gaining a test and
one arriving without one can never net to zero. It is stricter than both of those in one way, on
purpose: a ledger entry that *gains* a state test **fails** until it is removed (`--update`
banks it), because the number in this section is a published metric and an unbanked win makes it
fiction.

**Why 34 is not 34 units of neglect.** The gate cannot classify a primitive, and §2 assigns the
required set BY CLASS: a Display badge owes only `rest`, a Reading owes `rest` + `empty`.
Neither can honestly name three states. So the gate over-reports by design — it can call a
primitive undertested, never certify an untested one — and the badges, icons and image widgets on
the ledger are there for their class. A new one belongs there too:
`node scripts/check-elements.mjs --update --allow-raise --reason="why"`, a one-line reviewable
claim rather than a test written to satisfy a regex.

---

*Owner of this table: whoever lands the next kit sweep. It is the Lift 8 metric — if it is
stale, the metric is fiction.*
