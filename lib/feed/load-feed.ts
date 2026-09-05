// Feed RPC result reader (scan2 L5-03, 2026-09-05).
//
// Both feed RPCs (`feed_for_viewer`, `scoped_feed_for_viewer`) were read as `const { data } = await
// supabase.rpc(...)` with `data ?? []` as the fallback, so a statement timeout, an RLS refusal, or a
// missing function rendered the EMPTY state ("nothing posted yet") for every member, and nothing
// was logged. supabase-js resolves `{ error }` rather than throwing, so the only way to see the
// failure is to read it. This reader turns the raw response into a discriminated result the page
// branches on: 'ok' carries the rows, 'error' means "render the error state, never the empty one".
//
// Pure over the resolved response, so the callers keep their typed `supabase.rpc(...)` calls and
// the tests need no client stub.

export type FeedLoad<T> = { kind: 'ok'; items: T[] } | { kind: 'error' }

export type FeedRpcName = 'feed_for_viewer' | 'scoped_feed_for_viewer'

interface RpcResponse {
  data: unknown
  error: { message?: string; code?: string; details?: string | null } | null
}

/**
 * Read a feed RPC response. A failed call is logged server-side with the RPC name (structured
 * second argument, never interpolated) and reported as `{ kind: 'error' }`; a null `data` on a
 * clean call is a genuine empty feed.
 */
export function readFeedRpc<T>(rpc: FeedRpcName, res: RpcResponse): FeedLoad<T> {
  if (res.error) {
    console.error('[feed] rpc failed', {
      rpc,
      code: res.error.code ?? null,
      message: res.error.message ?? null,
    })
    return { kind: 'error' }
  }
  return { kind: 'ok', items: (res.data as T[] | null) ?? [] }
}
