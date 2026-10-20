import * as SecureStore from 'expo-secure-store'

// The Supabase session lives in the device keychain (Expo SecureStore), per docs/APP-CONTRACT.md §11.
// SecureStore warns above 2048 bytes per value and a session with its refresh token can pass that, so
// a value is stored in numbered chunks under `<key>.0`, `<key>.1`, … with the count at `<key>.n`.

const CHUNK = 1800
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_')

async function removeChunks(key: string) {
  const n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0
  await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)))
  await SecureStore.deleteItemAsync(`${key}.n`)
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safe(name)
    const n = Number(await SecureStore.getItemAsync(`${key}.n`))
    if (!n) return null
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)))
    return parts.some((p) => p == null) ? null : parts.join('')
  },
  async setItem(name: string, value: string): Promise<void> {
    const key = safe(name)
    await removeChunks(key)
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? ['']
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)))
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length))
  },
  async removeItem(name: string): Promise<void> {
    await removeChunks(safe(name))
  },
}
