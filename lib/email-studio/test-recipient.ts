// WHO A TEST SEND GOES TO (EMAIL-035). Blank means the signed-in operator's own address, as before; anything
// else must be ONE plain address, so a test can never fan out to a list or smuggle a header through a newline.

const ADDRESS = /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[^\s@,;<>"()[\]\\]+$/

export type TestRecipient = { ok: true; to: string; own: boolean } | { ok: false; error: string }

export function parseTestRecipient(raw: string | null | undefined, ownEmail: string | null): TestRecipient {
  const typed = (raw ?? '').trim()
  if (!typed) {
    return ownEmail
      ? { ok: true, to: ownEmail, own: true }
      : { ok: false, error: 'We could not find an email on your account to send the test to.' }
  }
  if (typed.length > 254 || !ADDRESS.test(typed)) return { ok: false, error: 'Enter one email address to send the test to.' }
  return { ok: true, to: typed, own: typed.toLowerCase() === (ownEmail ?? '').toLowerCase() }
}
