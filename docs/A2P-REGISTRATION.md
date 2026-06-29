# Twilio A2P 10DLC registration: brand + campaign packet

> **Status: ⏳ Not started. This is the operator's filing packet.** A2P 10DLC is the
> long pole for SMS in the CRM overhaul: nothing texts a US number until a brand and a
> campaign are approved and the env flags are set. Carrier review runs ~10 to 15 days,
> so this clock starts in **Phase 0** and blocks the SMS card-scan nudge (**Phase 2**)
> and 1:1 SMS (**Phase 5**). This doc is the prep so a human can file the registration;
> it does not change any code. Source of truth for the gate: `lib/comms/sms.ts` (ADR-256).

## TL;DR (what to do)

| Step | Who | Status |
|---|---|---|
| 1. Gather the legal + business facts (§2) | Operator | ⏳ |
| 2. Stand up the **terms of service** page (privacy is already live) (§6) | Eng | 🔴 blocker, see §6 |
| 3. Register the **brand** in Twilio (EIN-backed) (§3) | Operator | ⏳ |
| 4. Register the **campaign** with the in-voice sample messages (§4) | Operator | ⏳ |
| 5. Wait out carrier review (~10 to 15 days) | — | ⏳ |
| 6. Set the env flags in Vercel (§5), gate flips open | Eng | ⏳ |

The gate is **fail-closed**: `sendSms()` refuses every send until all of
`SMS_PROVISIONING_ENABLED`, `SMS_A2P_BRAND_ID`, `SMS_A2P_CAMPAIGN_ID`, and
`TWILIO_MESSAGING_SERVICE_SID` are present (§5). Nothing the operator does in Twilio
sends a message until those flags land.

## 1. Why this is mandatory, and the one-brand decision

A2P 10DLC (Application-to-Person, 10-Digit Long Code) is the US carrier registration
regime for any application sending SMS to US numbers. It is **not optional**: unregistered
traffic is filtered or blocked, and unconsented sends carry TCPA statutory damages of $500
to $1,500 per message (the reason `lib/comms/sms.ts` is built refuse-first). As of
**2026-06-30**, carriers require a **live, public privacy policy URL and terms of service
URL** on the campaign or the campaign is rejected.

**One brand, one number, for the whole platform.** Every platform SMS (account
notifications + the one-time card-scan invite) sends under **one Frequency brand and one
Messaging Service**. Own-number / per-Space registration is **reserved for the Business
Space tier and is out of scope here** (a later phase). File one brand and one campaign now.

## 2. What the operator must gather (fill this in)

> Do not invent these values. The placeholders below are not real. The operator fills the
> right column from the company's incorporation documents before filing.

| Field | Twilio asks for | Value (fill in) |
|---|---|---|
| Legal entity name | Exact registered legal name (must match IRS records) | `Frequency Labs Holdings` (confirm exact registered form) |
| Business type | LLC / C-Corp / S-Corp / etc. | `[fill in]` |
| EIN / business registration no. | US Federal Tax ID (EIN), digits only | `[fill in]` |
| Country of registration | | `United States` |
| Registered business address | Street, city, state, ZIP on the EIN record | `[fill in]` |
| Website | Public marketing site (must be live) | `https://frequencylocal.com` |
| Brand vertical / industry | Twilio picklist (e.g. "Technology", "Membership/Community") | `[fill in]` |
| Authorized contact name | A real person who can attest to the registration | `[fill in]` |
| Authorized contact email | Reachable business email | `[fill in]` |
| Authorized contact phone | | `[fill in]` |
| Support email/phone for members | Shown to recipients; goes in HELP reply | `[fill in]` |
| Stock symbol + exchange | Only if publicly traded | `[N/A]` |

**Use-case + volume facts (for the campaign, §4):**

| Field | Value (fill in) |
|---|---|
| Use-case classification | **Mixed** (account notifications + the one-time card-scan invite). NOT a marketing stream. |
| Expected daily message volume | `[fill in: low to start, e.g. < 1,000/day]` |
| Opt-in method | Web form, single unchecked consent checkbox (§4) |
| Help / support contact | `[fill in: matches support email above]` |

## 3. Brand registration (Twilio console)

Path: **Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC → Brands → Register
a Brand** (Twilio relabels this occasionally; the "Trust Hub / A2P 10DLC" area is the home).

- [ ] Create / confirm the **Customer Profile (Business Profile)** with the §2 legal facts.
- [ ] Submit a **Standard brand** (EIN-backed). Standard brands get higher throughput and
      lower per-message carrier fees than a Sole Proprietor brand, and unlock the Standard
      campaign vetting needed for notification + invite traffic.
- [ ] Enter the EIN, legal name, and address **exactly as on the IRS record**. A mismatch
      is the most common cause of brand rejection and a re-vet fee.
- [ ] Name the authorized contact (a real attesting person, §2).
- [ ] Pay the one-time brand registration fee and submit.
- [ ] Record the returned **Brand SID** → this becomes `SMS_A2P_BRAND_ID` (§5).
- [ ] (Optional but recommended) Request **external secondary vetting** if higher throughput
      is needed; it raises the trust score. Not required for the launch volume in §2.

## 4. Campaign registration

Path: **A2P 10DLC → Campaigns → Create a Campaign**, attached to the approved brand and to a
**Messaging Service** (create one if absent: **Messaging → Services**; its SID becomes
`TWILIO_MESSAGING_SERVICE_SID`).

- [ ] **Use-case: Mixed** (also called "Low Volume Mixed" if the §2 volume is low). This is
      **transactional notification + a one-time invite**, not a recurring marketing stream.
      Pick the Mixed use-case, not Marketing.
- [ ] Campaign description (plain, accurate): *"Frequency sends members account
      notifications (event updates and group messages they asked to receive) and a single
      one-time invitation to a person whose contact card a member added, inviting them to
      claim their own Frequency card. Recipients opt in on the web and can reply STOP at any
      time."*
- [ ] Attach the **sample messages** below (carriers compare live sends against these).
- [ ] Attach the **opt-in description** below.
- [ ] Confirm **STOP/HELP** behavior is enabled on the Messaging Service.
- [ ] Provide the **privacy policy URL** (`https://frequencylocal.com/privacy`, live) and the
      **terms of service URL** (see §6, must be live before submitting).
- [ ] Submit and record the returned **Campaign SID** → `SMS_A2P_CAMPAIGN_ID` (§5).

### 4a. Sample messages (in Frequency voice, no em dashes)

These are the literal samples to paste into the campaign, and they must match what the app
actually sends. Each carries sender identity and a clear opt-out, per carrier rules. They
pass the CONTENT-VOICE §10 checklist: plain sentences, no narrated feelings, no hype words.

**1. The one-time card-scan invite (the Phase 2 nudge).** Sent once to a person a member
added; not a recurring stream.

> Frequency: Dana added you to their contacts after you met. Want your own Frequency card so
> people can save you the same way? Here you go: frequencylocal.com/c/dana. Reply STOP to opt
> out.

**2. Opt-in confirmation (sent right after a person opts in).**

> Frequency: You're set to get texts from us. We'll only send what you asked for, like event
> updates from your Circle. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

**3. An account notification (an Event Dispatch sent as a text the group, ADR-255).**

> Frequency: Your Circle meets tonight at 7. Bring nothing. Reply STOP to opt out.

**4. STOP auto-reply (carrier-handled; sample for the campaign form).**

> Frequency: You're opted out and won't get more texts from us. Reply START to opt back in.

**5. HELP auto-reply (carrier-handled; sample for the campaign form).**

> Frequency: This is Frequency. For help, email [support email] or visit frequencylocal.com.
> Msg & data rates may apply. Reply STOP to opt out.

> Naming note: "Circle" and "Event Dispatch / text the group" are the canon terms
> (`docs/NAMING.md`). The card-scan invite is the Phase 2 viral-loop nudge from
> `docs/CRM-OVERHAUL.md` §3. Keep "Frequency:" as the sender prefix so identity is in every
> message.

### 4b. Opt-in description (paste into the campaign)

Carriers require a precise account of how consent is captured. Use this:

> Recipients opt in on the Frequency website. On the contact/profile form there is a single
> **unchecked** consent checkbox: *"Text me Frequency updates (event reminders and group
> messages). Message and data rates may apply. Consent is not a condition of any purchase.
> See our Privacy Policy."* with a link to `https://frequencylocal.com/privacy`. The checkbox
> is never pre-checked and consent is never bundled with another action. Consent is recorded
> against a verified phone number in an append-only ledger (the `sms_consent` table). The
> one-time card-scan invite is sent only after the recipient's own opt-in or where a member's
> capture establishes a prior relationship; every message includes STOP to opt out.

The exact on-page opt-in language to ship (matches the description above):

> ☐ Text me Frequency updates (event reminders and group messages). Message and data rates
> may apply. Consent is not a condition of any purchase. See our [Privacy Policy](/privacy).

## 5. Env wiring (Vercel)

These are the exact variable names read by `isSmsProvisioned()` in `lib/comms/sms.ts`. The
gate stays **fail-closed** until the first four are all set; the credentials power the actual
send once the gate is open.

| Env var | Set where | Value | Unblocks |
|---|---|---|---|
| `SMS_PROVISIONING_ENABLED` | Vercel (Production) | literal string `true` | The master kill-switch. Absent or any other value = SMS stays fully gated. |
| `SMS_A2P_BRAND_ID` | Vercel (Production) | Brand SID from §3 | Proves an EIN-backed brand exists. |
| `SMS_A2P_CAMPAIGN_ID` | Vercel (Production) | Campaign SID from §4 | Proves an approved use-case exists. |
| `TWILIO_MESSAGING_SERVICE_SID` | Vercel (Production) | Messaging Service SID from §4 | The service the campaign maps to; the send target. |
| `TWILIO_ACCOUNT_SID` | Vercel (Production) | Twilio account SID | Provider credential for the eventual sender. |
| `TWILIO_AUTH_TOKEN` | Vercel (Production, **secret**) | Twilio auth token | Provider credential; never logged, never client-exposed. |

Notes:
- `isSmsProvisioned()` requires **all four** of the top group simultaneously
  (`SMS_PROVISIONING_ENABLED === 'true'` AND the three SIDs non-empty). Setting only some of
  them keeps the gate closed by design.
- Even with all flags set, a send still has to pass the per-member gates (consent ledger →
  `notification_preferences` → quiet hours, `evaluateSmsGate`). The env flags only unblock
  the registration gate, not consent.
- The provider send call **is now wired** (ADR-376): `lib/comms/sms-send.ts` POSTs to the
  Twilio Messages API and `lib/comms/sms.ts` `sendSms()` enqueues through it once the gate
  allows. It stays **fully fail-closed** — `sendRawSms` no-ops while `isSmsProvisioned()` is
  false — so setting these flags is the only step that turns texts on. The live path also
  needs `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (the bottom group above); optionally
  `TWILIO_WEBHOOK_URL` (the public URL Twilio signs, for proxy setups) and
  `SMS_VERIFICATION_SECRET` (keys the opt-in verification-code hash; falls back to the auth
  token). **Apply the `sms_consent` migration `20260626010000` on a branch + regen types
  before flipping the flags** — the consent reads/writes assume that table.

## 6. Pre-submission checklist

Run this before clicking submit on the campaign. Worst-first.

| Severity | Item | State |
|---|---|---|
| 🔴 | **Terms of service URL is live.** Only `/privacy` exists today (`app/privacy/page.tsx`). A terms page must ship before the campaign is filed (carrier requirement as of 2026-06-30). | ⏳ |
| 🔴 | Privacy policy URL is live and public at `https://frequencylocal.com/privacy`. | ✅ live (`app/privacy/page.tsx`) |
| ⚠️ | EIN, legal name, and address match the IRS record exactly (§2). | ⏳ |
| ⚠️ | Opt-in language compliant: single unchecked checkbox, "message and data rates may apply," privacy link, consent not bundled (§4b). | ⏳ |
| ⚠️ | STOP and HELP auto-replies configured on the Messaging Service (§4a #4, #5). | ⏳ |
| ⚠️ | Sample messages in the campaign match what the app actually sends, carry "Frequency:" sender identity and a STOP opt-out, and pass CONTENT-VOICE §10 (no em dashes). | ⏳ |
| ⏳ | Use-case is **Mixed**, not Marketing (§4). | ⏳ |
| ⏳ | Expected volume entered conservatively (§2). | ⏳ |

## 7. What unblocks on approval

Once the campaign is approved and the §5 flags are set in Vercel:

| Unblocks | Phase | Detail |
|---|---|---|
| The SMS **card-scan nudge** | Phase 2 (viral loop) | The one-time "you were added, get your own card" invite (§4a #1) can send. Until then the email nudge ships and SMS stays gated (`docs/CRM-OVERHAUL.md` §3 Phase 2). |
| **1:1 SMS** + "text the group" | Phase 5 (comms rails) | The SMS send path goes live behind `sendSms()`; Event Dispatches can text the group (ADR-255), and email/SMS write back to the `contact_interactions` timeline. |

Nothing else in the platform depends on this; the gate is the single seam (`lib/comms/sms.ts`,
ADR-256). Approve the brand and campaign, set the flags, and SMS flips from refuse-first to
live, still subject to per-member consent.

## Related docs

- `lib/comms/sms.ts`, the SMS send-gate (the env flags + fail-closed policy). ADR-256.
- `docs/CRM-OVERHAUL.md`, Phase 0 starts this clock; Phase 2 + Phase 5 are blocked on it.
- `docs/COMMS-CRM-ARCHITECTURE.md`, the comms spine, consent lanes, and suppression.
- `docs/CONTENT-VOICE.md` + `docs/NAMING.md`, the voice and naming canons the samples follow.
- `app/privacy/page.tsx`, the live privacy policy. (Terms of service page: to be created, §6.)
