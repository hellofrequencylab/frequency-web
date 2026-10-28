import { expect, it } from 'vitest'
import { journeyWritesAllowed, localAuthLink, localHttpDestination, stripeDestination } from './journey-safety'

it.each(['https://checkout.stripe.com/c/pay/session', 'https://checkout.stripe.com:443/c/pay/session'])('accepts exact HTTPS hosted Checkout %s', url => {
  expect(stripeDestination(url, 'checkout')).toBe(true)
})
it.each(['https://checkout.stripe.com.evil.test/pay', 'https://evil.test/checkout.stripe.com', 'https://checkout.stripe.com@evil.test/pay', 'http://checkout.stripe.com/pay', 'https://checkout.stripe.com:444/pay', 'https://user@checkout.stripe.com/pay', 'javascript:checkout.stripe.com', 'not a URL'])('rejects misleading Checkout destination %s', url => {
  expect(stripeDestination(url, 'checkout')).toBe(false)
})
it('requires the exact secure Stripe iframe origin too', () => {
  expect(stripeDestination('https://js.stripe.com/v3/frame.html', 'iframe')).toBe(true)
  for (const url of ['https://js.stripe.com.evil.test/frame', 'https://evil.test/?js.stripe.com', 'http://js.stripe.com/frame', 'https://checkout.stripe.com/frame']) expect(stripeDestination(url, 'iframe')).toBe(false)
})
it.each(['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000'])('allows explicitly enabled local writes %s', base => {
  expect(journeyWritesAllowed('1', base, 'http://127.0.0.1:54321').ok).toBe(true)
  expect(journeyWritesAllowed(undefined, base, 'http://127.0.0.1:54321').ok).toBe(false)
})
it.each(['https://frequencylocal.com', 'https://preview.vercel.app', 'https://elsewhere.test', 'http://127.0.0.1.evil.test', 'http://localhost@evil.test', 'ftp://localhost', 'broken', undefined])('refuses hosted or malformed write base %s', base => {
  expect(journeyWritesAllowed('1', base, 'http://127.0.0.1:54321').ok).toBe(false)
})
it('limits mailbox and auth navigation to explicit local origins and auth paths', () => {
  const app = 'http://127.0.0.1:3000', auth = 'http://127.0.0.1:54321'
  expect(localHttpDestination('http://127.0.0.1:54324')).toBe(true)
  expect(localHttpDestination('https://inbucket.evil.test')).toBe(false)
  expect(localAuthLink(`${auth}/auth/v1/verify?token=test`, app, auth)).toBe(true)
  expect(localAuthLink(`${app}/auth/confirm?token_hash=test`, app, auth)).toBe(true)
  for (const link of ['https://evil.test/auth/v1/verify', 'http://127.0.0.1:9999/auth/v1/verify', `${auth}/unrelated`, `${app}/evil/confirm`]) expect(localAuthLink(link, app, auth)).toBe(false)
})

it('refuses a local app when its database destination is hosted or unspecified', () => {
  for (const database of [undefined, 'https://example.supabase.co', 'http://localhost.evil.test']) expect(journeyWritesAllowed('1', 'http://127.0.0.1:3000', database).ok).toBe(false)
})
