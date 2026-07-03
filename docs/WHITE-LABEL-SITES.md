# White-Label Website Builder & Multi-Tenant Hosting

**Status:** ⏳ Planned (approved architecture, not yet implemented) · **Owner decision:** ADR-509 · **Audience:** Spaces first, members in P5

A full site builder + hosting service that gives every Space its own website: a branded
subdomain by default, its own custom domain as a premium tier, one visual editor, one data
model, and the smallest possible support surface. This is the continuation of ADR-508's U4
line ("Users' external websites use Puck TEMPLATES that read the same entity data").

> **Source of truth.** This doc is the technical plan. The locked architecture decision is
> **ADR-509** in [`docs/DECISIONS.md`](DECISIONS.md). Code + `supabase/migrations/` remain the
> source of truth once implementation starts.

---

## 1. The recommendation in one paragraph

Serve every Space a site at `slug.<sites-apex>` using a Vercel **wildcard domain** and
host-routing in **`proxy.ts`** (the Next 16 middleware). Add a premium **bring-your-own-domain**
tier through the **Vercel Domains API** (automatic verification + TLS, near-zero ops), gated on
the entitlements + Stripe billing that already exist. Author sites in the **in-house Puck editor
we already ship** (`DesktopEditor` + `BlockRender`), un-gated to per-Space pages, rendering the
`pages` table with ISR. Keep public tenant sites **anonymous** so cross-domain auth never becomes
a problem. Two real greenfield pillars: a domains data model + host router, and Vercel domain
provisioning. Everything else extends machinery that already exists.

The **sites apex** is a dedicated new domain the owner registers (working placeholder
`frequencysites.com`); it is deliberately NOT a subdomain of `frequency.app`, so the public
sites' cookie scope is isolated from the app by construction.

---

## 2. We are not starting from zero

| Capability | Status | Where it lives · what is missing |
| --- | --- | --- |
| Tenant → entity spine | ⚠️ Partial | `resolveSpaceForHost` / `getSpaceByDomain` in `lib/spaces/store.ts` — exact-match on a single `spaces.domain` column, read only in `app/(main)/layout.tsx`. No subdomain parsing, no `x-forwarded-host`. |
| Edge middleware | ✅ Exists | `proxy.ts` (Next 16 renames middleware). Auth + attribution. **Zero host rewriting** — the router is greenfield. |
| Page storage | ⚠️ Partial | `pages` table is `space_id`-aware in code (`lib/page-editor/data.ts`); repo migration lacks the column and uses a global-unique `slug`. Authoring gated to a root allowlist (`EDITABLE_PAGES`). |
| Visual editor | ✅ Exists | In-house fork — `DesktopEditor` + `BlockRender` + `config.tsx`. `@measured/puck` removed (ADR-493). "Full Puck" = extend this. |
| Public site render | ✅ Exists | `app/sites/[slug]/page.tsx` (U4-B) + the `website` surface + per-surface visibility. Fail-closed, slug-addressed on the root domain. |
| Entitlements + billing | ✅ Exists | Default-deny entitlements (`lib/spaces/entitlements.ts`), plan ladder, and full Stripe per-Space subscriptions (`lib/billing/space-subscriptions.ts`). A `space_whitelabel` Branding gate is already defined. |
| Domains model | 🔴 Build | Single unique `spaces.domain` column. No subdomain / verification / status / multi-domain / domains table. |
| Domain provisioning | 🔴 Build | No Vercel Domains API calls, no DNS verification, no wildcard config in `vercel.json`. The largest greenfield surface. |

**The two pillars this plan must build:** (1) a domains data model + a host router in `proxy.ts`
wired into `resolveSpaceForHost`, and (2) Vercel domain provisioning + verification.

---

## 3. Recommended architecture

### 3.1 Request flow

```
Visitor (acme.com | slug.frequencysites.com)
  → DNS (CNAME for subdomain-of-their-domain / A|ALIAS for apex; wildcard A for our subdomains)
  → Vercel edge (TLS auto-issued, request enters the app)
  → proxy.ts  ── reads host ──►  tenant host?  ── yes ─► rewrite to /_site render + SKIP auth
                                                └─ no ──► normal app tree (frequency.app)
  → /_site: resolve Space by host → published Puck doc from `pages` → BlockRender → ISR cached
```

### 3.2 Load-bearing decisions

| Piece | Decision | Why |
| --- | --- | --- |
| Subdomain host | `*.<sites-apex>` (dedicated domain) | Isolates the public sites' cookie scope from the app; removes cross-tenant session bugs by construction. |
| Subdomain routing | Vercel wildcard domain + `proxy.ts` rewrite | The Vercel Platforms pattern. Wildcard A record is automatic; the router reads host and rewrites to an internal render path. |
| Custom domains | Vercel Domains API | One platform, programmatic add + verify + auto-TLS, unlimited domains on Pro/Enterprise. Lowest ops. |
| Domains model | new `space_domains` table | Subdomain + custom domains, each with a verification token and status. Supersedes the overloaded `spaces.domain`. |
| Render | `pages` table, per-Space, via `BlockRender` + ISR | Un-gate the `space_id` seam. Draft/published already modeled. On-demand revalidate per site on publish. |
| Editor | extend in-house `DesktopEditor` | "Full Puck" in repo language. Re-adopting npm Puck would undo ADR-493 for no gain. |
| Auth on tenant hosts | none — anonymous | Public sites carry no session. The router skips the auth refresh on tenant hosts, sidestepping cross-domain cookies. |

---

## 4. Domain & hosting model

### 4.1 Subdomains (the free default)

- Vercel wildcard domain `*.<sites-apex>` resolves every subdomain to the deployment automatically.
- `proxy.ts` reads the host (handling `x-forwarded-host`), strips the apex, validates the label
  against a **reserved list** (`www`, `app`, `api`, `admin`, `mail`, `cdn`, `assets`, …), resolves
  the Space, and rewrites to the internal render.
- Slug validation at claim time: `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$` (lowercase alphanumeric +
  hyphen, ≤63 chars), not in the reserved set.

### 4.2 Custom domains (the paid add-on)

| Approach | Cost model | Ops | Verdict |
| --- | --- | --- | --- |
| **Vercel Domains API** | Unlimited domains on Pro/Enterprise (soft cap 100K/1M). No per-domain fee; pay plan + usage. | Lowest — one platform, TLS handled. | **Recommended start.** Real scale eventually implies Enterprise. |
| Cloudflare for SaaS | **$0.10**/custom hostname/mo, first **100 free**. | Medium — a second system; proxy through Cloudflare. | Revisit at scale when per-domain cost dominates. |
| Self-managed ACME | "Free" certs, real engineering + on-call (rate limits, DNS-01 wildcards, renewal). | Highest — you own the TLS pipeline. | Not recommended. Contradicts minimal-support goal. |

### 4.3 The DNS records a customer sets

- **Subdomain of their domain** (`www.acme.com`): a single `CNAME` to our target host.
- **Apex / root** (`acme.com`): an `A` record (or `ALIAS`/`ANAME` where supported) — a CNAME at the
  apex is illegal. This is the #1 support driver; the wizard must detect apex vs subdomain and show
  the correct record.
- **Ownership**: a `TXT` token (e.g. `_frequency-verify.acme.com`) proves control before binding —
  also the primary anti-takeover defense (§6).

---

## 5. The editor & templates

"The full Puck editor" here = the in-house `DesktopEditor` + `BlockRender` + block library, opened
to per-Space multi-page authoring. The npm package stays out (ADR-493).

- **Template → instance.** Versioned starter templates (a Puck doc + block preset). Choosing one
  seeds the Space's `pages` rows; edits never mutate the template. `pages.template_version` makes a
  template revision opt-in per site.
- **Draft vs published.** Already modeled: `pages.data` (draft), `pages.published_data` (live). Sites
  render `published_data`; Publish promotes + revalidates.
- **Safe rendering.** `BlockRender` renders only known block types from a fixed config; unknown /
  tampered nodes drop. No raw HTML/JS sink from stored docs.
- **ISR.** Don't prerender at build. Render on demand, cache with a per-site tag, `revalidateTag`
  on publish. Cheap idle sites, instant updates, no rebuild storms.
- **Preview / CSP.** Current CSP is `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` so the
  same-origin editor preview works. Keep authoring + preview on the **app origin**; only the
  published site serves on the tenant host.

---

## 6. Security & isolation

| Risk | Mitigation |
| --- | --- |
| Subdomain takeover (dangling DNS) | Require a `TXT` token before binding. On unpublish / domain removal, **atomically** de-provision the Vercel domain + clear the binding. Periodic monitor diffs bound domains vs live records. |
| XSS from authored blocks / embeds | Render only known block types. Sanitize rich text (DOMPurify). Sandbox untrusted embeds (`sandbox` iframe, minimal perms). Strict per-site CSP: `default-src 'self'`, `object-src 'none'`, embed allow-list. |
| Cross-tenant data exposure | Every read Space-scoped; the host resolver is the only host→Space map; render reads that Space alone. Postgres RLS + service-role writes stay the backstop. |
| Cross-domain auth leakage | **Public sites are anonymous.** Router skips session refresh on tenant hosts, sets no app cookie there. The dedicated sites apex keeps cookie scope off `frequency.app`. |
| Reserved / impersonating subdomains | Reserved-label list + slug format validation at claim time. |
| SSRF via server-side embeds | Resolve/render embeds client-side or via an allow-listed proxy; never fetch a user-supplied URL server-side without an allow-list. |

---

## 7. Minimizing support & maintenance (the explicit priority)

| Driver | Design response |
| --- | --- |
| Misconfigured DNS (ticket #1) | Self-serve wizard: detect apex vs subdomain, show exact copy-paste record, **auto-poll verification** with live status (Pending → Verifying → Active → Needs attention). |
| "Is it broken?" | Surface each domain's real state (verification, cert, last check) in the manage UI so operators self-diagnose. |
| Abuse / takedown | DMCA/abuse path + admin **kill switch** to unpublish a site instantly. AUP + report link on every site. |
| Runaway usage | Per-plan quotas (pages, custom domains, bandwidth) via existing entitlements. |
| Silent breakage | Per-tenant logs + a domain-health check that flags dangling / misconfigured / expiring domains before a customer notices. |
| Failure UX | Unverified / misconfigured domains show a branded "almost there" state with the fix, never a raw error. |

---

## 8. Billing & plan gating

The premium tier rides existing rails (default-deny entitlements + Stripe per-Space subscriptions).

- **Subdomain + builder**: base plan (or a modest tier) — drives adoption, ~free to serve.
- **Custom domain**: paid add-on. Reuse the `space_whitelabel` Branding gate, or add a dedicated
  `custom_domain` entitlement key (cleaner metering), written by the existing `setSpaceAddons` path.
- **Gate at bind time**: connecting a custom domain checks the entitlement; downgrade revokes it and
  **redirects** the custom domain to the subdomain (never a hard 404 for an existing visitor).
- **Stripe MCP** is not authorized in the current session — the billing slice cannot be implemented
  until it is (interactive `/mcp`).

---

## 9. Legal & compliance basics

- **Domain ownership**: the customer owns their domain + DNS; we bind only while they're a customer.
  TXT verification proves control before binding; removal is clean + immediate.
- **Content liability**: AUP + DMCA + kill switch. The customer owns their content; we retain the
  right to unpublish for abuse.
- **TLS terms**: certs are issued by the provider (Vercel / Let's Encrypt) under their terms.
- **Data / privacy**: public sites are anonymous (no visitor PII by default). Disclose any later
  analytics in the site's own policy surface.

---

## 10. Data model & migrations

All migrations are mirrored as files in `supabase/migrations/` and **never applied by hand** (one
shared DB — see `docs/WORKFLOW.md`).

| Migration | Shape | Why |
| --- | --- | --- |
| `space_domains` (new) | `id, space_id→spaces, host (unique, lower), kind: subdomain\|custom, status: pending\|verifying\|active\|error, verification_token, is_primary, created_at, verified_at` | The real domains model. Multiple domains per Space, each with verification state. Supersedes the overloaded `spaces.domain` (kept + backfilled, then retired). |
| `pages.space_id` | add `space_id→spaces` (not null, default root); drop global-unique `slug`; add `unique(space_id, slug)` | Un-gates the storage seam the code already assumes so each Space owns its own slugs. |
| template versioning | `site_templates(id, key, version, doc jsonb, block_preset, status)`; `pages.template_version` | Reproducible template-to-instance; opt-in template revisions per site. |

---

## 11. Phased roadmap

Every phase is a reviewable PR set that ships on its own (the pattern ADR-508 followed). Order
minimizes risk: data model + routing before provisioning; provisioning before the premium tier.
`P1` and `P2` can run in parallel after `P0`.

### P0 — Foundations `depends: —`

**Goal:** the schema + primitives everything else builds on. No user-facing surface.

- Migration: `space_domains` table (+ RLS: world-read active domains, service-role writes).
- Migration: `pages.space_id` (add column defaulting to root space; swap `unique(slug)` →
  `unique(space_id, slug)`), mirrored as a file.
- `lib/spaces/domains.ts` (pure): reserved-subdomain set, `isValidSubdomainLabel`, `parseHost`
  (apex-strip + label extract), `SiteHost` types. Unit-tested.
- `custom_domain` entitlement key wired into `lib/spaces/function-access.ts` + `lib/pricing/gates.ts`.
- ADR-509 (already written) + this doc.

**Acceptance:** migrations lint/apply cleanly in a branch DB; pure domain lib fully unit-tested; no
runtime behavior change (the router is not wired yet).

### P1 — Subdomains live `depends: P0`

**Goal:** a published Space renders at `slug.<sites-apex>`.

- `vercel.json` / dashboard: add the wildcard domain `*.<sites-apex>` to the project.
- `proxy.ts`: host router. Read host (`x-forwarded-host` aware); if it is a tenant host (a
  `space_domains` subdomain), rewrite to an internal `/_site/[spaceId]` render and **skip** the auth
  refresh; else fall through to the app. Fail-open to the app on any resolver error.
- `lib/spaces/store.ts`: extend `resolveSpaceForHost` to read `space_domains` (subdomain + active
  custom), not just `spaces.domain`. Keep a dual-read window over the legacy column.
- Internal render route `app/_site/[spaceId]/page.tsx` (or reuse the U4-B render path parameterized
  by resolved Space): `BlockRender` of the published doc + `getSpaceContentData`, minimal public
  chrome, brand accent.
- SEO per tenant: canonical to the tenant host, per-site `robots`, per-site `sitemap.xml`. Guard
  against duplicate indexing between `/sites/[slug]` (root) and the subdomain (canonical to the
  subdomain; `/sites/[slug]` → 301 or canonical once subdomains ship).
- Anonymous-only: no session cookie on tenant hosts.

**Acceptance:** publishing a Space shows its site at the subdomain with valid TLS; the app domain is
unchanged; a private/unpublished Space 404s; Lighthouse/SEO sane; no auth cookie on the tenant host.

### P2 — Per-Space editor `depends: P0`

**Goal:** operators build a multi-page site in the full editor.

- Un-gate `lib/page-editor/data.ts`: per-Space `EDITABLE_PAGES` resolved from the Space's own pages,
  not the root allowlist; every read/write already `space_id`-scoped.
- Editor route(s) for per-Space site pages reusing `DesktopEditor` (multi-page create / rename /
  reorder / delete, mirroring the existing profile page manager).
- `site_templates` + template gallery; template → instance seeds `pages` rows with `template_version`.
- ISR: tag each rendered site page with a per-site cache tag; `revalidateTag(siteTag)` in the publish
  action. Draft (`data`) vs published (`published_data`) already modeled.

**Acceptance:** an operator can pick a template, edit multiple pages, publish, and see changes live
within one revalidation; drafts never leak to the public site.

### P3 — Custom domains (premium) `depends: P1`

**Goal:** a paying Space connects `acme.com`, self-serve.

- `lib/vercel/domains.ts`: thin client over the Vercel Domains API (add domain, get config, verify,
  remove). Server-only, keyed by env secret.
- Domain-connect wizard: input domain → detect apex vs subdomain → show the exact record(s) + the
  `TXT` token → **auto-poll** verification → on verified, provision + wait for TLS → surface status.
- `space_domains` lifecycle: `pending → verifying → active → error`; `is_primary` selection; unpublish
  / remove **atomically** de-provisions the Vercel domain.
- Billing gate: bind checks the `custom_domain` (or `space_whitelabel`) entitlement; downgrade →
  redirect custom domain to subdomain.

**Acceptance:** a gated Space connects a real domain end-to-end without support; TLS issues
automatically; removing it leaves no dangling DNS binding; ungated Spaces cannot bind.

### P4 — Hardening & ops `depends: P3`

**Goal:** "minimal support" is actually earned.

- Per-site CSP + sandboxed embeds + rich-text sanitization.
- Abuse/DMCA flow + admin kill switch (instant unpublish); AUP + report link on sites.
- Dangling-DNS / cert-expiry monitor (a scheduled cron in `vercel.json`) that alerts the platform.
- Quotas (pages, domains, bandwidth) enforced via entitlements.
- Observability: per-tenant request logs, domain-health surfacing in `/admin`.

**Acceptance:** a security review passes; an abusive site can be killed in one action; the monitor
catches a deliberately-broken domain before a human reports it.

### P5 — Members & marketplace `depends: P2–P4`

**Goal:** generalize the surface.

- Extend the `website` surface + the render + the editor to the `user` (member) surface.
- Template versioning / a template marketplace (share + fork templates across Spaces).

**Acceptance:** a member can publish a personal site on the same rails; a template can be versioned +
reused.

---

## 12. Locked decisions (ADR-509)

| Decision | Choice |
| --- | --- |
| Subdomain apex | A **dedicated new domain** the owner registers (placeholder `frequencysites.com`), not a subdomain of `frequency.app`. |
| Custom-domain provider | **Vercel Domains API** to start; Cloudflare for SaaS held as the scale option. |
| Editor | **Extend the in-house fork** (`DesktopEditor` + `BlockRender`); do not re-adopt `@measured/puck`. |
| First audience | **Spaces** for P0–P4; members in P5. |
| Custom-domain billing key | `custom_domain` add-on (or reuse `space_whitelabel`) — final call at P3, per the pricing model. |

---

## 13. Risks & open questions

- **Vercel Enterprise economics.** Custom domains at real scale likely implies Enterprise (community
  reports ~$20–25K/yr). Model the break-even vs Cloudflare for SaaS ($0.10/host) before pricing P3.
- **ISR cross-instance revalidation.** `revalidateTag` is local per instance by default; a shared
  invalidation store may be needed so a publish propagates. Verify Vercel's managed behavior first.
- **Apex-domain UX.** A/ALIAS-vs-CNAME at the root is the biggest DNS support driver; registrar-
  specific guidance is worth extra design.
- **`spaces.domain` retirement.** One column feeds the current host resolver; migrate to
  `space_domains` with a careful backfill + dual-read window.
- **Stripe connector.** Not authorized in-session; the billing slice waits on it.
- **Bandwidth/abuse cost.** A viral/abusive tenant site draws real bandwidth; quotas + kill switch
  must land in P4, not after an incident.

---

## 14. Sources

Research basis (2023–2026), weighted to Vercel / Cloudflare / Next.js / OWASP primary docs; codebase
claims from a direct repo recon.

- Vercel — [Vercel for Platforms](https://vercel.com/docs/multi-tenant), [Custom Domains / Domains API](https://vercel.com/docs/multi-tenant/domain-management), [Platforms Starter Kit](https://vercel.com/blog/platforms-starter-kit), [plan limits](https://vercel.com/docs/plans/enterprise)
- Cloudflare — [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/), [plans & pricing](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), [SSL for SaaS GA](https://blog.cloudflare.com/cloudflare-for-saas-for-all-now-generally-available/)
- Next.js — [Multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant), [ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration), [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- OWASP — [Subdomain Takeover Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Subdomain_Takeover_Prevention_Cheat_Sheet.html), [CSP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Microsoft — prevent dangling DNS / subdomain takeover](https://learn.microsoft.com/en-us/azure/security/fundamentals/subdomain-takeover) · [MDN — CSP](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP)
- Puck — [repo](https://github.com/puckeditor/puck), [docs](https://puckeditor.com/docs/getting-started) · [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/)
