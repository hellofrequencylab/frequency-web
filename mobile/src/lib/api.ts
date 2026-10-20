import Constants from 'expo-constants'
import { Platform } from 'react-native'
import {
  CONTRACT_PREFIX,
  appConfigResponse,
  checkinLinksResponse,
  meResponse,
  nodeCaptureResponse,
  pushDeviceResponse,
  rewardsResponse,
  sessionBootstrapResponse,
  type AppConfigView,
  type CheckinLinkView,
  type ContractErrorCode,
  type MeView,
  type RewardsView,
  type SessionBootstrapView,
} from '@frequency/contract'
import type { z } from 'zod'
import { env } from './env'
import { supabase } from './supabase'

// The /api/v1 client. Every response is parsed with the endpoint's envelope schema from the web's own
// contract file (lib/contract/index.ts), so a drift between the server and this build fails loudly here
// instead of rendering garbage. Rules from docs/APP-CONTRACT.md:
//   - branch on error.code, never the message; an unknown code is `internal`;
//   - on 401 refresh once and retry; a second 401 signs out (§2);
//   - `profile_required` sends the person to finish their profile (onboarding) on the web.

export class ApiError extends Error {
  readonly code: ContractErrorCode
  readonly status: number
  constructor(code: ContractErrorCode, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

type EnvelopeSchema<T> = z.ZodType<{ data: T; error: null } | { data: null; error: { code: ContractErrorCode; message: string } }>

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'

async function accessToken(forceRefresh = false): Promise<string | null> {
  if (!supabase) return null
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession()
    return data.session?.access_token ?? null
  }
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function request<T>(schema: EnvelopeSchema<T>, path: string, init: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  if (!env.apiUrl) throw new ApiError('internal', 'This build has no API address. Set EXPO_PUBLIC_API_URL.', 0)
  const wantsAuth = opts.auth !== false
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = wantsAuth ? await accessToken(attempt > 0) : null
    if (wantsAuth && !token) throw new ApiError('unauthorized', 'Sign in to continue.', 401)
    let res: Response
    try {
      res = await fetch(`${env.apiUrl}${CONTRACT_PREFIX}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      })
    } catch {
      throw new ApiError('internal', 'Could not reach Frequency. Check your connection.', 0)
    }
    const json: unknown = await res.json().catch(() => null)
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new ApiError('internal', 'Frequency answered in a shape this app does not know. Update the app.', res.status)
    const body = parsed.data
    if (body.error === null) return body.data
    if (body.error.code === 'unauthorized' && wantsAuth && attempt === 0) continue
    if (body.error.code === 'unauthorized' && wantsAuth) await supabase?.auth.signOut()
    throw new ApiError(body.error.code, body.error.message, res.status)
  }
  throw new ApiError('unauthorized', 'Sign in again.', 401)
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  me: (): Promise<MeView> => request(meResponse, '/me'),
  bootstrap: (): Promise<SessionBootstrapView> => request(sessionBootstrapResponse, '/session/bootstrap', { method: 'POST' }),
  appConfig: (): Promise<AppConfigView> =>
    request(appConfigResponse, `/app-config?platform=${Platform.OS === 'ios' ? 'ios' : 'android'}&version=${encodeURIComponent(APP_VERSION)}`, {}, { auth: false }),
  rewards: (): Promise<RewardsView> => request(rewardsResponse, '/rewards'),
  checkinLinks: async (): Promise<CheckinLinkView[]> => (await request(checkinLinksResponse, '/spaces/checkin-links')).items,
  capture: (nodeId: string, body: { secret?: string | null; location?: { lat: number; lng: number } | null }) =>
    request(nodeCaptureResponse, `/nodes/${encodeURIComponent(nodeId)}/capture`, json(body)),
  registerPush: (token: string) =>
    request(pushDeviceResponse, '/push/devices', json({ platform: Platform.OS === 'ios' ? 'ios' : 'android', provider: 'expo', token, appVersion: APP_VERSION })),
  revokePush: (token: string) => request(pushDeviceResponse, '/push/devices', { method: 'DELETE', body: JSON.stringify({ token }) }),
}

/** Read an unknown thrown value as a sentence a person can read. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'profile_required') return 'Finish setting up your Frequency profile on the web first, then come back.'
    if (e.code === 'rate_limited') return 'Too many tries. Wait a minute and try again.'
    return e.message
  }
  return e instanceof Error ? e.message : 'Something went wrong.'
}
