# Maps

**One seam, two engines, two keys, one diagnostic.** Every map in the app renders through
`components/maps/map-canvas.tsx`. It picks Google when a *browsable* key is set and MapLibre
otherwise, and it falls back to MapLibre on any Google failure. A surface describes **what to
plot**; it never touches a map library.

Decisions: [ADR-901](DECISIONS.md) (the seam) · [ADR-904](DECISIONS.md) (the loader handshake
and the diagnostic). This file is the operating reference.

---

## 1. Which engine renders

| Condition | Engine | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` set at **build** time | Google Maps JS | ✅ the keyed path |
| Key absent or blank | MapLibre GL + OpenFreeMap | ✅ the keyless default: dev, previews, CI, self-host |
| Key set but the loader rejects | MapLibre GL | ✅ degrades in place, logs `maps.provider_fallback` |
| Key set but Google rejects it (`gm_authFailure`) | MapLibre GL | ✅ logs `maps.google_auth_failure` |

The decision lives in exactly one function, `mapProvider()` in `lib/maps/provider.ts`. No
component may decide it for itself; `components/maps/maps-wiring.test.ts` enforces that.

---

## 2. The two keys, which are not interchangeable

| Var | Scope | Powers | Restrictions |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | 🔴 **server only, secret** | Places venue search behind `/api/geocode/venues` | Never `NEXT_PUBLIC_*`. Publishing it exposes the billing account. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Public by construction | Browser map rendering | A **second, different** key. HTTP-referrer restricted, API-restricted to Maps JavaScript API. |

A browser-rendered map cannot hide its key, so the browsable one is public on purpose. The
drift guard asserts it is read in exactly one module and that no
`NEXT_PUBLIC_*GOOGLE_MAPS_API_KEY` identifier exists anywhere in the tree.

⚠️ **`NEXT_PUBLIC_*` is inlined at BUILD time**, and only a *static* `process.env.NAME` member
access is replaced (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
§"Bundling Environment Variables for the Browser"). On Vercel the var must be present when
`next build` runs. A runtime-only value leaves every map on MapLibre.

### Other map env vars

| Var | Default | When to touch it |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | unset | Optional Cloud-styled Map ID so the Google basemap matches the cream palette. |
| `NEXT_PUBLIC_MAP_STYLE` | OpenFreeMap positron | Only to point MapLibre at a different style. A bad value blanks the basemap. |
| `NEXT_PUBLIC_MAPLIBRE_WORKER_URL` | empty | 🔴 **Leave empty.** v6-only escape hatch; we are on v5. See §6. |

---

## 3. The Google loader contract

`lib/maps/google-loader.ts` injects one script per document and shares one promise.

🔴 **It settles on Google's `&callback=`, never on the script tag's `load` event.**
`maps/api/js` returns a bootstrap, not the API: it defines `google.maps.Load` / `.modules` /
`.__gjsload__` and then appends a **second** script (`…/maps-api-v3/api/js/<ver>/main.js`) that
attaches `Map`, `Marker`, `InfoWindow`, `LatLngBounds`, `Circle` and `SymbolPath`. Our tag's
`load` fires before that second script runs, so gating on `load` inspects an empty namespace
and fails every time. That was the real cause of the July 2026 blank map. Do not "restore" a
`load` listener; `lib/maps/google-loader.test.ts` fails if you do.

**Six rejection reasons, all of which now reach the log:**

| Reason | Trips fallback | Cause |
| --- | --- | --- |
| `…BROWSER_KEY is not set` | ✅ | No browsable key at build time |
| `script failed to load` | ✅ | Blocked by an extension, offline, DNS |
| `signalled ready without the expected API surface` | ✅ | Google called back but the namespace is short |
| `rejected the browsable key` | ✅ | Auth failure, via `gm_authFailure` |
| `did not initialise within 10000ms` | ✅ | Watchdog: hung or never called back |
| `can only load in the browser` | ✅ | Unreachable in practice (both canvases are `ssr: false`) |

🔴 **An auth failure does not reject.** Billing not activated, referrer denied, API not
enabled, bad key: all return HTTP 200, let `new maps.Map()` succeed, and surface **only**
through `window.gm_authFailure` plus Google's own grey "can't load Google Maps correctly"
watermark. The loader installs that hook, marks the key rejected so no later mount retries,
and notifies every mounted canvas so they fall back in place.

---

## 4. CSP hosts, and why each is there

`next.config.ts`. ✅ **The Google set is complete and needed no change** for the ADR-904 fix.

| Host | Directive | Why |
| --- | --- | --- |
| `maps.googleapis.com` | `script-src`, `connect-src` | Bootstrap + main.js + util/map/onion/controls chunks; `/maps/vt` vector XHRs; Google's own `gen_204?csp_test=true` probe |
| `maps.gstatic.com` | `script-src`, `connect-src` | Static Maps assets |
| `fonts.googleapis.com` | `style-src` | Roboto stylesheet the Maps API injects at runtime |
| `fonts.gstatic.com` | `font-src` | The font files that stylesheet references |
| `tiles.openfreemap.org` | `connect-src` | MapLibre style JSON, TileJSON and `.pbf` vector tiles |
| (any `https:`) | `img-src` | Raster tiles and sprites, both engines |
| `blob:` | `worker-src` | MapLibre 5 inlines its worker as a Blob |

Google creates no iframe (`frame-src` not involved) and calls neither `eval()` nor
`new Function()`, so production's lack of `'unsafe-eval'` is fine.

⚠️ **Trap for the ADR-170 nonce follow-up.** A nonce-based `script-src` breaks this loader:
Google's bootstrap propagates the nonce by copying
`document.querySelector('script[nonce]').nonce` onto the main.js tag it appends. The nonce
must be set on our injected tag or the second script is blocked and the map dies with no
rejection to fall back on.

Every CSP block on production is already recorded: `report-uri /api/csp-report` →
`log.info('csp.violation', …)` → Vercel Logs, filterable on `csp.violation`.

---

## 5. The diagnostic

`lib/maps/diagnostics.ts`. One structured, deduped `console.warn` line per distinct failure per
page load, mirrored to Sentry when a DSN is configured. Every line carries the build SHA.
It **never** prints the key: `keyPresent` is a boolean.

| Event | Means | First thing to check |
| --- | --- | --- |
| `maps.provider_fallback` | The seam gave up on Google | The `reason` field names which of the six |
| `maps.google_auth_failure` | Google rejected the key | Billing activated? Referrers pathful? API *enabled*? |
| `maps.maplibre_error` | Style, sprite, glyph or tile failed | `sourceId` + `status` + `url` in the line |
| `maps.no_tiles` | Style loaded, zero tiles arrived | The web worker, then the tile host |

Why this exists: before it, a member saw a blank map and a developer saw nothing, so three
rounds of debugging went to three different wrong theories.

---

## 6. Browser triage, in order

Run these in DevTools on the failing page. Each one splits the problem.

1. **Console, filter `[maps]`.** If a line is there, it names the cause and the build. Stop
   here and act on it. If there is no line at all, the deployed build predates ADR-904 →
   go to step 5.
2. **Console: `document.getElementById('frequency-google-maps-js')`.** `null` means Google was
   never selected, so the browsable key is not in the bundle → step 3. An element means Google
   was selected and failed at runtime → check the Network tab for `maps/api/js` and `main.js`.
3. **Sources → `Ctrl/Cmd+Shift+F` for the literal `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.** A
   **hit proves the var was absent when Vercel ran `next build`** (Turbopack leaves the read in
   place against an empty process shim). No hit means it was substituted.
4. **Network, filter `pbf`.** Zero requests on a MapLibre map means the web worker never
   started. Requests returning 200 while the map stays blank means the fault is below the
   tiles: WebGL, then glyphs, then sprite.
5. **Network, filter `worker`.** A request ending `maplibre-gl-worker.mjs` proves the build is
   still on MapLibre **6** (v5 inlines its worker as a Blob and never requests that file). A
   request to any other worker path means `NEXT_PUBLIC_MAPLIBRE_WORKER_URL` is set in Vercel,
   which is the §2 footgun.
6. **`curl https://<host>/api/status`** and read `build.commit`. That is the commit actually
   serving the page. A redeploy rebuilds the deployment you clicked, **not `main`**, so
   "I merged it and redeployed" does not put the fix in production.

---

## 7. Surfaces

| State | Surfaces |
| --- | --- |
| ✅ Composes `<MapCanvas>` | event venue map · events library map · event location picker · circle/group venue map · marketplace listing map |
| ⏳ Pending migration | `components/circles/circle-map.tsx` · `components/discover/discover-map.tsx` · `app/(main)/admin/qr/scan-map.tsx` |

The three pending canvases import `maplibre-gl` directly (GeoJSON sources, data-driven circle
paint, symbol layers, which the four-primitive contract does not yet express). They are listed
in `PENDING_MIGRATION` in the drift guard; deleting a row is how the debt gets paid.

⚠️ **A diagnostic added to `components/maps/maplibre-canvas.tsx` does not cover those three.**

---

## 8. Tests

| File | Guards |
| --- | --- |
| `lib/maps/google-loader.test.ts` | The callback handshake, the watchdog, `gm_authFailure`, the second-mount path. Written to fail against the pre-ADR-904 loader. |
| `lib/maps/diagnostics.test.ts` | Dedupe, and that the key never reaches the line |
| `lib/maps/provider.test.ts` | The provider decision under every key state |
| `components/maps/maplibre-interop.test.ts` | The only map test that **imports** maplibre-gl |
| `components/maps/maps-wiring.test.ts` | The seam, the CSP host set, popup DOM safety, the loader drift guards |

⚠️ Every test except `maplibre-interop` is a source-text grep. "The map tests pass" has never
been evidence that a map can be constructed, which is why the interop test exists.
