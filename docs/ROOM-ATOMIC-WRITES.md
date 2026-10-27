# Atomic manual room writes

Status lives in [the merged backlog](BUILD-BACKLOG.json), row HYG-205. This document describes a local review proposal, not an applied migration or production acceptance.

The current room create action writes the room and creator membership in separate requests. A failed second insert leaves a room without its creator membership. The current demotion action reads an admin count and updates later; two callers can both read two admins and then remove both admin flags. No existing registered room RPC provides these operations atomically.

The proposed SQL is [room-atomic-proposal.sql](database/room-atomic-proposal.sql). It is deliberately outside `supabase/migrations`: the existing 860-file migration inventory stays unchanged. Register reviewed SQL with `supabase migration new` only after owner approval, then include its generated filename and update migration evidence through the normal rollout.

## Proposed behavior

Three service-only `SECURITY INVOKER` RPCs create a room with its creator-admin membership, change a member's admin flag, and remove a member through a manual leave/kick action. Role changes and removals lock the room row before checking current caller membership/admin access and the remaining admin. Only the application server may call them; the actor ID must come from `getCallerProfile`, never a request field. Public, anonymous and authenticated execute privileges are revoked. Search paths are pinned empty and table names qualified. Existing table grants and RLS remain unchanged.

There is no trigger. Account/profile deletion, creator-room cascades, system provisioning and direct maintenance SQL keep their existing semantics. Those paths may leave an adminless surviving room; this proposal does not claim a global invariant or silently promote anyone. Existing adminless rooms are not backfilled.

## Adapter and activation

`lib/messages/room-atomic.ts` exposes `roomAtomicWritesEnabled`, `createRoomAtomic`, `setRoomAdminAtomic` and `removeRoomMemberAtomic`. The server actions resolve identity and validate/coerce form inputs as before. When the flag is on, call the appropriate RPC; a missing function, refused authorization or unconfirmed result must fail closed. Do not retry through separate legacy writes. When the flag is blank/off, the current action implementation remains in use and its known race remains recorded in HYG-205.

Before activation:

1. Independently review SQL permissions, actor provenance and manual-action scope. Approve SQL registration and deployment separately from this draft publication.
2. Create the migration with the CLI, apply it only in a disposable/staging environment, regenerate RPC types, and run existing database tests plus the independent two-session checks below. Do not infer live acceptance from local PGlite.
3. Wire all four manual actions to the adapter: create, promote/demote, leave, and kick. Keep the opt-in `ROOM_ATOMIC_WRITES` blank until the migration, exact deployed app and staging proof agree. Record the database/app identities.
4. After explicit production rollout approval, apply the registered migration, verify catalog grants and invoker/search-path metadata, deploy the guarded app, and enable the flag only after readiness is confirmed. Verify controlled staging journeys before any authorized production fixture writes.
5. On activation errors, turn the flag off and preserve evidence; do not execute compensating production deletes or mutate existing rooms automatically. Disabling the flag restores existing behavior and its recorded race, so it is mitigation, not a permanent repair.

## Independent-session staging checks still required

Use synthetic profiles and rooms in an isolated database, not customer data. Session A begins a transaction and calls the role-change RPC while holding the parent row lock. Session B attempts the conflicting demotion/removal and must block. Commit A; B must re-check current actor authority/admin count, refuse when necessary, and leave at least one admin. Repeat for self-demotion versus leave, kick versus demotion, and promotion/removal. Test different rooms do not share a lock. Roll back or explicitly remove only the isolated fixtures.

The reproducible [local harness](../scripts/proposals/check-room-atomic-sql.mjs) takes the isolated checkout path as its sole argument and requires `PGLITE_MODULE` to point to an existing trusted PGlite module; it installs nothing. An optional `ROOM_ATOMIC_RECEIPT_FILE` records its JSON evidence. It uses an in-memory database and makes no network or production connection. The harness tests actual PostgreSQL function syntax, transaction rollback, grants, authorization, last-admin serial behavior and unchanged cascades. Its single embedded session cannot establish independent-transaction blocking or prove the production PostgREST deployment. The old stale-count interleaving is a deterministic negative control, not parallel-session evidence.

## Read-only rollout preflight

Classify existing adminless public/private rooms separately; do not automatically delete them or grant an admin. Confirm the current `room_members` count trigger functions retain their registered search-path pins, because the new invoker RPC uses an empty search path. Check the three RPC signatures, execute ACLs, `prosecdef = false`, and pinned search paths after registration. No direct browser write privilege is added.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions), [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html), [volatile function snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html).
