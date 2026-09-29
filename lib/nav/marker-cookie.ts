// When the proxy may re-send a marker cookie it already holds (LIVE-649, ADR-1617).
//
// The proxy used to write `fq_acct` on EVERY signed-in response, and `fq_ask` on every response in a
// prior-consent region, to keep their max-age rolling. On a Server Action that is not free. Next
// merges any cookie the proxy sets into the action's own cookie store
// (next/dist/server/async-storage/request-store.js, mergeMiddlewareCookies), and an action whose
// store holds a set cookie is reported to the client as "cookies changed"
// (server/app-render/action-handler.js, addRevalidationHeader). The client answers that by throwing
// away its whole prefetch cache, re-rendering the page and prefetching every visible Link again
// (server-action-reducer.js, invalidateEntirePrefetchCache). So a no-op heartbeat, sent every 90 s by
// every open member tab, cost a page render plus one request per Link on screen: the 14-per-link,
// every-10-minutes pattern in the 2026-09-29 runtime logs, reproduced locally with the cookie on and
// gone with it off.
//
// The rule: write a marker only when the browser does not already hold that value, or on a plain
// document load, which is where a rolling max-age is refreshed. Never on a Server Action or an RSC
// request carrying the same value. PURE, so proxy.ts calls it and the test drives it directly.

export interface MarkerRequest {
  method: string
  headers: { get(name: string): string | null }
  cookies: { get(name: string): { value: string } | undefined }
}

/** True for a full page load: a GET the router did not send (no `rsc`) that is not an action. */
export function isDocumentRequest(req: MarkerRequest): boolean {
  if (req.method !== 'GET') return false
  if (req.headers.get('rsc') !== null) return false
  if (req.headers.get('next-action') !== null) return false
  return true
}

/** Whether the proxy should (re)write `name=value` on this response. */
export function shouldWriteMarker(req: MarkerRequest, name: string, value: string): boolean {
  if (req.cookies.get(name)?.value !== value) return true
  return isDocumentRequest(req)
}
