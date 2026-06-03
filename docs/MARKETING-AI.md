# AI marketing operator — "The Market Read"

An AI marketing tool inside Studio that reads **live signal**, names the market's
**pain points**, and generates **demographic-based outbound content** that speaks to
them subtly — *a magical connection, not an advertisement.* It is a new **face** on the
"one brain" AI fabric ([`AI-STRATEGY.md`](AI-STRATEGY.md)), not a separate system; the
seat was reserved by the `/marketing/agent` console ("a live Claude operator slots in
here later").

## The reframe (why it's not an ad engine)
The primary audience (the High-Functioning Lonely — see [`CREATIVE-PLATFORM.md`](CREATIVE-PLATFORM.md))
is allergic to funnels. Marketing that **persuades** repels them; marketing that
**recognizes** them converts. So this is a **resonance engine**: it reflects the
collective ache back so precisely they feel *seen*. Voice is load-bearing — warm,
plainspoken, *missed / exhale / home*; never *unlock / limited time / elevate*.

## Decisions (locked with the owner, 2026-06-02)
- **Motion:** outbound **acquisition** first (find/attract new members), then lifecycle.
- **Autonomy:** **graduated** — drafts propose into the Action Queue; low-risk drafts can
  auto-publish once the audit log earns trust; **anything public always waits for a human.**
- **First signals:** in-app behavior (live) + GA acquisition + external social listening
  (the last two are net-new integrations, sequenced after the wedge).
- **Wedge:** the **Market Read** → 2–3 named pain points (with evidence) → resonant content
  ideas per pain point.

## The five layers
1. **Listen** — live signal → a structured market snapshot.
2. **Read the ache** — cluster into named pain points with evidence, mapped to the personas.
3. **Generate** — draft outbound assets (social / ad / hook) per pain point, in the brand voice.
4. **Govern** — propose → Action Queue → approve → runs through the comms **spine** (consent +
   suppression + unsubscribe); usage caps + kill switch; AI-labeled.
5. **Learn** — track what landed → feed back into the read (what makes it feel alive).

## Non-negotiable guardrails
- 🔒 **Aggregate-only privacy.** Member data informs the *collective* ache; outbound **never**
  references or exposes an individual. Recognition, not surveillance — cross that line and the
  magic flips to creepy.
- ⚠️ **Human-approves-anything-public.** Auto on the thinking; approve on the speaking outward.
- 🧱 **Honest signal only.** Real counts (`SOCIAL_PROOF_FLOOR`), founding framing below real
  scale; never fabricate.

## Shipped (prototype)
- `lib/marketing/market-read.ts` — `getMarketRead()`: real in-app signal (new-without-a-circle,
  gone-quiet, engagement trend, most-alive interest) + **deterministic** synthesis + drafting
  (same copilot pattern as `lib/studio/agent.ts`).
- `app/(main)/marketing/market-read/page.tsx` — the Studio surface (signal snapshot via `StatCard`,
  pain-point cards, drafted assets marked "awaiting approval"). Added to the marketing sub-nav.

## Roadmap
1. ✅ Prototype the Market Read on internal signal (deterministic). *(this)*
2. Wire the **Action Queue** for content drafts (reuse `agent_actions`) + approve/dismiss.
3. Stand up the **AI core** (`lib/ai/*` + usage ledger + caps + consent harness, per AI-STRATEGY)
   → swap the live Claude operator in behind `getMarketRead()`.
4. Add **GA acquisition** (Data API) + **external social listening** signals.
5. Ad-set + campaign generators; the **learning loop** (asset performance → read).
6. Extend to inbound lifecycle (the existing winback proposer is the seed).
