// THE NATIVE SIGN-IN RETURN, decided in one place (LIVE-718 fix, 2026-10-14).
//
// A magic link the Frequency app asks for comes back to https://<site>/auth/native?code=…. The
// `code` is a PKCE authorization code, and its code_verifier was minted by supabase-js INSIDE THE
// APP (device keychain). Only the holder of that verifier can exchange the code. So:
//
//   • App installed and the universal link fires: iOS opens the app, the web never sees the request.
//   • The link opens in a browser instead (no app, a mail client's in-app browser, a copy-paste, a
//     desktop): the web holds no verifier for this code. The old route forwarded it to
//     /auth/callback anyway, whose exchange always failed, so every such click ended on
//     "That link did not work".
//
// The web therefore NEVER exchanges a native code. It hands the code to the app through the app's
// own scheme (`frequency://auth/callback`, the redirect the app already handles for OAuth), and
// offers a way to sign in on the web instead, which starts a fresh web flow with a web verifier.
// Handing the code to a custom scheme is safe under PKCE: an app that squats the scheme gets a code
// it cannot redeem without the verifier.
//
// Nothing here weakens the callback: no token is ever read or written, `next` passes safeNextPath,
// and the code must look like a code before it is echoed anywhere.
//
// PURE: no server imports, so the route, the hand-off page and the tests share it.

import { safeNextPath } from '@/lib/auth/safe-next'
import { callbackErrorCode } from '@/app/sign-in/errors'

/** The app's own scheme redirect (docs/APP-CONTRACT.md §11). */
export const NATIVE_APP_CALLBACK = 'frequency://auth/callback'

/** The web page that offers the hand-off. */
export const NATIVE_HANDOFF_PATH = '/auth/native/open'

/** A Supabase PKCE auth code is a UUID; accept that alphabet and nothing that could break a URL. */
const CODE_SHAPE = /^[A-Za-z0-9-]{16,128}$/

type Params = { get(name: string): string | null }

type NativeReturn =
  /** A usable code: show the hand-off page. */
  | { kind: 'handoff'; code: string; next: string; appUrl: string; webSignIn: string; handoffPath: string }
  /** Supabase said no, or there is nothing to hand over: back to sign-in with a closed-set code. */
  | { kind: 'failed'; to: string }

function signInPath(next: string, error?: string): string {
  const q = new URLSearchParams()
  if (error) q.set('error', error)
  if (next) q.set('next', next)
  const s = q.toString()
  return s ? `/sign-in?${s}` : '/sign-in'
}

/** What a request to /auth/native (or the hand-off page) should do. */
export function decideNativeReturn(params: Params): NativeReturn {
  const next = safeNextPath(params.get('next'))
  const error = params.get('error')
  const errorCode = params.get('error_code')

  // Supabase put a failure on the redirect (an expired or reused link, a cancelled consent).
  if (error || errorCode) {
    return { kind: 'failed', to: signInPath(next, callbackErrorCode({ error, error_code: errorCode })) }
  }

  const raw = params.get('code')
  if (!raw || !CODE_SHAPE.test(raw)) {
    return { kind: 'failed', to: signInPath(next, 'callback') }
  }

  const forward = new URLSearchParams({ code: raw })
  if (next) forward.set('next', next)
  const query = forward.toString()
  return {
    kind: 'handoff',
    code: raw,
    next,
    appUrl: `${NATIVE_APP_CALLBACK}?${query}`,
    webSignIn: signInPath(next),
    handoffPath: `${NATIVE_HANDOFF_PATH}?${query}`,
  }
}
