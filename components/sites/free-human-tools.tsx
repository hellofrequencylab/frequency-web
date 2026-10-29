'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FreeHumanGlyph } from '@/components/sites/free-human-glyph'
import { FREE_HUMAN_CHROME_COPY as COPY } from '@/lib/sites/free-human-chrome'
import { templeKitInitials } from '@/lib/sites/temple-kit-chrome'

// THE FREE HUMAN HEADER TOOLS (design: the bag IconButton with its saffron count, the bag drawer and the account menu). Two icon buttons ahead of the
// Space's header button: the bag (with its count) opens the 440px drawer from the right, the account button opens the 290px menu.
// The page is cached and anonymous, so the account draws the signed-out state and asks the site itself (/_s/me, the signed display
// cookie the login handoff sets) who is reading, exactly as the Network site's account does. A person's account lives on
// Frequency: Log in and every door in the menu open there, and say so. Every look is the skin's (.fh-*).

export interface FreeHumanCartItem {
  key: string
  title: string
  meta?: string | null
  qty: number
  /** Whole currency units, already for this line. */
  price: number
  img?: string | null
  ship?: boolean
}

interface Account { name: string; handle: string | null; avatarUrl: string | null }

const FREE_SHIPPING = 75
const money = (n: number) => (n === 0 ? 'Free' : `$${n.toLocaleString('en-US')}`)

/** The bag drawer: a native dialog, so the page behind is inert, Escape closes it and focus returns to the bag. */
function CartDrawer({ dialog, items, shopHref }: { dialog: React.RefObject<HTMLDialogElement | null>; items: FreeHumanCartItem[]; shopHref: string | null }) {
  const B = COPY.bag
  const total = items.reduce((n, c) => n + c.price, 0)
  const physical = items.some((c) => c.ship)
  const count = items.reduce((n, c) => n + c.qty, 0)
  return (
    <dialog ref={dialog} className="fh-drawer" aria-label={B.title} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close() }}>
      <div className="fh-drawer-panel">
        <div className="fh-drawer-head">
          <span className="fh-drawer-title">Your <em>bag</em>{count > 0 ? ` \u00b7 ${count}` : ''}</span>
          <button type="button" className="fh-icon-btn" data-bare="" aria-label="Close" onClick={() => dialog.current?.close()}><FreeHumanGlyph name="close" size={20} /></button>
        </div>
        {physical && (
          <div className="fh-drawer-meter">
            <p className="fh-meter-row"><span>{total >= FREE_SHIPPING ? B.freeShipping : `${money(FREE_SHIPPING - total)} ${B.toFreeShipping}`}</span><span>{Math.min(total, FREE_SHIPPING)} / {FREE_SHIPPING}</span></p>
            <span className="fh-meter" role="presentation"><span style={{ width: `${Math.min(100, (total / FREE_SHIPPING) * 100)}%` }} /></span>
          </div>
        )}
        <div className="fh-drawer-body">
          {items.length === 0 ? (
            <div className="fh-empty">
              <span className="fh-empty-mark" aria-hidden><FreeHumanGlyph name="bag" size={34} weight={1.25} /></span>
              <p className="fh-empty-title">{B.empty}</p>
              <p className="fh-empty-body">{B.emptyBody}</p>
              {shopHref && <a className="hs-btn hs-btn-secondary" data-size="sm" href={shopHref} onClick={() => dialog.current?.close()}>{B.visit}</a>}
            </div>
          ) : (
            items.map((c) => (
              <div key={c.key} className="fh-line">
                {c.img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
                  <img src={c.img} alt="" className="fh-line-img" />
                ) : (
                  <span className="fh-line-img" aria-hidden />
                )}
                <div>
                  <p className="fh-line-title">{c.title}</p>
                  {c.meta && <p className="fh-line-meta">{c.meta}</p>}
                  <p className="fh-line-meta">Qty {c.qty}</p>
                </div>
                <p className="fh-line-price">{money(c.price)}</p>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="fh-drawer-foot">
            <p className="fh-drawer-sub"><span>{B.subtotal}</span><b>{money(total)}</b></p>
            {shopHref && <a className="hs-btn hs-btn-primary" data-size="lg" href={shopHref}>{B.checkout}</a>}
            <p className="fh-drawer-fine">{B.fine}</p>
          </div>
        )}
      </div>
    </dialog>
  )
}

export function FreeHumanTools({ origin, slug, shopHref, items = [] }: { origin: string; slug: string; shopHref: string | null; items?: FreeHumanCartItem[] }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const count = items.reduce((n, c) => n + c.qty, 0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/_s/me', { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { account?: Account | null } | null) => { if (body?.account?.name) setAccount(body.account) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const showBag = useCallback(() => { if (drawer.current && !drawer.current.open) drawer.current.showModal() }, [])

  const logIn = `${origin}/auth/site-login?slug=${encodeURIComponent(slug)}&next=%2F`
  // Come back to the page the person was on: the address is only known in the browser, so it is read on press.
  const comeBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const here = /^\/(?:[a-z0-9][a-z0-9-]*)?$/.test(window.location.pathname) ? window.location.pathname : '/'
    e.currentTarget.href = `${origin}/auth/site-login?slug=${encodeURIComponent(slug)}&next=${encodeURIComponent(here)}`
  }
  const A = COPY.account
  const door = (label: string, href: string) => (
    <a role="menuitem" key={label} href={href} className="fh-menu-item">{label}</a>
  )

  return (
    <div className="fh-tools" ref={box}>
      {shopHref && (
        <button type="button" className="fh-icon-btn" data-soft="" aria-label="Bag" title="Bag" aria-haspopup="dialog" onClick={showBag}>
          <FreeHumanGlyph name="bag" size={21} />
          {count > 0 && <span className="fh-count">{count}</span>}
        </button>
      )}
      <div className="fh-account">
        <button type="button" className="fh-icon-btn" aria-label={account ? `${account.name}, account menu` : 'Account'} title="Account" aria-haspopup="menu" aria-expanded={open} data-active={open ? '' : undefined} onClick={() => setOpen((o) => !o)}>
          {account ? (
            <span className="fh-avatar">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the member's own photo on an arbitrary host
                <img src={account.avatarUrl} alt="" />
              ) : (
                templeKitInitials(account.name)
              )}
            </span>
          ) : (
            <FreeHumanGlyph name="user" size={21} />
          )}
        </button>
        {open && (
          <div className="fh-menu" role="menu">
            {account ? (
              <>
                <div className="fh-menu-who">
                  <span className="fh-avatar" data-size="lg">
                    {account.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the member's own photo on an arbitrary host
                      <img src={account.avatarUrl} alt="" />
                    ) : (
                      templeKitInitials(account.name)
                    )}
                  </span>
                  <span>
                    <b>{account.name}</b>
                    {account.handle && <small>@{account.handle}</small>}
                  </span>
                </div>
                {door(A.rituals, account.handle ? `${origin}/people/${account.handle}` : `${origin}/feed`)}
                {door(A.orders, `${origin}/orders`)}
                {door(A.settings, `${origin}/settings`)}
                <form method="post" action="/_s/exit"><button type="submit" role="menuitem" className="fh-menu-out">{A.signOut}</button></form>
              </>
            ) : (
              <div className="fh-menu-in">
                <p className="fh-menu-welcome">{A.welcome} <em>{A.welcomeEm}</em></p>
                <p className="fh-menu-body">{A.signedOutBody}</p>
                <a role="menuitem" className="hs-btn hs-btn-primary" data-size="sm" href={logIn} onClick={comeBack}>{A.emailLink}</a>
              </div>
            )}
          </div>
        )}
      </div>
      {shopHref && <CartDrawer dialog={drawer} items={items} shopHref={shopHref} />}
    </div>
  )
}
