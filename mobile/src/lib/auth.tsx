import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { MeView, SessionBootstrapView } from '@frequency/contract'
import { api, ApiError, errorText } from './api'
import { registerForPush, revokePush, type PushResult } from './push'
import { AUTH_REDIRECT, supabase } from './supabase'

// Who is signed in (docs/MOBILE-APP.md §6). Sign-in is supabase-js email (a one-time code, or the magic link that opens
// frequency://auth/callback); after it, and on every cold start, the app calls
// POST /api/v1/session/bootstrap so guest tickets and RSVPs land on the account (APP-CONTRACT §11).

type AuthValue = {
  ready: boolean
  session: Session | null
  me: MeView | null
  /** Set when the account exists but has no Frequency profile yet (`profile_required`). */
  needsProfile: boolean
  error: string | null
  push: PushResult | null
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  exchangeCode: (code: string) => Promise<void>
  signOut: () => Promise<void>
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<MeView | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [push, setPush] = useState<PushResult | null>(null)

  const onBoot = useCallback((boot: SessionBootstrapView) => {
    setMe(boot.me)
    setNeedsProfile(false)
    setError(null)
    registerForPush().then(setPush, () => undefined)
  }, [])
  const onBootError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.code === 'profile_required') setNeedsProfile(true)
    else setError(errorText(e))
  }, [])
  const load = useCallback(() => api.bootstrap().then(onBoot, onBootError), [onBoot, onBootError])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setMe(null)
        setNeedsProfile(false)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // One bootstrap per signed-in user per launch.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (userId) api.bootstrap().then(onBoot, onBootError)
  }, [userId, onBoot, onBootError])

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('This build is not connected to Frequency yet.')
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: AUTH_REDIRECT, shouldCreateUser: false } })
    if (e) throw new Error(e.message)
  }, [])

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('This build is not connected to Frequency yet.')
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    if (e) throw new Error(e.message)
  }, [])

  const exchangeCode = useCallback(async (code: string) => {
    if (!supabase) throw new Error('This build is not connected to Frequency yet.')
    const { error: e } = await supabase.auth.exchangeCodeForSession(code)
    if (e) throw new Error(e.message)
  }, [])

  const signOut = useCallback(async () => {
    await revokePush()
    await supabase?.auth.signOut()
    setPush(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ ready, session, me, needsProfile, error, push, sendCode, verifyCode, exchangeCode, signOut, reload: load }),
    [ready, session, me, needsProfile, error, push, sendCode, verifyCode, exchangeCode, signOut, load],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
