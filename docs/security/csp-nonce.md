# Nonce-based `script-src`: design and script inventory (SCAN-1243)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (row SCAN-1243, `pnpm ledger:view SCAN-1243`). This file
explains the design. The decision is [ADR-1954](../DECISIONS.md). How to turn it on and off is
[`RUNBOOKS.md` "Nonce-based script policy"](../RUNBOOKS.md).

## The answer

- The member app (every page rendered under `app/(main)`) can drop `'unsafe-inline'` from `script-src`. It is already
  rendered per request, so a nonce costs it nothing.
- The static pages (marketing, discover, help, share pages, Space websites, sign-in, join) **cannot**, without becoming
  dynamic. They keep today's policy, `'unsafe-inline'` included.
- It ships in two steps behind two switches, both off by default: `CSP_NONCE_REPORT_ONLY` (the test run) and
  `CSP_NONCE_ENFORCE`. With both blank the site sends byte for byte what it sent before.

## What Next.js 16 supports (read from `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, Next 16.4.3)

| Option | What the doc says | Verdict here |
|---|---|---|
| Nonce from the proxy | "you **must use dynamic rendering to add nonces**". Static optimization and ISR are disabled for a page that carries one, and Partial Prerendering is incompatible. Next reads the nonce from the request's `Content-Security-Policy` header and stamps its own scripts. | Used, on per-request routes only. |
| Nonce on static pages | Not possible: "Static pages are generated at build time, when no request or response headers exist, so no nonce can be injected." | Not available. |
| `experimental.sri` (hash-based, Subresource Integrity) | Experimental. Adds `integrity` to the script **files**. "Build-time only: cannot handle dynamically generated scripts." | Does not remove `'unsafe-inline'`: the App Router's streamed RSC payload is a set of **inline** scripts whose text differs per page and per ISR regeneration, and SRI does not cover inline scripts. Hashing them would mean a different header per page per regeneration. Not used. Also an experimental flag on the build that has already hit its memory ceiling (`DEPLOY-SAFETY.md`). |
| Hash sources for inline scripts | Not a Next feature; plain CSP. Works for an inline script whose text is a constant. | Used for the five constant scripts below. |

So no design removes `'unsafe-inline'` from static pages without making them dynamic. That is stated plainly rather than
worked around: turning the marketing pages dynamic would break the cache and build budgets this site runs on.

## Which routes get the nonce

A page gets the strict policy only when **all** of these hold (`nonceCspFor` in `lib/security/csp-nonce.ts`):

1. A switch is on.
2. The request is a full page load: a `GET` with no `rsc` and no `next-action` header. A client navigation or a Server
   Action response is not a document, so a policy on it would do nothing.
3. The path the app renders is a member-app page (`isNonceRoute`). The proxy asks about the path **after** its own
   rewrites: a signed-in member on `/events/<slug>` is rewritten to `/events/<slug>/full`, which is a member page, while
   a signed-out visitor on the same address gets the ISR share page and no nonce.

Why `app/(main)` is safe: its layout calls `headers()` before anything else on every render, so every page under it is
already a per-request render. Adding a nonce there turns nothing dynamic that was static.

`lib/security/csp-nonce-routes.test.ts` walks `app/` and fails when a page outside `app/(main)` matches the rule, when a
page inside it does not, when the layout stops reading the request first, or when a member page opts into static
rendering.

## What stays on `'unsafe-inline'`, and why

- **Every static and ISR page**, for the reason above. This is most public traffic. For those pages the row's finding
  stands; the mitigations are the ones the audit already listed (sanitizers on every `dangerouslySetInnerHTML` sink).
- **`style-src`** on every page. The row is about scripts. The member shell writes a per-request theme `<style>` and
  libraries set inline styles; a style nonce is a separate change.
- **The enforced header in `next.config.ts`** itself is untouched. It is still the policy for every static page, and
  during the test run it is still the enforced policy on member pages too.

## Inventory: every script a member page runs, and how the strict policy allows it

| Script | Where | Allowed by |
|---|---|---|
| Next bootstrap, Turbopack chunks, streamed RSC payload (`self.__next_f.push`), Suspense reveal scripts | Next / React | **Nonce.** Next stamps it on every script it emits when the request carries the policy header. |
| Chunks loaded later (dynamic `import()`, route chunks) | Turbopack runtime, appended with `createElement` | **`'strict-dynamic'`**: a script added by an already-trusted script is trusted. |
| Theme bootstrap (`THEME_BOOTSTRAP_SCRIPT`) | `app/layout.tsx` | **Hash.** Constant string. |
| Install prompt capture (`INSTALL_CAPTURE_SCRIPT`) | `app/layout.tsx` | **Hash.** Constant string. |
| Popover dismiss (`POPOVER_DISMISS_SCRIPT`) | `app/layout.tsx` | **Hash.** Constant string. |
| Analytics head script (GA4 loader, or the first-party policy wrapper when GA is off) | `app/layout.tsx` via `components/analytics/google-analytics.tsx` | **Hash**, from `lib/consent/analytics-head.ts`. See the open question below. |
| Side pre-paint (`SIDE_PREPAINT_SCRIPT`) | `components/frequency/site/shell/site-root.tsx`, rendered on the signed-out views inside the member tree | **Hash.** Constant string; `lib/ui/side-prepaint.ts` restates it and a test holds the two equal. |
| Generation stamp (`data-generation`) | `app/(main)/layout.tsx` | **Nonce.** Its text varies per member, so the layout reads `x-nonce` (it already reads `headers()`). |
| JSON-LD (`<script type="application/ld+json">`) | `components/json-ld.tsx` | **Nothing needed.** A script element whose type is not JavaScript is a data block. The browser never prepares it for execution, and CSP's inline check happens in that step, so it is never checked and never reported. |
| GA4 / Google Ads (`https://www.googletagmanager.com/gtag/js`) | Appended by the hashed analytics script | **`'strict-dynamic'`.** Its `connect-src` hosts are unchanged. Google Ads has no tag of its own here: the conversion is imported from GA4. |
| Stripe.js (`https://js.stripe.com`) | Appended by `@stripe/stripe-js` (`lib/billing/stripe-browser.ts`) | **`'strict-dynamic'`.** Elements are iframes (`frame-src`, unchanged); its workers are blobs (`worker-src`, unchanged). |
| Google Maps loader (`https://maps.googleapis.com`) | Appended by `lib/maps/google-loader.ts`, only with a browser key | **`'strict-dynamic'`.** The scripts the loader appends in turn are trusted the same way. |
| Vercel Web Analytics (`/_vercel/insights/script.js`) | Appended by `@vercel/analytics` | **`'strict-dynamic'`.** |
| Sentry | Bundled in the app's own chunks; no script is fetched from a CDN | Nonce / `'strict-dynamic'` with the chunks. Its `connect-src` host is unchanged. |
| MapLibre worker (`/maplibre/maplibre-gl-worker.mjs`) | Self-hosted worker | `worker-src 'self' blob:`, unchanged. |
| `next/script` | Not used anywhere in `app/`, `components/`, `lib/` or `modules/` | Nothing to do. Note for later: an inline `next/script` with the default strategy is created on the client and does **not** inherit the nonce; pass `nonce` explicitly if one is ever added. |
| Vercel preview toolbar (`https://vercel.live`) | Injected by Vercel into preview HTML only | **Not allowed** by the strict policy (no nonce). Expected report on previews; under enforcement the toolbar will not load on member pages of a preview. Production does not have it. |

`'self'` and the host list stay in the strict `script-src`. A browser that implements `'strict-dynamic'` ignores them; one
that does not falls back to them plus the nonce. No browser gets a wider policy than today's.

The older note in `next.config.ts` ("a nonce-based script-src WILL break this loader", for Maps and Stripe) was written
for a nonce **without** `'strict-dynamic'`. With it, a script appended by trusted code needs no nonce of its own. The test
run is what confirms that on real traffic.

## Reports

The strict policy posts to the existing sink, tagged: `report-uri /api/csp-report?policy=nonce`. The route logs
`csp.violation` with `policy` (`nonce` or `enforced`), the browser's `disposition`, the `source` file and a `sample` (the
strict policy asks for one with `'report-sample'`, so a blocked inline script is identifiable). No new service.

## Open questions the test run answers

Not verified in this change, and said so:

1. **The analytics script's hash across bundles.** That script embeds three functions with `Function.prototype.toString()`.
   The proxy computes the hash in its bundle; the page renders the script from the server bundle. If the bundler prints
   those functions differently in the two, the hash will not match and the script is reported (test run) or blocked
   (enforced). The three other root scripts and the side script are plain strings and cannot differ.
2. **Not-found pages under a member path.** A URL no route matches (`/feed/nothing-here`) is answered at routing time,
   possibly from the prerendered not-found page, which has no nonce. Under enforcement that page would render but not
   hydrate. The report shows these as inline blocks on a 404 address.
3. **A real browser run.** The header builder, the route rule and the proxy wiring are unit-tested. No page was loaded in
   a browser with the policy on: the local dev server does not start in an agent worktree. Step 3 of the activation gate
   is that run.
4. **Which header wins on Vercel when the proxy and `next.config.ts` both set `Content-Security-Policy`.** In Next's own
   server the proxy's value replaces the config's (`next/dist/server/lib/router-utils/resolve-routes.js`). If Vercel sent
   both instead, a browser applies both and a script must pass each; every script the strict policy allows is also
   allowed by today's, so either outcome is safe.
