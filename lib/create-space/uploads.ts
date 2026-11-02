// THEIR OWN PICTURES ON /create-a-space, kept in the browser only (ADR-1933). A cover, a logo and a host photo can
// be picked at step 4 before there is any account. The files never leave the browser here: the hold carries the
// CHOICE (`up`, lib/launch/carry.ts) and the files wait in IndexedDB until the launch, signed in, uploads them
// through the normal storage path. Nothing in the hold or the draft is ever a data URL (carry.ts rejects those).
//
// The checks (acceptUpload) are pure and tested; the store is a thin IndexedDB wrapper that resolves to nothing
// when IndexedDB is missing or blocked, so the page works the same in a private window, with the kit's pictures.

export const UPLOAD_KINDS = ['cover', 'logo', 'profile'] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]

/** The same ceiling and types as the avatars bucket (lib/storage/profile-images.ts), so what is picked here uploads later. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024
const UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/** Why a file cannot be used, or null when it can. Pure. */
export function acceptUpload(file: { type: string; size: number }): string | null {
  if (!UPLOAD_TYPES.has(file.type)) return 'Use a JPG, PNG, GIF or WebP.'
  if (file.size > UPLOAD_MAX_BYTES) return `That one is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 5 MB.`
  if (file.size === 0) return 'That file is empty.'
  return null
}

export function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === 'string' && (UPLOAD_KINDS as readonly string[]).includes(v)
}

const DB_NAME = 'fq-create-space-uploads'
const STORE = 'files'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => new Promise<T | null>((resolve) => {
    if (!db) { resolve(null); return }
    try {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
      tx.onabort = () => { db.close(); resolve(null) }
    } catch { db.close(); resolve(null) }
  }))
}

/** Keep one of their pictures. Resolves false when nothing could be kept (the object URL still works for the visit). */
export async function putUpload(kind: UploadKind, file: Blob): Promise<boolean> {
  return (await run('readwrite', (s) => s.put(file, kind))) !== null
}

/** Every picture kept so far, by kind. */
export async function getUploads(): Promise<Partial<Record<UploadKind, Blob>>> {
  const out: Partial<Record<UploadKind, Blob>> = {}
  for (const kind of UPLOAD_KINDS) {
    const blob = await run<Blob | undefined>('readonly', (s) => s.get(kind) as IDBRequest<Blob | undefined>)
    if (blob instanceof Blob) out[kind] = blob
  }
  return out
}
