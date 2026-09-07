// Classifies a server request error BEFORE it reaches the error recorder (LIVE-210, ADR-1236).
//
// THE ERROR THIS NAMES. Production error group digest 3689792676, "The destination stream closed
// early.", count 19, users 4, 2026-08-17 to 2026-09-03, across ELEVEN routes and every one of them
// an `.rsc` payload request: /marketplace, /housing, /spaces/directory, /index, /crew,
// /network/contacts, /classifieds, /nearby, /network, /events/[slug], /people/[handle].
//
// WHAT IT IS. React's Flight server registers a `close` listener on the destination and, when the
// destination closes before the payload finished, cancels the render with a plain
// `Error('The destination stream closed early.')` (react-server-dom-webpack-server, createCancelHandler).
// The destination is the client's connection: the browser cancelled the request. The one production
// sample read on 2026-09-07 is the whole diagnosis: at 06:12:55Z on 2026-09-03 ONE client logged
// seven of them in the same second, on seven unrelated routes, every request `200`. That is the
// router prefetching a menu of links and then navigating, which aborts the prefetches it no longer
// needs. No response was owed, nothing downstream ran, no member saw anything.
//
// WHY IT REACHES THE RECORDER AT ALL. Next's own filter (createReactServerErrorHandler) drops an
// abort only when `err.name` is `AbortError` or `ResponseAborted`; React throws a plain `Error`, so
// it falls through, gets a digest, and is handed to `onRequestError`. That is where this file sits.
//
// ⚠️ THE MATCH IS EXACT ON PURPOSE. This is not "ignore stream errors". A genuine stream failure
// (an upstream that hung, a payload that threw mid-flush) has a different message and still
// reports. Widening this to a substring or to every error carrying a digest is how a real failure
// disappears, and the repo rule is that a swallowed error is an invisible regression.
//
// ⚠️ THIS FILTERS THE SENTRY HALF ONLY. Next logs the error itself (console.error, with the
// digest) before calling `onRequestError`, and Vercel's runtime error groups are built from that
// log. Nothing in userland can stop that line, so the Vercel group will keep appearing; it is
// recorded as known-benign, with the digest, in docs/OBSERVABILITY-BASELINES.md §7.

/** The exact message React's Flight server uses when the client closed the connection mid-stream. */
export const CLIENT_ABORTED_STREAM_MESSAGE = 'The destination stream closed early.'

/** The production digest Next assigns to that error, so a reader can match this file to the group. */
export const CLIENT_ABORTED_STREAM_DIGEST = '3689792676'

/**
 * True when `err` is React's client-aborted-stream cancel: the browser closed the connection while
 * the RSC payload was streaming. Not a failure of the route, so not an error to record.
 */
export function isClientAbortedStream(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const message = (err as { message?: unknown }).message
  return message === CLIENT_ABORTED_STREAM_MESSAGE
}
