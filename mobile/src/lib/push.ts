import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { api } from './api'

// Native push (APP-CONTRACT §10): after the OS grants permission, register the Expo push token with
// POST /api/v1/push/devices, on every cold start (it refreshes last_seen_at), and revoke it on sign-out.
// An Expo token needs the EAS project id, and on Android the build's Firebase config
// (google-services.json). Without either this reports why and changes nothing.

export type PushResult = { ok: true; token: string } | { ok: false; reason: string }

let lastToken: string | null = null

export async function registerForPush(): Promise<PushResult> {
  if (!Device.isDevice) return { ok: false, reason: 'Push needs a real phone, not an emulator.' }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  if (!projectId) return { ok: false, reason: 'This build has no EAS project id yet, so push is off.' }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Frequency', importance: 3 /* AndroidImportance.DEFAULT */ })
  }
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') return { ok: false, reason: 'Notifications are off for Frequency in your phone settings.' }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    await api.registerPush(token)
    lastToken = token
    return { ok: true, token }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Push registration failed.' }
  }
}

export async function revokePush(): Promise<void> {
  if (!lastToken) return
  await api.revokePush(lastToken).catch(() => undefined)
  lastToken = null
}
