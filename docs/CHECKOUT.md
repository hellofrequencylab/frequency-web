# Embedded checkout — the standard for every money surface

**Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), not here.** This document explains
how an embedded checkout is built and why; whether a given creator is converted is a backlog row
(`LIVE-359`). Prose cannot be verified, so it does not keep score.

A buyer pays **on Frequency**. The card fields open under the button they pressed, the payment
resolves in place, and a confirmation replaces the form. Nobody is sent to `checkout.stripe.com`
unless that is the only way they can pay.

There are nine Checkout Session creators in this repo. They must not be nine integrations.

---

## 1. The shape, in one table

| Layer | File | What it owns |
| :--- | :--- | :--- |
| **The seam** | `lib/billing/checkout-ui.ts` | The two Stripe asymmetries and the degrade. Entity-blind. |
| **Saved cards** | `lib/billing/saved-card.ts` | Customer resolution, fail-closed, and the parameter retry. |
| **The browser** | `lib/billing/stripe-browser.ts` | One memoised Stripe.js load, a watchdog, and the warm-up. |
| **The form** | `components/billing/checkout-{panel,form}.tsx` | Entity-blind. Takes a client secret, renders the card fields. |
| **The creator** | `lib/billing/*.ts`, `lib/commerce/checkout.ts` | Prices the thing, records its pending row, asks the seam for a session. |
| **The action** | a `'use server'` module per surface | Decides whether the browser can mount a form, and hands back exactly one of two shapes. |
| **The control** | the buy button | Branches on what ARRIVED, renders the panel, and can always escape to hosted. |

---

## 2. Adding a creator — the whole recipe

**1. Take a `ui` option, default hosted.**

```ts
ui?: CheckoutUi                                     // 'hosted' | 'elements'
const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'
```

Defaulting to hosted is what makes this safe to land creator by creator: every existing caller keeps
today's behaviour until it opts in.

**2. Route BOTH halves through the seam.** Never hand-write the fields.

```ts
...checkoutReturnFields(ui, { successUrl, cancelUrl }),   // in the create call
return resolveCheckoutSession(session, ui, 'tips')        // at the return
```

**3. Return the client secret through the action, and let the control branch on it.**

```ts
if (r.error) return fail(r.error)
if (r.clientSecret) return ok({ clientSecret: r.clientSecret })
if (!r.url) return fail('Could not start checkout.')
return ok({ url: r.url })
```

**4. Ask for the on-page form only when the browser can mount it.**

```ts
ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
```

**5. Render the panel, warm Stripe on intent, and pass `forceHosted` in the fallback.**

That is the change. If it is longer than that, the seam is being bypassed.

---

## 3. The five things that have actually gone wrong

Each of these shipped or nearly shipped. They are the reason the seam exists.

### 🔴 `!session.url` is TRUE for every on-page session

`createCommerceCheckout` guarded its order-linking step on `!session.url`. An `elements` session
returns `url: null` **by design**. Turning the form on without touching it would have marked every
commerce order `failed` and expired a session the buyer was about to pay — while typechecking
perfectly.

**Rule:** post-create bookkeeping asks `resolveCheckoutSession` whether there is anything to hand
back. It never asks about the URL.

### 🔴 A fallback that re-asks for the form that just failed

Every control has an `onFellBack` escape. Each one called its action again — which re-read the
publishable key, found it set, and issued **another** elements session. The control looked for a
redirect URL, found none, and dead-ended the buyer. Two Stripe sessions and two pending rows per
attempt, and no route to paying.

**Rule:** a fallback passes `forceHosted: true`. Enforced by
`components/billing/onpage-callers.test.ts`.

### 🔴 The two waits were SEQUENTIAL

Nothing asked for Stripe.js until a client secret existed to render, so the buyer waited for the
server to build a session **and then** for the script.

**Rule:** `warmStripeBrowser()` on intent (hover / focus / touch) and again at the top of the click
handler. It stays intent-driven, never on mount: `@stripe/stripe-js/pure` exists so a third-party
script is not fetched for every visitor who opens a page.

### 🔴 Status values are not shared between tables

`space_donations` accepts `abandoned`. `event_tickets` and `tips` do **not** — they take `failed`.
Copying one abandon arm to another table is a check-constraint violation at runtime.

**Rule:** read the live constraint before writing a status value. The compiler cannot help.

### 🔴 The compiler cannot help AT ALL on the Stripe side

The `stripe` package ships **no type declarations**. `Stripe.*` is `any` throughout. A wrong enum, a
rejected parameter or a misspelled field is a **runtime** failure in a money path.

**Rule:** anything uncertain gets a retry that drops the uncertain part rather than the sale — see
`createAllowingSavedCard`. And the degrade is always LOUD.

---

## 4. The degrade ladder

The on-page form is an **enhancement over a working redirect**. Every way it can fail ends with a
buyer who can still pay:

| Failure | What happens |
| :--- | :--- |
| No publishable key | The server never asks for elements. Hosted, as before. |
| Stripe returns no client secret | `resolveCheckoutSession` logs and returns the hosted URL. |
| Stripe.js will not load (blocked, offline, 10s watchdog) | `onFellBack` → the action again with `forceHosted` → hosted page. |
| `confirm()` throws | Same escape. |
| A saved-card parameter is rejected | One retry without it. The convenience is dropped, never the sale. |

Every rung logs. A silent degrade would read as "on-page checkout is live" while every buyer was
quietly being redirected.

---

## 5. Saving a card

A card can only be saved against a Stripe **customer**, and before `LIVE-362` no one-time creator
attached one.

- **Fail closed on the read.** A PostgREST failure arrives in `error`, not as a throw. Treating an
  unreadable row as "no customer yet" mints a **second** customer for a member who already had one,
  and that split is permanent: subscriptions, invoices, saved cards and the billing portal land on
  two customers with nothing able to say which is theirs. Refusing costs one retryable purchase.
- **A guest gets nothing.** No profile to hold an id, and `customer_email` cannot coexist with
  `customer`.
- **Write the minted id back on settle**, guarded on the column still being null so it can only ever
  fill a gap.
- **Stripe renders the checkbox**, so the regional consent wording it must show comes with it.

---

## 6. What enforces this

| Guard | What it fails |
| :--- | :--- |
| `components/billing/onpage-callers.test.ts` | A caller that reads only one shape · a fallback with no `forceHosted` · a control that mounts the form without warming Stripe · a module that asks for elements without reading `clientSecret` |
| `lib/billing/checkout-kind-contract.test.ts` | A creator with no `metadata.kind`, or a kind with no recorder |
| `lib/billing/receipt-address.test.ts` | A creator that resolves no address for the payer |
| `lib/billing/take-rate-ladder.test.ts` | A fee-receipt write that could fail a live sale |
| `LIVE-359`'s probe | Names every creator still redirecting |

⚠️ **Every one of these guards has passed a mutation it should have caught at least once**, by
matching a name in a comment, an import line, a type annotation, a function definition, or the file
rather than the function. **Match the ACT — `foo(` — never the identifier**, and blank comments
first.

---

## 7. Money mail

Every loop sends a first-party receipt to the payer and a notice to the earner, from the settle, via
the durable outbox. None can fail the sale (module-level try/catch, `sendMoneyReceipt` returns
`false`, and the call sites add `.catch()` anyway).

Two things to know:

- **`emailShell` is not exported**, so only the ticket receipts carry the brand shell. Tip, donation
  and order receipts render a bare `<div>` with no document, logo, footer or unsubscribe. Same
  product, two visual identities.
- **A missing `RESEND_API_KEY` loses every receipt silently.** `sendRawEmail` returns `{ id: null }`,
  the outbox job succeeds, and the message is gone — one `console.warn` is the only trace.

---

## 8. What is not converted yet

The four **subscription** creators still redirect, deliberately. They stamp
`subscription_data.metadata`, and `lib/billing/space-subscriptions.ts` reads `space_id` / `member_id`
/ `tier_id` / `plan` back off it to grant entitlement. A dropped or reshaped key there does not fail
a build — it **silently stops granting access to someone who paid**. Convert them with that in front
of you, and prove the metadata round-trips before anything else.
