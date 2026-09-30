import { describe, it, expect } from 'vitest'
import {
  BACKUP_CURSOR_KEY,
  backupKey,
  parseCursor,
  runStorageCopy,
  serializeCursor,
  supabaseToR2Deps,
  type BackupCursor,
  type ChangedObject,
  type FetchedObject,
  type StorageCopyDeps,
} from '@/lib/backup/storage-copy'
import type { R2Config } from '@/lib/backup/r2'

// HYG-144 (ADR-1693). The copy loop against a fake Storage and a fake R2: what it copies, where the
// cursor lands after every kind of stop, and that a re-run after a failure resumes rather than
// repeats. Then the production wiring against a mocked Supabase client and a recording fetch: the
// listing RPC gets the cursor, private objects are read through a signed url, and the PUT to R2 is
// signed, streamed with its length, and keyed <bucket>/<path>.

function obj(n: number, over: Partial<ChangedObject> = {}): ChangedObject {
  return {
    id: `00000000-0000-4000-a144-${String(n).padStart(12, '0')}`,
    bucket_id: n % 2 ? 'avatars' : 'library-private',
    name: `p/${n}.png`,
    changed_at: `2026-09-29T0${n}:00:00.123456+00:00`,
    size: 100,
    mimetype: 'image/png',
    ...over,
  }
}

function bodyOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } })
}

/** An in-memory Storage + R2 that behaves like the real pair for the loop's purposes. */
function world(objects: ChangedObject[], opts: { failPutOn?: string; goneIds?: string[]; clockAfter?: number } = {}) {
  const state = {
    cursor: null as BackupCursor | null,
    r2: new Map<string, number>(),
    puts: [] as string[],
    cursorWrites: 0,
    exhaustedCalls: 0,
  }
  const deps: StorageCopyDeps = {
    readCursor: async () => state.cursor,
    writeCursor: async (c) => { state.cursor = c; state.cursorWrites += 1 },
    listChanged: async (after, limit) =>
      objects
        .filter((o) => !after || o.changed_at > after.at || (o.changed_at === after.at && o.id > after.id))
        .slice(0, limit),
    fetchObject: async (o) => {
      if (opts.goneIds?.includes(o.id)) return null
      return { body: bodyOf('x'.repeat(o.size ?? 0)), length: o.size ?? 0, contentType: o.mimetype } satisfies FetchedObject
    },
    putObject: async (key, f) => {
      state.puts.push(key)
      if (opts.failPutOn === key) throw new Error('R2 PUT failed: HTTP 503')
      state.r2.set(key, f.length)
    },
    exhausted: () => {
      state.exhaustedCalls += 1
      return opts.clockAfter !== undefined && state.exhaustedCalls > opts.clockAfter
    },
  }
  return { state, deps }
}

describe('cursor', () => {
  it('round-trips, keeping the database timestamp text exactly (microseconds included)', () => {
    const c = { at: '2026-09-29T05:20:01.123456+00:00', id: 'abc' }
    expect(parseCursor(serializeCursor(c))).toEqual(c)
  })

  it('reads anything unusable as "from the beginning"', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '{}', '{"at":"x"}', '{"at":"","id":"y"}', '{"at":1,"id":"y"}']) {
      expect(parseCursor(raw), String(raw)).toBeNull()
    }
  })

  it('backupKey is <bucket>/<path>', () => {
    expect(backupKey({ bucket_id: 'library-private', name: 'space/a/b.jpg' })).toBe('library-private/space/a/b.jpg')
  })
})

describe('runStorageCopy', () => {
  it('first run copies everything under <bucket>/<path> and parks the cursor on the last object', async () => {
    const objects = [obj(1), obj(2), obj(3)]
    const { state, deps } = world(objects)
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r).toMatchObject({ listed: 3, copied: 3, gone: 0, bytes: 300, stopped: 'caught_up', more: false, cursor_before: null })
    expect([...state.r2.keys()]).toEqual(['avatars/p/1.png', 'library-private/p/2.png', 'avatars/p/3.png'])
    expect(state.cursor).toEqual({ at: objects[2].changed_at, id: objects[2].id })
    expect(state.cursorWrites).toBe(3) // after every object, so a killed run resumes
  })

  it('a second run with nothing new copies nothing', async () => {
    const { state, deps } = world([obj(1), obj(2)])
    await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    state.puts.length = 0
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r).toMatchObject({ listed: 0, copied: 0, stopped: 'caught_up', more: false })
    expect(state.puts).toEqual([])
  })

  it('an object overwritten in Storage passes the cursor again and replaces its copy', async () => {
    const objects = [obj(1), obj(2)]
    const { state, deps } = world(objects)
    await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    objects.push({ ...obj(1), changed_at: '2026-09-29T09:00:00.000001+00:00', size: 250 })
    state.puts.length = 0
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r.copied).toBe(1)
    expect(state.puts).toEqual(['avatars/p/1.png'])
    expect(state.r2.get('avatars/p/1.png')).toBe(250)
  })

  it('a failed PUT stops the run with the cursor on the last success, and the next run resumes there', async () => {
    const objects = [obj(1), obj(2), obj(3), obj(4)]
    const first = world(objects, { failPutOn: 'avatars/p/3.png' })
    const r = await runStorageCopy(first.deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r).toMatchObject({ copied: 2, stopped: 'error', more: true, failed_key: 'avatars/p/3.png' })
    expect(r.error).toMatch(/503/)
    expect(first.state.cursor?.id).toBe(objects[1].id)

    // R2 recovers: same store, same cursor, no failure.
    const again = world(objects)
    again.state.cursor = first.state.cursor
    const r2 = await runStorageCopy(again.deps, { maxItems: 10, maxBytes: 10_000 })
    expect(again.state.puts).toEqual(['avatars/p/3.png', 'library-private/p/4.png']) // no repeat of 1 or 2
    expect(r2).toMatchObject({ copied: 2, stopped: 'caught_up' })
  })

  it('an object deleted after it was listed is passed over, and the cursor moves past it', async () => {
    const objects = [obj(1), obj(2), obj(3)]
    const { state, deps } = world(objects, { goneIds: [objects[1].id] })
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r).toMatchObject({ copied: 2, gone: 1, stopped: 'caught_up' })
    expect(state.puts).not.toContain('library-private/p/2.png')
    expect(state.cursor?.id).toBe(objects[2].id)
  })

  it('stops at the item budget and says more is waiting', async () => {
    const { state, deps } = world([obj(1), obj(2), obj(3)])
    const r = await runStorageCopy(deps, { maxItems: 2, maxBytes: 10_000 })
    expect(r).toMatchObject({ listed: 2, copied: 2, stopped: 'items', more: true })
    expect(state.cursor?.id).toBe(obj(2).id)
  })

  it('stops before the object that would cross the byte cap', async () => {
    const { state, deps } = world([obj(1), obj(2), obj(3)])
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 250 })
    expect(r).toMatchObject({ copied: 2, bytes: 200, stopped: 'bytes', more: true })
    expect(state.cursor?.id).toBe(obj(2).id)
  })

  it('always takes the first object, so one file larger than the cap cannot block every night', async () => {
    const { deps } = world([obj(1, { size: 5_000 }), obj(2)])
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 1_000 })
    expect(r).toMatchObject({ copied: 1, bytes: 5_000, stopped: 'bytes', more: true })
  })

  it('stops on the clock before starting another object', async () => {
    const { state, deps } = world([obj(1), obj(2), obj(3)], { clockAfter: 1 })
    const r = await runStorageCopy(deps, { maxItems: 10, maxBytes: 10_000 })
    expect(r).toMatchObject({ copied: 1, stopped: 'time', more: true })
    expect(state.puts).toEqual(['avatars/p/1.png'])
  })
})

// ── the production wiring ────────────────────────────────────────────────────────────────────

/** The client supabaseToR2Deps takes; the fake below implements only what it calls. */
type AdminClient = Parameters<typeof supabaseToR2Deps>[0]

const R2: R2Config = { accountId: 'acct123', accessKeyId: 'AKID', secretAccessKey: 'SECRET', bucket: 'freq-backup' }

function fakeAdmin(opts: { cursor?: string | null; rows?: unknown[]; signError?: string } = {}) {
  const calls = { rpc: [] as unknown[], upserts: [] as unknown[], signed: [] as string[] }
  const admin = {
    from: (table: string) => {
      expect(table).toBe('platform_settings')
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            expect([col, val]).toEqual(['key', BACKUP_CURSOR_KEY])
            return { maybeSingle: async () => ({ data: opts.cursor ? { value: opts.cursor } : null, error: null }) }
          },
        }),
        upsert: async (row: unknown) => { calls.upserts.push(row); return { error: null } },
      }
    },
    rpc: async (fn: string, args: unknown) => {
      expect(fn).toBe('backup_storage_objects_since')
      calls.rpc.push(args)
      return { data: opts.rows ?? [], error: null }
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (name: string) => {
          calls.signed.push(`${bucket}/${name}`)
          if (opts.signError) return { data: null, error: { message: opts.signError } }
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${name}?token=t` }, error: null }
        },
      }),
    },
  }
  return { admin: admin as unknown as AdminClient, calls }
}

function recordingFetch(storageStatus = 200) {
  const puts: Array<{ url: string; headers: Record<string, string>; body: string }> = []
  const gets: Array<{ url: string; headers: Record<string, string> }> = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (init?.method === 'PUT') {
      const body = await new Response(init.body as ReadableStream).text()
      puts.push({ url, headers, body })
      return new Response(null, { status: 200 })
    }
    gets.push({ url, headers })
    if (storageStatus !== 200) return new Response('nope', { status: storageStatus })
    return new Response('hello world', { status: 200, headers: { 'content-length': '11', 'content-type': 'image/png' } })
  }) as typeof fetch
  return { impl, puts, gets }
}

describe('supabaseToR2Deps', () => {
  it('reads the cursor, passes it to the RPC, streams a private object to R2 signed and keyed, and writes the cursor', async () => {
    const cursor = { at: '2026-09-28T05:20:00.654321+00:00', id: '00000000-0000-4000-a144-000000000000' }
    const row = { id: '00000000-0000-4000-a144-000000000009', bucket_id: 'library-private', name: 'space 1/orig.png', changed_at: '2026-09-29T01:00:00.000001+00:00', size: '11', mimetype: 'image/png' }
    const { admin, calls } = fakeAdmin({ cursor: serializeCursor(cursor), rows: [row] })
    const f = recordingFetch()
    const deps = supabaseToR2Deps(admin, R2, { exhausted: () => false, fetchImpl: f.impl })
    const r = await runStorageCopy(deps, { maxItems: 500, maxBytes: 1_000_000 })

    expect(calls.rpc).toEqual([{ p_after_at: cursor.at, p_after_id: cursor.id, p_limit: 500 }])
    expect(calls.signed).toEqual(['library-private/space 1/orig.png'])
    expect(f.gets[0].headers['accept-encoding']).toBe('identity')
    expect(f.puts).toHaveLength(1)
    const put = f.puts[0]
    expect(put.url).toBe('https://acct123.r2.cloudflarestorage.com/freq-backup/library-private/space%201/orig.png')
    expect(put.body).toBe('hello world')
    expect(put.headers['content-length']).toBe('11')
    expect(put.headers['content-type']).toBe('image/png')
    expect(put.headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD')
    expect(put.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/)
    expect(put.headers.host).toBeUndefined() // fetch sets it from the url
    expect(put.headers.authorization).not.toContain('SECRET')

    expect(r).toMatchObject({ copied: 1, bytes: 11, stopped: 'caught_up' })
    expect(calls.upserts).toHaveLength(1)
    const written = calls.upserts[0] as { key: string; value: string }
    expect(written.key).toBe(BACKUP_CURSOR_KEY)
    expect(parseCursor(written.value)).toEqual({ at: row.changed_at, id: row.id })
  })

  it('first run sends no cursor to the RPC', async () => {
    const { admin, calls } = fakeAdmin()
    const deps = supabaseToR2Deps(admin, R2, { exhausted: () => false, fetchImpl: recordingFetch().impl })
    const r = await runStorageCopy(deps, { maxItems: 500, maxBytes: 1 })
    expect(calls.rpc).toEqual([{ p_after_at: undefined, p_after_id: undefined, p_limit: 500 }])
    expect(r.stopped).toBe('caught_up')
  })

  it('an object Storage no longer has is passed over, not failed', async () => {
    const row = { id: 'i1', bucket_id: 'posts', name: 'a.png', changed_at: 't1', size: 5, mimetype: null }
    const { admin, calls } = fakeAdmin({ rows: [row], signError: 'Object not found' })
    const f = recordingFetch()
    const r = await runStorageCopy(supabaseToR2Deps(admin, R2, { exhausted: () => false, fetchImpl: f.impl }), { maxItems: 5, maxBytes: 100 })
    expect(r).toMatchObject({ copied: 0, gone: 1, stopped: 'caught_up' })
    expect(f.puts).toEqual([])
    expect(calls.upserts).toHaveLength(1)
  })

  it('a Storage read error stops the run and keeps the cursor', async () => {
    const row = { id: 'i1', bucket_id: 'posts', name: 'a.png', changed_at: 't1', size: 5, mimetype: null }
    const { admin, calls } = fakeAdmin({ rows: [row] })
    const f = recordingFetch(500)
    const r = await runStorageCopy(supabaseToR2Deps(admin, R2, { exhausted: () => false, fetchImpl: f.impl }), { maxItems: 5, maxBytes: 100 })
    expect(r).toMatchObject({ copied: 0, stopped: 'error', failed_key: 'posts/a.png' })
    expect(r.error).toMatch(/HTTP 500/)
    expect(f.puts).toEqual([])
    expect(calls.upserts).toEqual([])
  })
})
