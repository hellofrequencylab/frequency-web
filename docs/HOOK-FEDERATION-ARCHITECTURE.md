# Frequency ⇄ Hook: Federation Architecture (network + data sharing)

> **Status:** 🟡 Living design doc. **Update as the model evolves.** The *decision* is
> [ADR-158](DECISIONS.md) (extends [ADR-059](DECISIONS.md)); the product framing is
> [HOOK-INTEGRATION.md](HOOK-INTEGRATION.md); the governance/compliance layer is
> [HOOK-MULTI-ORG-GOVERNANCE.md](HOOK-MULTI-ORG-GOVERNANCE.md). The **canonical cross-product contract** lives in the
> Hook repo (`hook/docs/FREQUENCY-INTEGRATION.md`). This is the **Frequency-side** view.
>
> Tags: **[built]** = exists in Frequency today · **[designed]** = ADR-158, not built ·
> **[proposed]** = needs owner decision.

## 1. Principle: two systems, typed contracts, never merged code

Separate databases, separate deploys, integration **only** through versioned API contracts +
signed webhooks. No shared schema, no shared code, no cross-DB joins. The contract boundary *is* the
product boundary.

```
   HOOK  (Practitioner OS, per-tenant)        typed contracts        FREQUENCY (Marketplace + Movement, global)
   • private cohorts / lessons / journeys   ── REST/RPC + webhooks ─▶ • discovery / programs shop
   • member→creator billing                 ◀──────────────────────  • shared social graph
   • branded white-label site (subdomain)     identity · points       • gamification (the score)
   • private gamification                     membership · events     • events / in-person layer
                                              contacts (consent)       • Capture / Network CRM
        back-of-house (delivery)                                          front-of-house (acquisition)
```

## 2. Source-of-truth boundaries

| Datum | Owner (SoT) | The other side holds |
|---|---|---|
| Identity (the person) | **Shared** via identity link (§3) | a FK reference, never credentials |
| Private lessons / journeys / cohorts | **Hook** | nothing |
| Private program **points** | **Hook** | a rolled-up aggregate into the Frequency score |
| Branded site / subscription tiers / billing | **Hook** | nothing |
| Frequency **score / rank / season** | **Frequency** | Hook may *read* via contract |
| Shared social graph (friends/follows) | **Frequency** | Hook reads via contract |
| Channels / circles (when federated) | **Frequency** (canonical) | Hook exposes/links its own |
| Events (in-person layer) | **Frequency** | Hook reads/writes via Capture/Network contract |
| Contacts / leads | owner-scoped on **each** side | cross only on **consent** |

Rule: **Hook owns private/billable; Frequency owns public/social/gamified.** Anything crossing is an
explicit, opt-in contract call, never a silent copy.

## 3. Identity federation: the linchpin **[designed §8.1]**

Rollover and rollup both depend on one person = one identity across both.

- **Account-link table (Frequency):**
  `account_links(frequency_profile_id, hook_tenant_id, hook_user_id, status, linked_at)`,
  unique on `(hook_tenant_id, hook_user_id)`. One Frequency profile ↔ many Hook tenants.
- **Link handshake:** OAuth-style. Hook redirects the user to Frequency with a short-lived,
  tenant-scoped token; Frequency authenticates the existing profile (anchor: `profiles.auth_user_id`)
  or provisions one, then writes the link. No password sharing.
- **Membership rollover:** on a Hook `member.active` webhook, Frequency provisions/activates a
  `member` profile via the link, idempotent on `(hook_tenant_id, hook_user_id)`.

## 4. Federation surfaces (data-sharing contracts): all host opt-in

**(a) Points rollup → Frequency score [designed §8.2]**
- Hook → Frequency push: `{hook_tenant_id, hook_user_id, activity_key, points, idempotency_key, occurred_at}`.
- Frequency resolves the link, ingests via the **`engagement_events` ledger [built]** (exactly-once on
  `idempotency_key`), converts to currency: private **online** → **gems**, private **real-world** →
  **zaps** (drive season rank), mirrors **ADR-139**.
- **Anti-farm [critical]:** reward the real outcome, **daily-capped + idempotent**; a counter loop
  can't mint rank (Frequency §5.5 doctrine). Private-vs-public weighting is **[proposed]**.

**(b) Channel/circle federation [designed §8.3]**
- Bidirectional, opt-in per channel/circle. Frequency already gates reach via the
  **`feed_for_viewer` / `scoped_feed_for_viewer` SECURITY-DEFINER RPCs [built]**. Federation =
  registering a Hook community's channels/circles into that reach model; per-content privacy holds
  (private bubble channel stays members-only; a "public" channel is the lead funnel).

**(c) Contacts / leads, consent-gated [partly built]**
- Either direction, **never silent**. Frequency's **`network_contacts` [built]** is owner-scoped; the
  **consent ladder [built]** is `unknown → subscribed`. A captured person is *personal*, becomes
  mailable only when **they** confirm an email / sign up (ADR-099/154). The same invariant governs
  cross-boundary flow. **This is the bleed boundary. Model it as hard.**

**(d) Events / in-person [built on Frequency]**
- Events, RSVPs, and the event-invite capture loop live in Frequency (Capture/Network spine §5/§6).
  Hook tenants list/create events via contract; attendance feeds the bubble **and** the zaps rollup.

## 5. Privacy & the lead-funnel model (Substack analogy)

- **Three tiers per bubble [designed]:** **public** (lead funnel: a teaser, indexable) · **paid**
  (subscription, Hook billing) · **private** (members-only).
- Only the **public face** is visible to the wider network/crawlers, mirroring Frequency's posture:
  authed app is `robots`-disallowed, only `/discover/*` is indexable via **column-safe,
  location-redacted RPCs [built, DISCOVER-LAYER]**. Bubbles inherit "redaction is load-bearing."
- **Energy both ways:** public bubble → join gated sub-community (Hook) → optional federation
  (rollup/rollover) → Frequency discovery sends new people back to the bubble.

## 6. Sync mechanics & consistency

- **Transport:** signed **webhooks** for state changes (member active, points earned, tier changed) +
  **idempotency keys** on every mutating call; authenticated reads.
- **Consistency:** eventually consistent; the **`engagement_events` ledger [built]** is the idempotent
  ingestion buffer, so retries/duplicates are safe.
- **Auth:** tenant-scoped service tokens (Hook→Frequency) + the per-user identity link for user-scoped
  actions; rotate per tenant; revocation kills a tenant's federation cleanly.
- **Versioning:** the contract is versioned, so a Hook schema change can't break a Frequency deploy;
  only a negotiated contract-version bump can.

## 7. Tenancy & isolation

- **Per-tenant subdomains** (`tenant.frequencylocal.com` / the tenant's own domain) **[proposed;**
  Frequency has a per-Nexus-subdomain backlog item, §J] are the white-label front door; Hook serves
  the branded site.
- A tenant's private data never enters Frequency's DB, only aggregates + links. Revoking a tenant
  removes its federation rows without touching member identities (who keep rollover membership).

## 8. Build status

| Layer | Status |
|---|---|
| 3-entity split, contracts-not-merged | **[locked, ADR-059]**: not built |
| Federation surfaces (rollover/rollup/federation/contacts) | **[designed, ADR-158 §8]**: not built |
| `engagement_events` ledger · `feed_for_viewer` reach · `network_contacts` + consent ladder · zaps/gems · discover-layer redaction | **[built]**: the primitives the federation reuses |
| `account_links` table · points-rollup endpoint · channel-federation registry · subdomain hosting | **[to build, §8.0 to 8.3]** |

**One-sentence model:** *Frequency is the federated identity + social + gamification + discovery
layer; each Hook community is an isolated, billable, white-label tenant that links identities into
Frequency and pushes consented aggregates (points, membership, public content) across a versioned
contract, never shared code, never silent data copies, consent and anti-farm enforced at the
boundary.*
