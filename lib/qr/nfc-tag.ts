// Pure helpers for writing a check-in link to an NFC tag from the browser (LIVE-1113).
// The tag holds ONE NDEF URL record, exactly the link shown on the Check in panel, with
// no extra records and no ?m= stamp (the signed code must stay byte-for-byte as issued).

export interface NdefRecordLike {
  recordType: string
  data?: DataView | ArrayBuffer | null
}

/** The one-record message every writer (this page, the Android app) puts on the tag. */
export function nfcTagMessage(link: string): { records: { recordType: 'url'; data: string }[] } {
  return { records: [{ recordType: 'url', data: link }] }
}

/** Decode the first URL record of a tag read back, or null when there is none. */
export function readTagUrl(records: readonly NdefRecordLike[]): string | null {
  const rec = records.find((r) => r.recordType === 'url' && r.data)
  if (!rec?.data) return null
  const buf = rec.data instanceof DataView ? rec.data : new DataView(rec.data)
  return new TextDecoder().decode(buf)
}

/** True when the tag carries exactly the intended link as its only record. */
export function tagMatches(records: readonly NdefRecordLike[], link: string): boolean {
  return records.length === 1 && readTagUrl(records) === link
}
