import NfcManager, { Ndef, NfcTech, type NdefRecord } from 'react-native-nfc-manager'

// The phone's own NFC reader, for tapping a venue tag. A Frequency tag holds one NDEF URI record:
// the Space's /n/<id>?s=<code> check-in link (APP-CONTRACT §12). Writing tags is the CyberUnicorn's
// job (its PN532 hat), not the phone's.

let started = false

export async function phoneNfcState(): Promise<'ready' | 'off' | 'unsupported'> {
  try {
    if (!(await NfcManager.isSupported())) return 'unsupported'
    if (!started) {
      await NfcManager.start()
      started = true
    }
    return (await NfcManager.isEnabled()) ? 'ready' : 'off'
  } catch {
    return 'unsupported'
  }
}

function recordText(r: NdefRecord): string | null {
  const payload = Uint8Array.from(r.payload)
  try {
    if (Ndef.isType(r, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) return Ndef.uri.decodePayload(payload)
    if (Ndef.isType(r, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) return Ndef.text.decodePayload(payload)
    if (r.tnf === Ndef.TNF_ABSOLUTE_URI) return String.fromCharCode(...payload)
  } catch {
    return null
  }
  return null
}

/** Wait for one tag and return the text of its records (URIs first). Resolves [] when cancelled. */
export async function readTagOnce(): Promise<{ texts: string[]; uid: string | null }> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef)
    const tag = await NfcManager.getTag()
    const records = tag?.ndefMessage ?? []
    const texts = records.map(recordText).filter((t): t is string => !!t)
    return { texts, uid: tag?.id ?? null }
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined)
  }
}

export function cancelTagRead() {
  NfcManager.cancelTechnologyRequest().catch(() => undefined)
}
