import type { Metadata } from 'next'
import { FocusTemplate } from '@/components/templates'

export const metadata: Metadata = {
  title: 'Check Your Email',
  robots: { index: false, follow: false },
}

export default function ConfirmPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <FocusTemplate
        title="Check your email"
        description="We sent a magic link to your email address. Click the link to sign in. It expires in 60 minutes."
        width="narrow"
        divider={false}
      >
        <div className="w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-bg">
            <svg
              className="w-6 h-6 text-primary-strong"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <p className="text-xs text-subtle">
            Didn&apos;t get it? Check your spam folder or{' '}
            <a href="/sign-in" className="text-primary-strong hover:text-primary-strong underline">
              try again
            </a>
            .
          </p>
        </div>
      </FocusTemplate>
    </main>
  )
}
