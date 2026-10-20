import 'react-native-url-polyfill/auto'
import { AppState } from 'react-native'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'
import { secureStorage } from './secure-storage'

// supabase-js for sign-in and the session only. Every data read goes through /api/v1 (lib/api.ts) with
// the access token as a bearer, never straight at tables: the contract is the app's one door.
// PKCE, so a magic link or OAuth code is exchanged here and the web callback never sees it
// (APP-CONTRACT §11). The token refreshes only while the app is in the foreground.

export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null

if (supabase) {
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}

/** Where a magic link or OAuth comes back to: the contract's own scheme. */
export const AUTH_REDIRECT = 'frequency://auth/callback'
