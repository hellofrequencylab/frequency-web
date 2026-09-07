import type { Json } from '@/lib/database.types'

// One narrow, named conversion for values bound for a `jsonb` column (HYG-054, 2026-09-06).
//
// The generated types give every jsonb column the `Json` type: a recursive union whose object arm is
// `{ [key: string]: Json | undefined }`. A NAMED domain type — `Price`, `Chapter[]`, `SequenceDef`,
// an `AssetSnapshot` — is a perfectly serialisable shape, but it carries no index signature, so
// TypeScript cannot see that it satisfies that arm and rejects the assignment. There is no way to
// express "structurally JSON-safe" without adding an index signature to every domain type, which
// would in turn weaken every other use of them.
//
// So this is a deliberate, single-purpose cast with a name on it, used ONLY where a domain object
// meets a jsonb column. Do NOT reach for it to silence a genuine mismatch: it asserts nothing about
// the value beyond "this is JSON-serialisable", and a value that is not (a Date, a Map, a class
// instance, undefined inside an array) will still be written wrong.
export function asJson(value: unknown): Json {
  return value as Json
}
