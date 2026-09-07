import { describe, it, expect } from 'vitest'
import {
  isClientAbortedStream,
  CLIENT_ABORTED_STREAM_MESSAGE,
  CLIENT_ABORTED_STREAM_DIGEST,
} from './request-error'

// LIVE-210 / ADR-1236. The classifier is exact on purpose: React's client-abort cancel is not a
// route failure, but "anything that mentions a stream" would be the broad catch the row forbids.

describe('isClientAbortedStream', () => {
  it('matches the exact message React throws when the client closes the connection mid-stream', () => {
    const err = Object.assign(new Error(CLIENT_ABORTED_STREAM_MESSAGE), { digest: CLIENT_ABORTED_STREAM_DIGEST })
    expect(isClientAbortedStream(err)).toBe(true)
    // The digest is recorded for the reader; the match does not depend on it, because a digest is a
    // hash of message + stack and a Next upgrade can move it.
    expect(isClientAbortedStream(new Error(CLIENT_ABORTED_STREAM_MESSAGE))).toBe(true)
  })

  it('does NOT match a different stream failure, a substring, or a non-error (the positive controls)', () => {
    expect(isClientAbortedStream(new Error('The destination stream closed early. Something else.'))).toBe(false)
    expect(isClientAbortedStream(new Error('The destination stream errored.'))).toBe(false)
    expect(isClientAbortedStream(new Error('stream closed'))).toBe(false)
    expect(isClientAbortedStream(Object.assign(new Error('boom'), { digest: CLIENT_ABORTED_STREAM_DIGEST }))).toBe(false)
    expect(isClientAbortedStream(CLIENT_ABORTED_STREAM_MESSAGE)).toBe(false)
    expect(isClientAbortedStream(null)).toBe(false)
    expect(isClientAbortedStream(undefined)).toBe(false)
  })
})
