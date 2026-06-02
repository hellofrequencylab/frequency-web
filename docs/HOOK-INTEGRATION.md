# Frequency ⇄ Hook Integration — the practitioner portal as a marketplace over Hook

> **Status:** 📐 Strategy locked, build not started. Decision record: **ADR-059**
> (`docs/DECISIONS.md`). Canonical, fuller strategy doc lives in the Hook repo:
> `hook/docs/FREQUENCY-INTEGRATION.md`. First test client: **danieltyack.com**.

## TL;DR

The **practitioner portal** we want — a shop featuring community-generated programs with
free / premium / tips payout structures — is **"The Collective" (vertical 7)**, built as a
**thin marketplace over Hook-hosted programs**, not as a new course engine.

Three separate web entities, integrated by **typed contracts, never merged code**:

| Entity | One job | Owns (source of truth) |
|---|---|---|
| **Frequency** | **Marketplace + Movement** (acquisition) | Discovery, the programs shop, payout splits, gamified + in-person social layer |
| **Hook** | **Practitioner OS** (delivery) | Private cohorts, course/program hosting, branded websites, member→creator billing |
| **danieltyack.com** | Daniel's instance + the case study | A **Hook tenant** + a **listed creator** here |

**Frequency = front-of-house (discovery/shop); Hook = back-of-house (hosting/community/site/payouts).**

## What this means for The Collective (vertical 7)

The roadmap describes The Collective as "members apply to host paid meditations/courses,
Insight-Timer model, Stripe Connect payouts." **ADR-059 changes the build, not the
product:** instead of Frequency building course hosting + a second Connect integration,
The Collective **indexes and sells programs that Hook already hosts and fulfills.**

| Concern | Before (implied) | After ADR-059 |
|---|---|---|
| Course/lesson hosting | Build in Frequency | **Reuse Hook courses** |
| Creator payouts | Build Frequency Connect | **Reuse Hook Connect** (creator's connected account) |
| Discovery + shop UI | Frequency | **Frequency** (unchanged) |
| Gamified / in-person social layer | Frequency | **Frequency** (unchanged) |
| Practitioner personas | Frequency | **Frequency** (the listing identity) — links to a Hook coach account |

This keeps The Collective small and on Frequency's strengths (discovery, the engagement
ledger, the place-based movement) and avoids duplicating a course + payments stack that
already ships in Hook.

## The seams (Frequency's side)

| Seam | What Frequency does | Direction |
|---|---|---|
| **Catalog feed** | **Consumes** Hook's signed per-creator program catalog (id, title, pricing model, payout split, cover, deep link) and indexes it into the shop | Hook → Frequency |
| **Provisioning** | "Become a practitioner" funnel **calls Hook** to spin up the creator's community + site | Frequency → Hook |
| **Identity link** | Frequency practitioner persona **links to** a Hook coach account (SSO/federation — see open questions) | Shared |
| **Payout / Connect** | If Frequency brokers checkout, it adds an **application fee** on the creator's Hook-held connected account; v0 may be pure discovery (link-out, 0 fee) | Shared (Hook holds Connect) |

## Two-entity fit (important)

Frequency is **place-based / "drive people offline."** The digital programs shop sits on
the **Labs / for-profit** side of the two-entity partition (`PLATFORM-VISION.md`), the same
side as paid hosting and Connect payouts — **not** the Foundation side. Confirm this binding
when the money foundation (Stage C2) lands; The Collective must not mingle with Foundation
ledgers.

## Dogfood sequence (Daniel Tyack)

| Phase | Validates | Lead repo |
|---|---|---|
| 0 — danieltyack.com as a Hook tenant | Hook-as-website | Hook |
| 1 — Daniel's cohort + programs as Hook courses | Courses + Connect | Hook |
| **2 — List Daniel's programs in Frequency's shop** | **The catalog seam + Collective v0** | **Frequency** |
| 3 — Productize the practitioner-portal bundle | The full flywheel | Both |

Frequency's first real work is **Phase 2**: consume the Hook catalog feed and render the
shop + practitioner persona. Phases 0–1 are Hook-side.

## Open questions

1. **Identity / SSO** across Frequency ↔ Hook (shared Supabase auth vs. federation/OIDC).
2. **Marketplace fee** — pure discovery (link-out, 0 fee) for v0, or brokered checkout with
   an application fee?
3. Persona ↔ Hook coach **account linking** UX and verification state.

## See also

- `hook/docs/FREQUENCY-INTEGRATION.md` — canonical, fuller strategy + guardrails
- `docs/DECISIONS.md` ADR-059 — the decision record
- `docs/PLATFORM-VISION.md` — the two-entity model + practitioner personas
- `docs/DEVELOPMENT-MAP.md` — The Collective (vertical 7) in the build plan
