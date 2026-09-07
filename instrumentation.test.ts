import { describe, it, expect, vi, beforeEach } from 'vitest'

// The reporting boundary for server request errors (LIVE-210, ADR-1236). The classifier in
// lib/observability/request-error.ts has its own test; this one pins that instrumentation.ts
// actually consults it BEFORE Sentry, and that everything else still reaches Sentry with the
// three arguments Next hands over. A filter that exists but is not wired is the invisible half.

const mocks = vi.hoisted(() => ({ captureRequestError: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureRequestError: mocks.captureRequestError }))

import { onRequestError } from './instrumentation'
import { CLIENT_ABORTED_STREAM_MESSAGE, CLIENT_ABORTED_STREAM_DIGEST } from './lib/observability/request-error'

const request = { path: '/crew?_rsc=abc', method: 'GET', headers: {} }
const context = {
  routerKind: 'App Router' as const,
  routePath: '/crew',
  routeType: 'render' as const,
  renderSource: 'react-server-components-payload' as const,
  revalidateReason: undefined,
  renderType: 'dynamic' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('onRequestError', () => {
  it('does not record the client-aborted RSC stream (digest 3689792676)', async () => {
    const err = Object.assign(new Error(CLIENT_ABORTED_STREAM_MESSAGE), { digest: CLIENT_ABORTED_STREAM_DIGEST })
    await onRequestError(err, request, context)
    expect(mocks.captureRequestError).not.toHaveBeenCalled()
  })

  it('still records every other error, with the request and context Next handed over (positive control)', async () => {
    const err = Object.assign(new Error('Only plain objects, and a few built-ins, can be passed to Client Components'), {
      digest: '4155556756',
    })
    await onRequestError(err, request, context)
    expect(mocks.captureRequestError).toHaveBeenCalledTimes(1)
    expect(mocks.captureRequestError).toHaveBeenCalledWith(err, request, context)
  })

  it('records a different stream failure (the classification is exact, not a broad catch)', async () => {
    const err = new Error('The destination stream errored.')
    await onRequestError(err, request, context)
    expect(mocks.captureRequestError).toHaveBeenCalledWith(err, request, context)
  })
})
