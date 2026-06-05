import Link from 'next/link'
import { PhotoHero } from '@/components/marketing/marketing-ui'
import { signInWithMagicLink, signInWithGoogle } from './actions'

// Sign-in styled like the founder splash (the beta-sequence pages): a full-bleed
// photo hero with the warm gradient scrim, and the auth card sitting over it.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const nextValue =
    next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : ''

  return (
    <PhotoHero
      image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
      alt="A Frequency community gathered together outdoors at golden hour"
      focal="object-center"
      minHeight="screen"
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="A place you’re actually missed when you’re gone."
    >
      <div className="mx-auto mt-2 w-full max-w-sm rounded-2xl border border-white/10 bg-surface/95 p-6 text-left shadow-pop backdrop-blur">
        {error && (
          <div className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger ring-1 ring-danger">
            {decodeURIComponent(error)}
          </div>
        )}

        {/* Magic link */}
        <form action={signInWithMagicLink} className="space-y-3">
          {nextValue && <input type="hidden" name="next" value={nextValue} />}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-text placeholder-subtle shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
          >
            Send magic link
          </button>
        </form>

        <div className="relative my-5">
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
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm font-medium text-text shadow-sm transition-colors hover:bg-surface-elevated"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-subtle">
          New here?{' '}
          <Link href="/beta" className="font-semibold text-primary-strong hover:underline">
            Request access
          </Link>
        </p>
      </div>
    </PhotoHero>
  )
}
