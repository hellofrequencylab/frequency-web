import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

test('the shipped gateway client sends token counting through the same SDK transport without generation', async () => {
  vi.resetModules()
  vi.stubEnv('AI_GATEWAY_URL', 'https://gateway.example.test')
  vi.stubEnv('AI_GATEWAY_API_KEY', 'synthetic-key')
  const requests: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({ url: request.url, body: await request.json() })
    return new Response(JSON.stringify({ input_tokens: 27 }), { headers: { 'content-type': 'application/json' } })
  })
  const { getAnthropic } = await import('./client')
  const quote = await getAnthropic()!.messages.countTokens({ model: 'synthetic-model', system: 'Synthetic', messages: [{ role: 'user', content: 'Synthetic input' }] }, { maxRetries: 0 })
  expect(quote.input_tokens).toBe(27)
  expect(requests).toEqual([{ url: 'https://gateway.example.test/v1/messages/count_tokens', body: { model: 'synthetic-model', system: 'Synthetic', messages: [{ role: 'user', content: 'Synthetic input' }] } }])
})

test('gateway streaming retains terminal usage when the opening event reports zero', async () => {
  vi.resetModules()
  vi.stubEnv('AI_GATEWAY_URL', 'https://gateway.example.test')
  vi.stubEnv('AI_GATEWAY_API_KEY', 'synthetic-key')
  const events = [
    { type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'synthetic-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Synthetic reply' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: 13, output_tokens: 5, cache_read_input_tokens: 128, cache_creation_input_tokens: 4 } },
    { type: 'message_stop' },
  ]
  vi.stubGlobal('fetch', async () => new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }))
  const { getAnthropic } = await import('./client')
  const message = await getAnthropic()!.messages.stream({ model: 'synthetic-model', max_tokens: 32, messages: [{ role: 'user', content: 'Synthetic' }] }, { maxRetries: 0 }).finalMessage()
  expect(message.content).toEqual([{ type: 'text', text: 'Synthetic reply' }])
  expect(message.usage).toMatchObject({ input_tokens: 13, output_tokens: 5, cache_read_input_tokens: 128, cache_creation_input_tokens: 4 })
})
