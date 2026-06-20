# Embedding a Resonance world

A host page mounts a Resonance world in an iframe and federates its own login,
so members never sign up twice. The host signs a short-lived RS256 JWT,
Resonance verifies it, and the world runs inside the host's page. With no token
and no env set, the same build still runs standalone with an anonymous session.

## At a glance

| Concern | How it works | Where |
|---|---|---|
| Mount | iframe to `/embed/{venueId}`, or the `embed.js` helper | `public/embed.js` |
| Identity | host signs an RS256 JWT, Resonance verifies it | `lib/auth/host-identity.ts` |
| Live bridge | origin-checked `postMessage` both ways | `lib/embed/origins.ts`, `components/embed/useEmbedBridge.ts` |
| No token | anonymous standalone session (no env needed) | `components/embed/EmbedFrame.tsx` |

## 1. How to embed

### Option A: the `embed.js` helper (recommended)

```html
<div id="resonance"></div>
<script src="https://resonance.example/embed.js"></script>
<script>
  ResonanceEmbed.mount({
    target: "#resonance",
    origin: "https://resonance.example", // where Resonance is hosted
    venueId: "abc-123",
    token: "<host-signed RS256 JWT>",     // omit for anonymous
    theme: { brand: "#6c2bd9" },          // optional host brand tokens
    onEvent: (e) => console.log(e),       // zaps:awarded, rank:changed, ...
  });
</script>
```

The helper creates the iframe, waits for the world's `world:ready`, then sends
the token and theme. Every message it posts is targeted at the Resonance origin,
and every message it receives is checked against that origin, so no other frame
can spoof the host. `mount` returns `{ iframe, setToken, setTheme, destroy }`.

### Option B: a raw iframe

```html
<iframe
  src="https://resonance.example/embed/abc-123?token=<JWT>"
  allow="autoplay; encrypted-media"
  style="width:100%;height:720px;border:0"
></iframe>
```

The token on the URL gives identity on first paint. For refresh or slow loads,
prefer `embed.js` so the token also arrives over `postMessage`.

## 2. Federated identity contract

The host signs, Resonance verifies. That signature is the only trust boundary;
a decoded-but-unverified token is treated as anonymous.

- **Algorithm:** RS256. The host holds the private key; Resonance holds the
  matching public key in `RESONANCE_HOST_JWT_PUBLIC_KEY` (SPKI PEM).
- **Claims Resonance reads:**

  | Claim | Maps to | Required |
  |---|---|---|
  | `sub` | `userId` (stored verbatim, never FK'd, ADR-002) | yes |
  | `displayName` (or `name`) | `displayName` | no |
  | `worldId` | tenant the user belongs to | yes (route layer) |
  | `iat` / `exp` | issued-at / expiry, keep short (about 10m) | yes |

- **Signing example (host server):**

  ```ts
  import { SignJWT, importPKCS8 } from "jose";
  const key = await importPKCS8(process.env.HOST_JWT_PRIVATE_KEY, "RS256");
  const token = await new SignJWT({ worldId, displayName })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(member.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
  ```

- **Verifying (Resonance side):** `verifyHostToken(token)` in
  `lib/auth/host-identity.ts` returns `{ userId, displayName }` or `null`. It
  never throws and returns `null` when the public key is unset, so callers fall
  back cleanly.

## 3. Allowed origins (required for the bridge)

The world only accepts `postMessage` from the same origin or from an origin
listed in `NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS` (comma-separated). Add each
host origin that may frame the embed:

```
NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS=https://app.frequency.example,https://host.example
```

With the env empty, only same-origin passes (safe default). The origin check
stops an unlisted parent from reaching the listener at all; the signed JWT is
still re-verified server-side on every API call.

The bridge events are typed in `lib/integration/embed-contract.ts`:

| Direction | Events |
|---|---|
| World to host | `world:ready`, `zaps:awarded`, `rank:changed`, `event:attended` |
| Host to world | `user:identity` (token), `theme` (brand tokens), `entitlements` |

## 4. Standalone fallback (no token)

The same build runs on its own with nothing configured. If no host token arrives
shortly after load, `EmbedFrame` signs in with an anonymous Supabase session and
mounts the room, identical to the rest of the app. Nothing about embedding is
required for standalone to work, and no env weakens it.

## Host setup checklist

1. Generate an RS256 keypair. Keep the private key on the host.
2. Send Resonance the public key for `RESONANCE_HOST_JWT_PUBLIC_KEY`.
3. Add the host origin to `NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS`.
4. Sign a short-lived JWT per member (see above) and pass it to `embed.js`.
5. Listen for `onEvent` (live UI) and verify the HMAC webhook server-side for
   the durable economy update. See `docs/INTEGRATION.md`.
