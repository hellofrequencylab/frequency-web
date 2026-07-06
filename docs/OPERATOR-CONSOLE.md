> ⚠️ **HISTORICAL / SUPERSEDED (2026-07-06).** Describes a parked `lib/operator` console built against
> a stale checkout. The LIVE console is the modular one (ADR-543→553, `MENU-CONTRACT.md`). **Current
> source of truth: [BUSINESS-ACCOUNTS-RECONCILED-PLAN.md](BUSINESS-ACCOUNTS-RECONCILED-PLAN.md).**

# Operator Console

> **Status:** 🟡 P0 foundation shipped behind `operatorConsoleEnabled()` (default OFF). Decision:
> [ADR-451](DECISIONS.md). Plan: [BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md](BUSINESS-ACCOUNTS-PRODUCTION-PLAN.md)
> Part 1. This doc is the operator IA reference: the seven workspaces, the gating model, and the files.

## What it is

**One console, scope-switched.** The root platform (a Space of `type='root'`) and every tenant Space
are the same operator role at different scopes, so they share one cockpit with **seven fixed
workspaces**. A scope switcher picks which Space you operate; what renders is gated by role × plan ×
space type. This replaces 60+ scattered surfaces across `/admin/*`, `/spaces/[slug]/settings/*`,
personal `/settings/*`, `/pages/*`, and `/lead/*`, and ends the email/QR/CRM/members duplication.

## The seven workspaces

| Workspace | Route | What it holds |
|---|---|---|
| **Home** | `home` | Overview: key numbers, recent activity, quick actions |
| **Profile and site** | `site` | Brand, theme, pages, menu, visibility, custom domain (root: the Spaces directory) |
| **People** | `people` | Roster, CRM, segments, verification, support |
| **Marketing** | `marketing` | Campaigns, automations, QR, funnels, referrals, analytics |
| **Offerings and commerce** | `offerings` | Bookings, memberships, donations, enrollment, tickets, check-in (root: marketplace) |
| **Community and content** | `community` | Circles, events, content library, rewards, moderation |
| **Settings** | `settings` | Features and access, plan and billing, roles, AI/Vera, audit |

## The gating model (three axes, OFF-safe)

Every workspace and subtab carries optional gates; the pure resolver applies only the ones present,
reproducing the shipped gate math:

- **Root (staff axis):** `web_role` floor (none < admin < janitor) **unioned** with the
  `team_members` capability domain (`staffDomain`). Mirrors `canSeeAdminSection`.
- **Space (role axis):** the `SpaceRole` ladder (viewer < editor < moderator < admin) + the per-Space
  function switch (`spaceFunctionEnabled`) + a `spaceTypes` restriction. Mirrors `spaceFunctionAccess`.
- **Plan axis (both):** an optional `FEATURE_GATES` key resolved by `featureAllowed`. **OFF-safe:**
  while `billing_live` is OFF every plan gate grants, so the console shows exactly what ships today.

Fail-closed: an unknown role, a non-member, or a malformed input reads as no access.

## Files

| Concern | File | Purity |
|---|---|---|
| The IA registry (7 workspaces, append-only) | `lib/operator/console.ts` | pure data + types |
| The visibility resolver | `lib/operator/visible.ts` | pure |
| The rollout flag (default OFF) | `lib/operator/feature-flag.ts` | pure |
| Legacy → console redirect map (derived) | `lib/operator/route-map.ts` | pure |
| Scope-context (root + space) | `lib/operator/scope-context.ts` | server (composes existing guards) |
| The console shell (Dashboard template) | `components/operator/console-shell.tsx` | server component |
| Preview routes (behind the flag) | `app/(main)/operator/[workspace]/` · `app/(main)/operator/s/[slug]/[workspace]/` | routes |
| Rail registration | `lib/layout/page-chrome.ts` (`/operator` → `'none'`) | — |
| Tests | `lib/operator/*.test.ts` (registry invariants, gating matrix, route coverage) | — |

The registry **transcribes** the existing nav data — `ADMIN_GROUPS` (`app/(main)/admin/sections.ts`)
and `SPACE_FUNCTIONS` (`lib/spaces/functions.ts`) — which stay as the source data.

## Extension contract

Later phases **append subtabs**; they never re-shape the seven workspaces. Reviews moderation (P3),
automation/sequences (P4), at-risk + AI credits (P5), and the email-domain tab (P6) each register a
new `ConsoleEntry` with its own gates. New capability = one registry row (+ one gate/function key),
never a new orphan settings page.

## Rollout

1. **Now (P0):** foundation behind `operatorConsoleEnabled()` (default OFF), previewed at `/operator/*`.
   While OFF, every legacy surface renders exactly as today.
2. **Fold (P0:5):** each subtab body absorbs its legacy surfaces (unifying the duplicated email/QR/CRM/
   members tooling into one scope-aware surface).
3. **Cutover (P0:9):** relocate the console onto `/admin` + `/spaces/[slug]/manage`, redirect the
   legacy routes via `route-map.ts`, and enable the flag for staff → beta operators → everyone. The
   flag makes every step reversible.

## To see it locally

Set `OPERATOR_CONSOLE_ENABLED=true` and sign in as a staff operator (root) or a Space owner/admin
(space), then visit `/operator/home` or `/operator/s/<slug>/home`. With the flag unset it 404s and
nothing in production changes.
