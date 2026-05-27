'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { User, Settings, LogOut, ChevronDown } from 'lucide-react'
import { getInitials } from '@/lib/utils'

export type UserMenuProfile = {
  display_name: string
  handle: string
  avatar_url: string | null
}

// ── Unauthenticated buttons ───────────────────────────────────────────────────

export function AuthButtons({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/sign-in"
        className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
          dark
            ? 'text-white/70 hover:text-white hover:bg-white/10'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        Sign in
      </Link>
      <Link
        href="/sign-in"
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          dark
            ? 'bg-white text-gray-900 hover:bg-gray-100'
            : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100'
        }`}
      >
        Join →
      </Link>
    </div>
  )
}

// ── Authenticated dropdown ────────────────────────────────────────────────────

export function UserMenu({ profile }: { profile: UserMenuProfile | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  if (!profile) return <AuthButtons />

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="User menu"
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center select-none">
            {getInitials(profile.display_name)}
          </div>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-black/5 py-1 z-50">
          {/* Identity */}
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
              {profile.display_name}
            </p>
            <p className="text-xs text-gray-400 truncate">@{profile.handle}</p>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href={`/people/${profile.handle}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <User className="w-4 h-4 text-gray-400" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              Settings
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-100 dark:border-gray-800 py-1">
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 w-full text-left transition-colors"
              >
                <LogOut className="w-4 h-4 text-gray-400" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
