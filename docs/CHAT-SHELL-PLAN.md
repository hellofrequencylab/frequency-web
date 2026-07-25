# Chat Shell — the site-wide unified dock (Web + Mobile)

> **Owner directive (2026-07-25).** One chat system, site-wide, in the NEWER popup shell style
> (the ADR-816 live-chat widget's panel language), carrying ALL the functionality of both builds:
> **Messaging up front · Vera in the other tab · Help + Contact in a second section that opens
> from a link — direct customer support never up front.** Planned for Web and Mobile.
>
> Grounded in the full two-generation scan (both systems mapped file-by-file). Canons:
> [NAMING.md](NAMING.md) · [CONTENT-VOICE.md](CONTENT-VOICE.md) (no em dashes in member copy) ·
> [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) §5 (never block the shell) · ADR-817 (`check:crm-parity`).
> **Status legend:** ✅ done · ⏳ in progress · 📋 planned.

---

## 0. Ground truth (what exists)

| System | Shell | Mount | Auth / realtime |
|---|---|---|---|
| **Old tabbed dock** (`components/vera/vera-launcher.tsx`, ADR-086) | EdgePill + panel (bottom sheet on mobile, anchored card on desktop, `z-50`), tabs **Chat · Vera · Help**, last tab in `localStorage fq_dock_tab`, window events `open-vera`/`open-chat` | `app/(main)/layout.tsx` via `VeraLauncherSlot` (Suspense, streams help index + tease gate) | Authed. DMs/rooms: RLS user client + postgres_changes (`components/messages/dock-chat.tsx` opens threads inline). Vera: server-action turns (`conciergeTurn`), client-state transcript. Help: in-panel search + links. |
| **New live-chat widget** (`components/chat/support-chat-widget.tsx`, ADR-816) | Round FAB + `rounded-2xl` panel (`bottom-4 right-4 z-50`, `w-[22rem] h-[32rem]`, `shadow-pop`), header/body/composer, typing dots | `app/layout.tsx` root, behind `NEXT_PUBLIC_SUPPORT_CHAT === '1'` (renders EVERYWHERE when on) | Anonymous. Comms-spine conversation (`kind:'crm'`, `channel:'in_app'`), HMAC capability token, Supabase **Broadcast** (`chat:<token>`), rate-limited public actions. |
| **Contact / tickets** (`components/support/support-launcher.tsx` + `report-dialog.tsx`, ADR-159) | App-wide dialog on the `open-support` window event | `app/(main)/layout.tsx` | Authed. Files `support_tickets`; inline RAG deflection (`askHelp`); member list at `/support`. |

**The problem today:** two independent floating systems can double-mount in the same corner
(EdgePill `z-40/50` + live-chat FAB `z-50` when the flag is on), three visual languages, Help as a
top-level tab, and no audience arbitration.

---

## 1. The design (locked)

**One dock, one shell language (the new widget's), two audiences, three layers.**

```
MEMBER (signed in, (main) shell)          VISITOR (marketing/help/public)
┌─────────────────────────────┐           ┌─────────────────────────────┐
│  [Messages]   [Vera]     ✕  │           │  Chat with us            ✕  │
│  ─────────────────────────  │           │  (the ADR-816 live chat,    │
│   front tab: your DMs +     │           │   name/email gate, typing,  │
│   rooms, unread-first,      │           │   staff replies)            │
│   threads open inline       │           └─────────────────────────────┘
│                             │            unchanged behavior; already
│  ───────────────────────    │            the new shell style
│  Help & support  →  (link)  │
└─────────────────────────────┘
         │ click
         ▼
┌─────────────────────────────┐
│  ← Back      Help & support │
│  help search (instant)      │
│  Ask Vera about this        │
│  Report a bug / Contact us  │  ← ticket dialog (ADR-159), never a tab
│  Your support tickets       │
│  Browse the help center     │
└─────────────────────────────┘
```

- **Messages is the front tab** (default on open; `fq_dock_tab` remembers, with the retired
  `'help'` value migrating to `'chat'`). Vera is the second tab.
- **Help + Contact live in a second SECTION** — a full-panel view pushed by the "Help & support"
  footer link (with a Back affordance), holding the old Help tab's search + the Contact/Report
  path. Direct support is one tap away but never up front.
- **The shell language is the new widget's**: `rounded-2xl border-border bg-surface shadow-pop`
  panel, clean header, round FAB affordances, typing dots, semantic tokens throughout.
- **Visitors keep the ADR-816 live chat as-is** — it is already the new style, and support-first
  IS the right ordering for an anonymous visitor (they have no DMs or Vera). No tabbed dock for
  anon in this phase.

## 2. Audience + corner arbitration (the site-wide rule)

One owner of the bottom-right corner per surface, decided by layout (never by z-index war):

| Surface | Corner owner |
|---|---|
| `(main)` member app | **The dock** (EdgePill → panel). The live-chat widget does NOT mount. |
| `(marketing)`, `(help)`, public/anon pages | **SupportChatWidget** (when `NEXT_PUBLIC_SUPPORT_CHAT=1`). |
| `/admin/**` | The admin page-dock owns the corner; the dock pill stays hidden (existing rule), panel still openable via events. |

Implementation: move the `SupportChatWidget` mount OUT of the root layout into the public route
groups' layouts, so the member shell never double-mounts it. The window-event API is preserved
site-wide: `open-chat` (Messages tab) · `open-vera` (Vera tab) · `open-support` (ticket dialog) ·
new `open-help` (the Help & support section).

## 3. Mobile deployment (per MOBILE-NAV-PLAN)

- **Panel = bottom sheet** (`inset-x-0 bottom-0 rounded-t-2xl`, `max-h-[85dvh]`, safe-area
  padding, `z-50` above the `z-40` tab bar) — the existing dock convention, restyled to the new
  language. Desktop = anchored card `md:bottom-6 md:right-6 md:w-[24rem]`.
- **Launcher**: the EdgePill (badged with messages unread) sits above the mobile tab bar; the
  MOBILE-NAV-PLAN header Messages icon opens the dock's Messages tab (same `open-chat` event) —
  quick-switch in the dock, deep work on the `/messages` routes. Both stay.
- Keyboard-safe composer (`dvh` sizing, the on-air pattern); 44px touch targets; ESC/backdrop
  close; `print:hidden`.

## 4. Phases

| # | Phase | Scope | Status |
|---|---|---|---|
| **C0** | **DockShell extraction** — `components/chat/dock-shell.tsx`: the new widget's panel language as reusable primitives (`DockPanel`, `DockHeader`, `DockTabs`, `DockSection` back-nav view, FAB/pill slot). Pure presentation; both consumers restyle onto it with zero behavior change. | ⏳ |
| **C1** | **Member dock rebuild** — VeraLauncher re-ordered onto DockShell: tabs `Messages · Vera` (Messages front/default), Help demoted from tab to the link-opened **Help & support section** (search + Ask Vera + Report/Contact + tickets + help center links, folding the `open-support` affordance in). `fq_dock_tab` migration `'help'→'chat'`; `open-help` event added; unread badge + wiggle preserved. | ⏳ |
| **C2** | **Corner arbitration** — SupportChatWidget mount moves from the root layout to the public groups; the member shell owns its corner. No double FAB anywhere. | ⏳ |
| **C3** | **Mobile polish** — bottom-sheet sizing/safe-area/keyboard pass on the new shell; header Messages icon wiring (`open-chat`). | 📋 |
| **C4** | **Deepening (post-shell)** — member-bound staff chat (bind `memberProfileId` into the spine conversation instead of a contact row, so a signed-in member's "Contact us" can be LIVE chat in the section); durable Vera transcripts (resume across devices); unified unread (messages RPC + Vera pulse + staff-reply signal — today a staff reply to a closed widget is silent); the `useRealtimeChannel` seam (MESSAGING-PLATFORM Phase 0). | 📋 |

Each phase lands tsc/lint/test-green with `check:crm-parity` + `check:tokens`; C1 copy passes the
voice canon. The `/messages`, `/support`, `/help` routes are untouched (the dock is quick-switch
chrome, not a replacement).

## 5. Invariants (do not break)

1. **Auth boundary**: nothing authed imports into the anon widget path; the member dock stays
   inside `(main)`. Two mounts, shared presentation.
2. **Channel hygiene**: every Supabase channel removed on unmount (existing law).
3. **Events API**: `open-vera` / `open-chat` / `open-support` keep working from every existing
   dispatcher (admin command bar, account menu, report buttons).
4. **Suspense slots**: the dock stays behind `<Suspense fallback={null}>` in the layout; never
   blocks the shell (PAGE-FRAMEWORK §5).
5. **ADR-817**: any comms-touching change keeps the shared-module imports (`check:crm-parity`).
6. **Tokens only**: no hex, no `text-[Npx]`; the shell reuses the widget's semantic classes.

---

*Owner: Daniel (Vision Steward). Created 2026-07-25 from the two-generation chat scan. Execute C0 → C3; C4 items are individually scoped follow-ups.*
