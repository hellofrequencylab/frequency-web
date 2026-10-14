// THE ONE RULE FOR A POST-SIGN-IN DESTINATION. The sign-in page, its two actions and /auth/callback
// all read a `next` that arrives off a query string, a form field or a cookie, so each one is
// attacker-influenceable. Only a same-origin absolute path is honoured.
//
// The three checks each copy used to make (starts with `/`, not `//`, not `/\`) missed one shape:
// a control or space character. `/%09/evil.com` decodes to `/<tab>/evil.com`, which passes all three,
// and a browser strips the tab from a Location header and follows `//evil.com` off-site. A real
// in-app path never carries a raw control character, a space or a backslash (they arrive
// percent-encoded), so any of them anywhere fails closed.
//
// Pure: no server imports, so the page, the actions, the route handler and the test share it.

/** `raw` when it is a safe same-origin absolute path, otherwise ''. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return ''
  if (!raw.startsWith('/')) return ''
  if (raw.startsWith('//')) return ''
  // Backslash anywhere (browsers read `/\host` as `//host`), and C0 controls, space and DEL.
  if (/[\\\u0000- \u007f]/.test(raw)) return ''
  return raw
}
