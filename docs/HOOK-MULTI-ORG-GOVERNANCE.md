# Frequency Multi-Org Hosting: Governance & Compliance (Global)

> **Status:** 🟡 Living structural plan. The **governance/compliance layer** of the Hook federation
> extends **[ADR-059](DECISIONS.md)** (3-entity split) + **[ADR-158](DECISIONS.md)** (federation) and
> sits beside **[HOOK-FEDERATION-ARCHITECTURE.md](HOOK-FEDERATION-ARCHITECTURE.md)** (the technical
> spine). Written to align the structural plan against the codebase.
>
> **Legend:** `[reuse]` existing Frequency primitive · `[extend]` build on one · `[net-new]` new build.
>
> ⚠️ Structural best-practice, **not legal advice.** The instruments (DPA, SCCs, consent-age
> thresholds) need a privacy/nonprofit attorney before go-live.

## 1. Legal data architecture = the SoT boundary, named

The existing source-of-truth boundary already maps onto the **controller / processor** model global
privacy law (GDPR + analogues) is built around:

- **Each hosted org = Controller** of its tenant's private data (members, lessons, cohorts, billing).
- **Frequency = Processor** for that private data (it only hosts it) **and Controller** of its own
  layer (network score, social graph, discovery, gamification).
- This *is* "Hook owns private/billable; Frequency owns public/social." **The product boundary is the
  legal boundary.** `[reuse — formalize]`
- **Required:** a standard **Data Processing Agreement (DPA)** per tenant: processor obligations,
  named sub-processors, breach-notification SLA, deletion-on-exit. `[net-new — contract]`

## 2. Data residency / regionalization (the "worldwide" core)

- **Pin each tenant to a region at provisioning** (US/EU/UK/CA/AU). Private data stays in-region
  (Supabase regional projects; region-pinned Hook instance). `[net-new — region field + pinned instances]`
- **Only minimized aggregates + identity links cross borders.** The architecture already keeps this
  surface tiny, which is the hard part of global compliance, already minimized. `[reuse]`
- For the small cross-border flow: document a transfer basis, **SCCs** or adequacy. `[net-new: legal]`
- **Per-region feature flags:** disable a federation surface in a jurisdiction without a code change.
  `[net-new]`

## 3. Consent & data-rights system (the biggest build: productize it)

- **Versioned consent ledger:** what/when/which-terms-version/which-surface, withdrawable. Extends the
  built `unknown → subscribed` ladder into a per-purpose, per-surface, versioned record. `[extend]`
- **Special-category data (GDPR Art. 9):** disability/health-adjacent membership needs *explicit*
  consent; tag a tenant's sensitivity so the platform raises the bar automatically. `[net-new]`
- **Minors & guardians:** age-gating + verifiable parental consent (COPPA <13 US; GDPR 13 to 16 by member
  state); guardian-linked accounts. `[net-new]`
- **Data-subject rights (DSAR):** access, rectification, **erasure**, portability. Erasure must
  **propagate across the Hook↔Frequency boundary** (delete an individual → revoke their federated
  aggregates + identity link). Per-tenant revocation is the foundation; extend to per-individual.
  `[extend]`
- **Data minimization by default** (aggregates only). `[reuse — engagement_events]`

## 4. Standard tenant lifecycle

- **Onboarding:** DPA signed → region chosen → **private-first** defaults (channels members-only,
  source-bubble redaction on, marketing off until consent). Ship as a reusable tenant default profile.
  `[extend]`
- **Operation:** audit trail on boundary-crossing events (extend the idempotent `engagement_events`
  buffer into an audit log) `[extend]`; breach-notification SLA (e.g. 72h GDPR). `[net-new]`
- **Offboarding:** standard **data-export format** + clean federation teardown (already designed) + the
  org walks away with its data intact. `[reuse + extend export]`
- **Tenant contract pack:** DPA + SLA + acceptable-use + accessibility commitment + data-export
  guarantee, as one bundle. `[net-new]`

## 5. Trust, safety, safeguarding, accessibility

- **Accessibility baseline:** WCAG 2.2 AA in the white-label template, **plus** neurodivergent defaults
  (sensory-load control, predictability, reduced-motion, plain language) as template defaults.
  `[net-new — template]`
- **Safeguarding:** policy + tooling for orgs serving minors / vulnerable adults (reporting,
  moderation). `[net-new]`
- **Breach response plan** + incident runbook. `[net-new]`

## 6. Federation governance

- Versioned contracts (in place) + a **change-control policy**: who approves a version bump,
  deprecation/migration windows. `[extend]`
- Anti-farm / anti-abuse at the boundary: daily caps + idempotent ledger so a tenant can't mint
  network rank. `[reuse]`
- A short **tenant code of conduct** governing what may federate into the global graph. `[net-new]`

## Summary: reuse vs. build

| Layer | Status |
|---|---|
| SoT boundary · data minimization · consent ladder · clean tenant revocation · discover-layer redaction · anti-farm ledger | **Reuse** (built/designed) |
| Consent ledger → versioned per-surface · revocation → per-individual erasure · tenant defaults → private-first profile · audit trail | **Extend** |
| DPA + contract pack · region pinning + SCCs · minors/guardian consent · special-category handling · accessibility template · safeguarding · breach SLA | **Net-new** |

**One-sentence model:** each hosted org is the controller of its own region-pinned private data;
Frequency is the processor for that data and the controller of the consented aggregate layer, with
consent, data-subject rights, and residency enforced as first-class platform systems at the boundary.
