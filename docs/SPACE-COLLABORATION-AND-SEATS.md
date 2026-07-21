# Operator seats + collaborator spaces (plan of record)

Two DIFFERENT capabilities an operator asked for. They are not the same system and must not be
conflated. Owner decisions captured 2026-07-21; ADR-799.

| | Operator seats (A) | Collaborator spaces (B) |
|---|---|---|
| What | *People* who help run YOUR space's back end | *Separate businesses* operating inside your venue/event |
| Unit | a person + a role (editor/moderator/admin) | a whole other space (its own owner, members, billing) |
| Who pays | YOU pay per operator head | the collaborator pays for THEIR OWN space; hosting is FREE |
| Mechanism | the existing seat wall + per-seat billing | a NEW space to space relationship |
| Example | a manager who edits your offerings | Royal Temple (venue) hosting independent practitioners' businesses |

Both features' management surfaces live under the space console **Profile & Settings** (owner directive).

---

## A. Operator seats

**Status of the machinery:** the seat COUNTING + ENFORCEMENT half is already built and tested
(`lib/spaces/seats.ts`): `licensedSeats(seatQuantity) = BASE_SEAT_ALLOWANCE(1) + seat_quantity`; adding an
active `editor`/`moderator`/`admin` member consumes a seat; `createInvite` + `acceptInvite` both call
`checkSeatForOperatorInvite`, gated on `billingLive()` (grant-all while off). What is MISSING is only the
**billing loop** that turns a paid quantity into `spaces.seat_quantity`.

**Decision (owner):** operator seats are a **per-seat add-on on paid plans**. The owner's seat is free
(BASE_SEAT_ALLOWANCE = 1); each additional operator is a flat `$/seat/mo`. Free spaces stay owner-only.

**Build:**
1. A real per-seat catalog item `operator_seat` (`perSeat: true`) in `lib/billing/pricing-keys.ts` (a
   Stripe product with list/founding × month/year prices, synced like the others). **The price is a
   one-line amount the owner sets; the code ships with a placeholder until the Stripe price is synced.**
2. `catalogKeysForLoadout` includes `operator_seat` with `perSeat: true` when the owner's chosen seat
   count > 0 (the checkout already threads `seatQuantity` onto the line item's quantity).
3. `reconcileSpacePlanSubscription` writes `spaces.seat_quantity` back from the `operator_seat` item's
   quantity (this is the CORRECT version of the reverted ADR-465 attempt: keyed on a REAL per-seat item,
   not the retired flat plan items).
4. An "add / remove operator seat" owner action that adjusts the quantity (re-checkout / Stripe quantity
   update), wired to the existing `SeatCounter` UI (its button is currently inert).
5. **Profile & Settings:** the Team surface (`space.people`) gains the seat counter + "Add operator"
   control, so managing operators and their seats is one place.

Dark while `billingLive()` is off; nothing charges until billing is on AND the Stripe price is synced.

---

## B. Collaborator spaces

**Status:** greenfield. There is NO space to space relationship in the schema today (only
`space_follows`, space to profile). The pattern to mirror is `event_placement_requests`
(request to the other side's steward, who approves).

**Decisions (owner):**
- **Scope (v1 target): FULL shared operations** phased as B1 to B3 below.
- **Initiation: either side, the other approves** (a host invites a collaborator space, OR a business
  requests to join a host; the other side's owner/admin confirms). Gated on `getSpaceCapabilities` for
  both sides.
- **Billing: FREE to host.** The collaborator pays for their own space; hosting costs the host nothing.

**Data model:** a new `space_collaborations` join table:
`host_space_id`, `collaborator_space_id`, `status` (pending/approved/declined/ended), `invited_by_space_id`
(which side initiated), `role`/scope flags for the phased capabilities, timestamps. Unique
`(host_space_id, collaborator_space_id)`. A host is just a `business` space (no new `SpaceType`); a Focus
mode preset can frame a venue.

**Phasing:**
- **B1 (foundation):** the table + either-side invite/approve/decline/end actions + a "Collaborators"
  block on the host profile (via the metadata-injection block system in `space-landing.tsx`, rendering
  `space-card.tsx`) with a back-link on the collaborator. **Profile & Settings:** a "Collaborators"
  management surface (invite, review requests, list, remove).
- **B2 (shared events):** a collaborator's events/offerings can appear on the host's event/venue page
  (extends the single `events.space_id` tenancy to surface approved collaborators' events on the host).
- **B3 (shared venue calendar/booking):** collaborators book time/rooms at the host venue (a shared
  availability layer over the existing booking engine).

---

## C. Topic mutes (the pre-existing note)

The contact preference center offers `marketing` / `events` / `dispatches` topic mutes, but only
`marketing` is enforced on the contact-scoped send path (`lib/spaces/email.ts`, hardcoded). Give a space
email a **topic** the operator picks in the composer (Marketing / Event update / Announcement), stored on
the send, and gate each send on that topic's mute (replacing the hardcoded `marketing`). The `subscribed`
consent requirement stays for all; the mute is the extra per-topic layer. No cross-scope broadcast work
(the profile-scoped dispatch/event notification paths keep their own preference system).

---

## Sequencing

1. This doc + ADR-799 (plan of record).
2. A — operator seat billing loop + Team/seat controls in Profile & Settings.
3. B1 — the collaboration relationship + listing + a Collaborators surface in Profile & Settings.
4. C — topic-tagged space emails.
5. B2 — collaborator events on the host venue page.
6. B3 — shared venue calendar/booking.

Each ships as its own reviewable PR. Money- and tenancy-sensitive steps (A, B) get an adversarial verify
pass before merge.
