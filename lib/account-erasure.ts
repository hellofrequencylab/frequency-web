// The half of account erasure the database cannot reach (LIVE-549, ADR-1581).
//
// Deleting the auth user cascades the profile and the member's rows (lib/account.ts). It cannot
// reach two copies that live outside Postgres rows: the files the member uploaded to Storage, and
// the Stripe customer that holds their card, billing address and email. This step removes both and
// runs BEFORE the auth delete, so a failure still leaves a profile id and an auth user id to retry
// by (both are in every log line below).
//
// A failure here is reported (console + Sentry) and does NOT block the auth delete: a member who
// asked to leave must be able to. The attempt is the record.

import * as Sentry from '@sentry/nextjs'

/** The buckets a member-keyed path is written to, read from the upload sites (never guessed).
 *  Each object lives under `{authUserId}/...`:
 *  - avatars: lib/storage/profile-images.ts (`{uid}/avatar|header.ext`), app/onboarding/form.tsx,
 *    settings/profile/spotlight-actions.ts (`{uid}/spotlight/{uuid}.ext`, one folder deeper).
 *  - posts: components/feed/composer.tsx (`{uid}/{ts}-{name}`).
 *  - network-contacts (private): connections/new/creator.tsx, events/scan/creator.tsx,
 *    events/event-spark.tsx (`{uid}/{uuid}.jpg`). Its rows cascade with the profile, so these
 *    files are orphans the moment the account goes.
 *  NOT here, on purpose: event-media (event covers and galleries under a member prefix belong to
 *  events and Spaces that outlive the member) and support screenshots (the ticket is kept). */
export const MEMBER_BUCKETS = ['avatars', 'posts', 'network-contacts'] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 1000
const MAX_DEPTH = 4

type StorageItem = { name: string; id: string | null }
type BucketApi = {
  list: (
    prefix: string,
    opts: { limit: number; offset: number },
  ) => Promise<{ data: StorageItem[] | null; error: { message: string } | null }>
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>
}
type SpacesUpdate = {
  update: (patch: { stripe_customer_id: null }) => {
    eq: (col: 'stripe_customer_id', val: string) => PromiseLike<{ error: { message: string } | null }>
  }
}
export type ErasureAdmin = {
  storage: { from: (bucket: string) => BucketApi }
  from: (table: 'spaces') => SpacesUpdate
}
type ErasureStripe = { customers: { del: (id: string) => Promise<unknown> } } | null

type ErasureResult = {
  /** Objects removed, per bucket. */
  removed: Record<string, number>
  /** 'deleted', 'already_gone' (idempotent), 'none' (no customer), 'skipped' (billing off), 'failed'. */
  stripe: 'deleted' | 'already_gone' | 'none' | 'skipped' | 'failed'
  /** Every step that failed, in words. Empty on a clean erase. */
  failures: string[]
}

/** Every object path under `{prefix}/`, folders walked (Storage `list` is one level deep and a
 *  folder comes back with a null id). */
async function listUnder(bucket: BucketApi, prefix: string, depth = 0): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(error.message)
    const items = data ?? []
    for (const it of items) {
      const path = `${prefix}/${it.name}`
      if (it.id === null) {
        if (depth < MAX_DEPTH) out.push(...(await listUnder(bucket, path, depth + 1)))
      } else {
        out.push(path)
      }
    }
    if (items.length < PAGE) break
  }
  return out
}

/** Stripe answers a customer that no longer exists with resource_missing (404). A retry after a
 *  partial erase lands here, and it is success. */
function isAlreadyGone(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; raw?: { code?: string } } | null
  return e?.code === 'resource_missing' || e?.raw?.code === 'resource_missing' || e?.statusCode === 404
}

/**
 * Remove the member's stored files and delete their Stripe customer. Never throws. Call it BEFORE
 * the auth delete, with ids read from the profile row.
 */
export async function eraseExternalCopies(
  input: { profileId: string; authUserId: string; stripeCustomerId: string | null | undefined },
  deps: { admin: ErasureAdmin; stripe: ErasureStripe },
): Promise<ErasureResult> {
  const { profileId, authUserId, stripeCustomerId } = input
  const result: ErasureResult = { removed: {}, stripe: 'none', failures: [] }

  // An empty or malformed prefix would list the bucket ROOT, which is every member's files.
  if (UUID_RE.test(authUserId)) {
    for (const name of MEMBER_BUCKETS) {
      try {
        const bucket = deps.admin.storage.from(name)
        const paths = await listUnder(bucket, authUserId)
        for (let i = 0; i < paths.length; i += PAGE) {
          const { error } = await deps.admin.storage.from(name).remove(paths.slice(i, i + PAGE))
          if (error) throw new Error(error.message)
        }
        result.removed[name] = paths.length
      } catch (err) {
        result.failures.push(`storage ${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } else {
    result.failures.push('storage: auth user id is not a uuid, refused to list a bucket root')
  }

  if (stripeCustomerId) {
    if (!deps.stripe) {
      result.stripe = 'skipped'
      result.failures.push(`stripe ${stripeCustomerId}: billing is not configured, customer not deleted`)
    } else {
      try {
        // Deleting the customer removes its saved cards and cancels its subscriptions: nobody
        // keeps charging the card of a member who left.
        await deps.stripe.customers.del(stripeCustomerId)
        result.stripe = 'deleted'
      } catch (err) {
        if (isAlreadyGone(err)) {
          result.stripe = 'already_gone'
        } else {
          result.stripe = 'failed'
          result.failures.push(`stripe ${stripeCustomerId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      if (result.stripe !== 'failed') {
        // A Space checkout reuses its owner's customer (lib/billing/space-plan-checkout.ts) and the
        // Space outlives the owner (owner_profile_id SET NULL). Forget the dead id so the next
        // owner's checkout mints a fresh customer instead of failing on "No such customer".
        const { error } = await deps.admin
          .from('spaces')
          .update({ stripe_customer_id: null })
          .eq('stripe_customer_id', stripeCustomerId)
        if (error) result.failures.push(`spaces.stripe_customer_id: ${error.message}`)
      }
    }
  }

  if (result.failures.length) {
    const msg = `[deleteMyAccount] external copies not fully erased for profile ${profileId} (auth ${authUserId})`
    console.error(msg, result.failures)
    Sentry.captureMessage(msg, {
      level: 'error',
      fingerprint: ['account-erasure-external-copies'],
      extra: { profileId, authUserId, stripeCustomerId: stripeCustomerId ?? null, ...result },
    })
  }
  return result
}
