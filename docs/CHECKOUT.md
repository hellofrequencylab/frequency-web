# Embedded checkout — the standard for every money surface

**Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), not here.** This document explains
how an embedded checkout is built and why; whether a given creator is converted is a backlog row
(`LIVE-359`). Prose cannot be verified, so it does not keep score.

A buyer pays **on Frequency**. The card fields open under the button they pressed, the payment
resolves in place, and a confirmation replaces the form. Nobody is sent to `checkout.stripe.com`
unless that is the only way they can pay.

There are eight Checkout Session creators in this repo, enumerated by `LIVE-359`'s probe — the
list to trust, because this line said *nine* until the Supporter contribution was retired. They
must not be eight integrations.

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
if (r.clientSecret) return ok({ clientSecret: r.clientSecret, sessionId: r.sessionId })
if (!r.url) return fail('Could not start checkout.')
return ok({ url: r.url })
```

**4. Ask for the on-page form only when the browser can mount it.**

```ts
ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
```

**5. Render the panel, warm Stripe on intent, and pass `forceHosted` in the fallback.**

**6. Settle from your own success handler.** Write a `settle<Thing>Action(sessionId)` that calls your
recorder's `record<Thing>FromSessionId`, and pass it as `onPaid`:

```ts
onPaid={sessionId ? () => settleTicketAction(sessionId) : undefined}
```

Without it your confirmation is a promise nothing has made true — see §3. The action needs no
session gate (the payer may be a guest) and must never be fatal: a thrown reconcile behind a
successful charge would send someone who already paid back to pay again.

That is the change. If it is longer than that, the seam is being bypassed.

---

## 3. The six things that have actually gone wrong

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

### 🔴 The path that keeps the buyer here is the one the backstop never covered

`confirm({ redirect: 'if_required' })` is the whole feature: a card that needs no extra step resolves
in place. It also means the buyer **never navigates**. So the session's `return_url` — carrying
`session_id={CHECKOUT_SESSION_ID}` and written as the webhook's backstop — is visited only on the
rare redirect (3DS, a bank app), and the reconcile behind it was unreachable on the path that had
become the default. An on-page purchase had **one** way to become real, behind a confirmation panel
that had already promised a ticket and a receipt.

**Rule:** the seam hands `sessionId` back with the `clientSecret`, and the control passes a settle to
`CheckoutPanel` as `onPaid`. The panel **awaits** it before confirming. Both settles are safe to run
— the settle is one conditional `update … where status = 'pending' returning …`, so whichever
arrives second flips nothing and sends nothing. The webhook stays the guarantee
([ADR-1377](DECISIONS.md)). Commerce, tips and Space gifts use the same `onPaid` path
([ADR-1407](DECISIONS.md), `LIVE-367`).

### 🔴 The compiler cannot help AT ALL on the Stripe side

The `stripe` package ships **no type declarations**. `Stripe.*` is `any` throughout. A wrong enum, a
rejected parameter or a misspelled field is a **runtime** failure in a money path.

**Rule:** anything uncertain gets a retry that drops the uncertain part rather than the sale — see
`createAllowingSavedCard`. And the degrade is always LOUD.

---

## 3b. The buyer-facing contract — eight states, one screen area

The owner specified this after buying on a live event ([`LIVE-366`](BUILD-BACKLOG.json),
[ADR-1377](DECISIONS.md)). It is the layout every checkout control composes, not a per-surface
choice.

| # | State | Where it lives |
| :-- | :--- | :--- |
| 1 | The **button leads** and names its price: `Get tickets - $44` | the control |
| 2 | A row of **card marks** sits under the button | `components/billing/payment-marks.tsx` |
| 3 | The options (tiers, amount) sit under the marks | the control |
| 4 | Pressing the button opens the card layer **between** the button and the marks, pushing both it and the options **down** | the control's render order |
| 5 | The trigger goes **quiet** while open, and still folds the drawer back up | the control |
| 6 | Every payment method is in that one layer | `checkout-form.tsx` — `layout: accordion`, `defaultCollapsed: false` |
| 7 | It ends in a **confirmation with a close button** | `checkout-panel.tsx` |
| 8 | The receipt and the seller notice are already queued | §7, and the settle in §3 |

Four things that are easy to get wrong and are each pinned by a test:

- **The trigger goes quiet for a reason, not for decoration.** With the layer open, Stripe renders
  its own amber "Pay $44". Two stacked amber buttons is the screen the owner called confusing, so
  only one control on screen moves money and while the drawer is open it is Stripe's. A **greyed
  control that does nothing** is worse than no control, so the quiet one collapses the drawer.
- **Collapsing keeps the session.** Re-opening is then instant AND reserves no second seat.
- **Changing the price drops it.** A form built for $44 must never sit under an $88 button, so
  selecting another tier or editing the amount invalidates the session.
- **A price in a CTA is a promise.** Where there is no price this control may charge — a free tier,
  a members ticket the viewer cannot buy — it names no number at all.

`appearanceFromTokens()` draws Stripe's fields from the live CSS custom properties with **no hex
fallbacks**, and removes the `.Block` stroke around the Link / saved-card panel. A stroke there puts
a box inside the card the layer already lives in.

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
| Physical goods in the cart (LIVE-346) | Hosted Checkout, which collects a validated shipping address. The on-page form has no Address Element. Digital / Journey / booking stay on-page. |

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
| `app/(main)/events/[slug]/ticket-button.states.test.tsx` | The eight states, by DOCUMENT POSITION: marks above the button · no price in the label · a session reused across a collapse · a session surviving a tier change |
| `components/billing/checkout-panel.settle.test.tsx` | A confirmation shown before the settle resolves · a thrown settle reaching the buyer · a confirmation with no close control |
| `app/(main)/events/[slug]/ticket-actions.settle.test.ts` | A settle with no kill switch, no shape check, no limiter, or one that turns a reconcile failure into an error after a charge |
| `LIVE-366`'s probe | A seam that stops handing back `sessionId` · a door mounting the panel with no settle · card marks hoisted above the button |

⚠️ **Every one of these guards has passed a mutation it should have caught at least once**, by
matching a name in a comment, an import line, a type annotation, a function definition, or the file
rather than the function. **Match the ACT — `foo(` — never the identifier**, and blank comments
first.

---

## 7. Money mail

Every loop sends a first-party receipt to the payer and a notice to the earner, from the settle, via
the durable outbox. None can fail the sale (module-level try/catch, `sendMoneyReceipt` returns
`false`, and the call sites add `.catch()` anyway).

Three things to know:

- **`emailShell` is THE wrapper, and it is exported.** Compose your body, hand it there, and a tip
  receipt is the same object as a ticket receipt. It used to be private, and three money modules
  each hand-rolled a bare `<div>` with no document, logo or footer.
- **A receipt passes `RECEIPT_FOOTER`** ([ADR-1376](DECISIONS.md)). The shell's default footer says
  the reader joined Frequency, which is false for a signed-out donor and for every guest payer, and
  it is the one line a confused recipient acts on — by marking it spam. A receipt is also
  transactional, so it carries no unsubscribe control; the sender address line stays, because that
  is the part CAN-SPAM does not exempt.
- **A missing `RESEND_API_KEY` loses every receipt silently.** `sendRawEmail` returns `{ id: null }`,
  the outbox job succeeds, and the message is gone — one `console.warn` is the only trace.
- **Mail is queued, not sent.** `enqueueEmail` writes a `notification_queue` row; `/api/cron/process-queue`
  drains it every two minutes (`vercel.json`). Expect a receipt inside ~3 minutes. Later than that
  and the problem is upstream of the queue.

---

## 8. What is not converted yet

The **subscription** creators that remain still redirect, deliberately. `LIVE-359`'s probe names
which ones, and this paragraph deliberately does not: it read *four* from the day Space
memberships converted (2026-09-15) to the day someone checked (2026-09-19), and a count in prose
is the thing this repo keeps getting wrong. They stamp
`subscription_data.metadata`, and `lib/billing/space-subscriptions.ts` reads `space_id` / `member_id`
/ `tier_id` / `plan` back off it to grant entitlement. A dropped or reshaped key there does not fail
a build — it **silently stops granting access to someone who paid**. Convert them with that in front
of you, and prove the metadata round-trips before anything else.
