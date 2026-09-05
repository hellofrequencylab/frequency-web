// The ONE client-side entry point for writing profiles.meta (scan two L6-09, L5-06).
//
// profiles.meta is a single jsonb column that many features share, each under its own top-level
// key (practiceStreak, walkthroughs, daily_checkin_date, progressStage, spotlight, tour, ...).
// Every writer used to `select meta`, spread it, set its key and write the WHOLE blob back. Two
// writers interleaving for one member (the check-in on app load and the streak on a practice log,
// in the same second) meant the later write carried the earlier writer's key as it was BEFORE the
// earlier write, and that key was silently lost.
//
// So writers no longer send the blob. They send ONLY the key(s) they own and the database merges
// them under the row lock (`meta = coalesce(meta, '{}') || patch`, migration 20270345000900). A
// writer may still READ meta to decide what to write (the streak computation needs its stored
// state); the WRITE is the merge of its own key, so a stale read cannot clobber another key.
//
// The merge is SHALLOW: a nested object is replaced whole at its top-level key. Send your complete
// key, never a partial sub-object, and never patch inside a key another writer owns.
//
// Authorization is inside the RPC: the service role (admin client) may write any profile, a
// signed-in member only the profile whose auth_user_id is their own. So this works through the
// admin client AND the member's session client.

/** The narrowest shape both the admin client and the session client satisfy. The real client's
 *  `rpc` is generic over the typed function catalog; the RPC is not in the generated types yet, so
 *  the call is cast (repo convention for not-yet-typed DB objects, as lib/zaps.ts does). */
export type ProfileMetaClient = { rpc: (...args: never[]) => unknown }

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null }
type RpcFn = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult<unknown>>

/** The two top-level mirror columns the streak writers set in the same statement as their key.
 *  This is the RPC's whole allowlist; anything else is refused server-side. */
export interface ProfileMetaColumns {
  current_streak?: number
  longest_streak?: number
}

export type ProfileMeta = Record<string, unknown>

/** Exactly one of `meta` / `error` is set. Read `error` before the side effect that follows the
 *  write: a stamp that did not land must not pay the Gem, fire the celebration, or bump the mirror. */
export type ProfileMetaResult =
  | { meta: ProfileMeta; error: null }
  | { meta: null; error: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Merge `patch` (the caller's own top-level key or keys) into profiles.meta for `profileId`.
 * Returns the merged meta as the database now holds it, or an error string. Never throws.
 */
export async function mergeProfileMeta(
  client: ProfileMetaClient,
  profileId: string,
  patch: Record<string, unknown>,
  columns?: ProfileMetaColumns,
): Promise<ProfileMetaResult> {
  if (!profileId) return { meta: null, error: 'mergeProfileMeta: profile id is required' }
  if (!isPlainObject(patch)) return { meta: null, error: 'mergeProfileMeta: patch must be a plain object' }
  const args: Record<string, unknown> = { p_profile_id: profileId, p_patch: patch }
  if (columns && (columns.current_streak !== undefined || columns.longest_streak !== undefined)) {
    const cols: Record<string, number> = {}
    if (columns.current_streak !== undefined) cols.current_streak = columns.current_streak
    if (columns.longest_streak !== undefined) cols.longest_streak = columns.longest_streak
    args.p_columns = cols
  }
  // Called inline on the client (not through a detached alias) so `this` survives; see
  // scripts/check-detached-client-methods.test.ts.
  const { data, error } = await (client.rpc as unknown as RpcFn)('merge_profile_meta', args)
  if (error) return { meta: null, error: error.message }
  return { meta: isPlainObject(data) ? data : {}, error: null }
}

/**
 * Remove top-level keys from profiles.meta (the delete half, for writers that drop a key at its
 * default value). Returns the meta as the database now holds it, or an error string. Never throws.
 */
export async function removeProfileMetaKeys(
  client: ProfileMetaClient,
  profileId: string,
  keys: readonly string[],
): Promise<ProfileMetaResult> {
  if (!profileId) return { meta: null, error: 'removeProfileMetaKeys: profile id is required' }
  const safe = keys.filter((k) => typeof k === 'string' && k.length > 0)
  if (safe.length === 0) return { meta: null, error: 'removeProfileMetaKeys: at least one key is required' }
  const { data, error } = await (client.rpc as unknown as RpcFn)('remove_profile_meta_keys', {
    p_profile_id: profileId,
    p_keys: safe,
  })
  if (error) return { meta: null, error: error.message }
  return { meta: isPlainObject(data) ? data : {}, error: null }
}
