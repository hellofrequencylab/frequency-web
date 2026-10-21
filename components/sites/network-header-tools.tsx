'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, ShoppingBag, User } from 'lucide-react'
import { Input } from '@/components/ui/field'

// THE NETWORK WEBSITE'S HEADER TOOLS: a small search and the account cluster (Log in, Sign up, Cart, Profile).
// The page is cached and anonymous, so the cluster draws the signed-out state and asks Frequency afterwards, with
// the reader's own session (app/api/sites/[slug]/account), who is reading. Log in, Sign up and the profile menu's
// doors go to Frequency and are labelled as such; the search never leaves the site.

export interface SearchItem {
  label: string
  kicker: string
  href: string
}

const fold = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

export function NetworkSearch({ items }: { items: SearchItem[] }) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const show = useCallback(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    input.current?.focus()
  }, [])
  const hide = useCallback(() => {
    ref.current?.close()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        show()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  const found = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    const pool = words.length ? items.filter((i) => words.every((w) => fold(`${i.label} ${i.kicker}`).includes(w))) : items
    return pool.slice(0, 8)
  }, [items, query])

  return (
    <>
      <button type="button" className="nw-search-btn" onClick={show} aria-label="Search the site" aria-haspopup="dialog">
        <Search aria-hidden strokeWidth={1.9} />
        <span className="nw-search-label">Search</span>
        <kbd aria-hidden>⌘K</kbd>
      </button>
      <dialog
        ref={ref}
        className="nw-search"
        aria-label="Search the site"
        onClose={() => { setQuery(''); setActive(0) }}
        onClick={(e) => { if (e.target === ref.current) hide() }}
      >
        <div className="nw-search-card">
          <label className="nw-search-field">
            <Search aria-hidden strokeWidth={1.9} />
            <Input
              ref={input}
              type="search"
              value={query}
              placeholder="Search events, chapters, circles, pages"
              autoComplete="off"
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, found.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                else if (e.key === 'Enter' && found[active]) { hide(); window.location.href = found[active].href }
              }}
            />
          </label>
          {found.length === 0 ? <p className="nw-search-empty">Nothing matches. Try another word.</p> : (
            <ul className="nw-search-list">
              {found.map((item, i) => (
                <li key={`${item.href}:${item.label}`}>
                  <a href={item.href} data-active={i === active || undefined} onClick={hide} onMouseEnter={() => setActive(i)}>
                    <b>{item.label}</b><small>{item.kicker}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  )
}

interface Account { name: string; handle: string | null; avatarUrl: string | null }

export function NetworkAccount({ endpoint, origin, slug, cartHref }: { endpoint: string; origin: string; slug: string; cartHref: string }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { credentials: 'include', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { account?: Account | null } | null) => { if (body?.account?.name) setAccount(body.account) })
      .catch(() => {})
    return () => controller.abort()
  }, [endpoint])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const logIn = `${origin}/sign-in?next=${encodeURIComponent(`/spaces/${slug}`)}`
  const signUp = `${origin}/join`
  return (
    <div className="nw-acct" ref={box}>
      {!account && (
        <>
          <a className="nw-acct-link" href={logIn}>Log in</a>
          <a className="nw-acct-signup hs-btn hs-btn-primary" href={signUp}>Sign up</a>
        </>
      )}
      <a className="nw-icon-btn" href={cartHref} aria-label="Cart and shop"><ShoppingBag aria-hidden strokeWidth={1.8} /></a>
      <button type="button" className="nw-icon-btn nw-acct-profile" aria-haspopup="menu" aria-expanded={open} aria-label={account ? `${account.name}, account menu` : 'Account menu'} onClick={() => setOpen((o) => !o)}>
        {account?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the member's own photo on an arbitrary host
          <img src={account.avatarUrl} alt="" />
        ) : <User aria-hidden strokeWidth={1.8} />}
      </button>
      {open && (
        <div className="nw-acct-menu" role="menu">
          {account ? (
            <>
              <p className="nw-acct-who"><b>{account.name}</b>{account.handle && <small>@{account.handle}</small>}</p>
              <a role="menuitem" href={account.handle ? `${origin}/people/${account.handle}` : `${origin}/feed`}>Your profile</a>
              <a role="menuitem" href={`${origin}/orders`}>Orders</a>
              <a role="menuitem" href={`${origin}/settings`}>Settings</a>
              <form method="post" action={`${origin}/auth/signout`}><button type="submit" role="menuitem">Sign out</button></form>
              <small className="nw-acct-note">These open on Frequency.</small>
            </>
          ) : (
            <>
              <a role="menuitem" href={logIn}>Log in</a>
              <a role="menuitem" href={signUp}>Sign up</a>
              <small className="nw-acct-note">Your account lives on Frequency.</small>
            </>
          )}
        </div>
      )}
    </div>
  )
}
