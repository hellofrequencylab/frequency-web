import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Belt-and-suspenders: proxy.ts should have already redirected, but guard
  // here too so this page is never reachable without a valid session.
  if (!user) {
    redirect('/sign-in')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Welcome to Frequency
        </h1>
        <p className="text-sm text-gray-500">
          Signed in as{' '}
          <span className="font-medium text-gray-700">{user.email}</span>
        </p>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-indigo-600 hover:text-indigo-500 underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
