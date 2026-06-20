# Integration: plugging into Frequency (and breaking out)

The app integrates with a host **only across a documented seam** — never the
database. The seam has three parts; all are typed in
`lib/integration/embed-contract.ts`.

## 1. Federated identity (no double sign-up)

```
Frequency  ──signs JWT (HostIdentityClaims)──>  embed loads with token
Resonance  ──verifies with RESONANCE_HOST_JWT_PUBLIC_KEY──>  maps sub -> profile (per world)
```

- The host signs a short-lived JWT: `{ sub, worldId, displayName?, avatarUrl?, entitlements?, iat, exp }`.
- We verify the signature and trust `sub` as the user's id. We store it as a plain
  `uuid` (ADR-002) — no FK back to Frequency.
- Standalone mode uses this app's own Supabase Auth; the rest of the app doesn't
  care which issued the identity.

## 2. postMessage bridge (live, while the iframe is open)

| Direction | Events |
|---|---|
| World → host (`WorldOutboundEvent`) | `world:ready`, `zaps:awarded`, `rank:changed`, `event:attended` |
| Host → world (`HostInboundEvent`) | `user:identity` (token), `theme` (brand tokens), `entitlements` |

The host themes the embed by passing brand tokens, so the Lounge inherits the
parent's look without a rebuild.

## 3. Webhooks (server-to-server, durable)

The host economy must stay correct even when the iframe is closed, so
gamification events are *also* delivered as signed, retried webhooks
(`WebhookEvent`), HMAC-signed with `RESONANCE_WEBHOOK_SIGNING_SECRET`. This is how
Frequency's Zaps + The Field stay in sync with in-world activity (ADR-010). We
mirror events outward; we never write into Frequency's tables.

## 4. The embed surface

- Phase 0: a single DJ "Lounge" mounted in Frequency via iframe + federated auth +
  the Zaps webhook.
- Later: a web component `<resonance-world world-id="..." public-key="..." theme="...">`
  so any site (Hook customers, open web) embeds a world. Same bridge.

## 5. Multi-tenant & governance

One **world per tenant**, RLS-isolated. The embedding org is the data controller;
Resonance is the processor (reuse Frequency-for-Organizations standards: region
pinning, versioned consent, retention/deletion). Per-tenant config covers enabled
experiences, moderation policy, monetization split, and cosmetic catalog.

## 5b. Mounting in a host (recipe)

Two small pieces on the host side; the embed surface (`/embed/[venueId]`) is done.

**1. Issue a token** (host server, RS256; we hold the public key):

```ts
// host: sign a short-lived JWT for the logged-in member
import { SignJWT, importPKCS8 } from "jose";
const key = await importPKCS8(process.env.HOST_JWT_PRIVATE_KEY, "RS256");
const token = await new SignJWT({ worldId, displayName, avatarUrl, entitlements })
  .setProtectedHeader({ alg: "RS256" })
  .setSubject(member.id)
  .setIssuedAt()
  .setExpirationTime("10m")
  .sign(key);
```

**2. Mount the iframe** and pass the token (URL for first paint, or postMessage):

```tsx
<iframe
  src={`https://resonance.example/embed/${venueId}?token=${token}`}
  allow="autoplay; encrypted-media"
  style={{ width: "100%", height: 720, border: 0 }}
/>
```

Receive mirrored events on the host: listen for `postMessage`
(`zaps:awarded` / `rank:changed`) for live UI, and verify the HMAC-signed
webhook (`X-Resonance-Signature`) server-side for the durable economy update.

Set on our side: `RESONANCE_HOST_JWT_PUBLIC_KEY` (their public key),
`RESONANCE_HOST_WEBHOOK_URL`, `RESONANCE_WEBHOOK_SIGNING_SECRET`.

## 6. Breaking out

Integration via the seam (not the DB) is exactly what makes breakout clean: the
host keeps talking to the same JWT + webhook contract regardless of where
Resonance is hosted. The data move is in [`ISOLATION.md`](ISOLATION.md).
