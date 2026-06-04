import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// A post-login destination is only honoured if it's a same-origin absolute path.
// We stash it in a short-lived cookie rather than on the callback URL, so the auth
// provider's redirect-allowlist match is never affected (emailRedirectTo stays the
// bare, known-good /auth/callback). The callback re-reads and re-validates it.
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === 'string' ? raw : ''
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : ''
}

const POST_LOGIN_COOKIE = 'fq_post_login'

async function stashNext(next: string) {
  if (!next) return
  ;(await cookies()).set(POST_LOGIN_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // an hour to click the magic link
  })
}

async function getCallbackUrl() {
  const origin = (await headers()).get('origin')
  return `${origin}/auth/callback`
}

async function signInWithMagicLink(formData: FormData) {
  'use server'
  const email = formData.get('email') as string
  await stashNext(safeNext(formData.get('next')))
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await getCallbackUrl() },
  })

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/sign-in/confirm')
}

async function signInWithGoogle(formData: FormData) {
  'use server'
  await stashNext(safeNext(formData.get('next')))
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: await getCallbackUrl(),
      // Always show Google's account chooser instead of silently reusing the
      // browser's active session — lets people pick which account to sign in with.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? 'OAuth failed')}`)
  }

  redirect(data.url)
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const nextValue =
    next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : ''

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-8">

        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text">
            Frequency
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to your community
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger ring-1 ring-danger">
            {decodeURIComponent(error)}
          </div>
        )}

        {/* Magic link */}
        <form action={signInWithMagicLink} className="space-y-4">
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-text"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm placeholder-subtle shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Send magic link
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-subtle">or</span>
          </div>
        </div>

        {/* Google OAuth */}
        <form action={signInWithGoogle}>
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-white px-4 py-2 text-sm font-medium text-text shadow-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </form>

      </div>
    </main>
  )
}
