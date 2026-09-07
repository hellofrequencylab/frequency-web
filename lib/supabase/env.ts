import { requireEnvString, requireEnvValue } from '@/lib/env/string'

// The Supabase connection contract, read in ONE place (LIVE-169, 2026-09-06).
//
// The four client constructions (client / server / public / admin) each read the same two or three
// variables, and every one of them did it with a non-null assertion on the bare `process.env` read.
// That assertion is a compile-time claim with no runtime force. When the variable was missing the
// `undefined` flowed into `@supabase/ssr`, which threw "supabaseUrl is required" — a message that
// names neither the variable nor which of the four clients asked for it — and it could not see a
// BLANK value at all, which is exactly the shape a variable created with no value in Vercel takes
// (the blank-is-unset class lib/env/string.ts exists for).
//
// ⚠️ THE `NEXT_PUBLIC_` READS BELOW MUST STAY LITERAL. Next inlines `NEXT_PUBLIC_*` into the browser
// bundle by textual substitution of `…env.NEXT_PUBLIC_X` at build time
// (`next/dist/lib/inline-static-env.js`); a dynamic `process.env[key]` lookup is never replaced and
// would read undefined in the browser, which would break `lib/supabase/client.ts` in production
// while passing every server-side test. The service-role key is server-only, so it can be read by
// name through `requireEnvString`.

/** The project URL every client connects to. Throws, naming the variable, when unset or blank. */
export function supabaseUrl(): string {
  return requireEnvValue('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, 'supabase')
}

/** The anon (RLS-enforced) key used by the browser, cookie-server and public clients. */
export function supabaseAnonKey(): string {
  return requireEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'supabase')
}

/** The service-role key — SERVER ONLY, bypasses RLS entirely. Never reachable from the browser. */
export function supabaseServiceRoleKey(): string {
  return requireEnvString('SUPABASE_SERVICE_ROLE_KEY', 'supabase')
}
