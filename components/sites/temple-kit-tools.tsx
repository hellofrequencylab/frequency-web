'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, LayoutGrid, Package, Settings, ShoppingBag, User, X } from 'lucide-react'
import { TEMPLE_KIT_CHROME_COPY as COPY, templeKitInitials } from '@/lib/sites/temple-kit-chrome'

// THE TEMPLE KIT HEADER TOOLS (design: HeaderIcon bag + account, CartDrawer, AccountMenu). Two icon buttons ahead of the
// Space's header button: the bag (with its count) opens the 440px drawer from the right, the account button opens the 290px menu.
// The page is cached and anonymous, so the account draws the signed-out state and asks the site itself (/_s/me, the signed display
// cookie the login handoff sets) who is reading, exactly as the Network site's account does. A person's account lives on
// Frequency: Log in and every door in the menu open there, and say so. Every look is the skin's (.tk-*).

export interface TempleKitCartItem {
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

const FREE_SHIPPING = 120
const money = (n: number) => (n === 0 ? 'Free' : `$${n.toLocaleString('en-US')}`)

/** The bag drawer: a native dialog, so the page behind is inert, Escape closes it and focus returns to the bag. */
function CartDrawer({ dialog, items, shopHref }: { dialog: React.RefObject<HTMLDialogElement | null>; items: TempleKitCartItem[]; shopHref: string | null }) {
  const B = COPY.bag
  const total = items.reduce((n, c) => n + c.price, 0)
  const physical = items.some((c) => c.ship)
  const count = items.reduce((n, c) => n + c.qty, 0)
  return (
    <dialog ref={dialog} className="tk-drawer" aria-label={B.title} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close() }}>
      <div className="tk-drawer-panel">
        <div className="tk-drawer-head">
          <span className="tk-drawer-title">{B.title} &middot; {count}</span>
          <button type="button" className="tk-icon-btn" data-bare="" aria-label="Close" onClick={() => dialog.current?.close()}><X aria-hidden size={18} /></button>
        </div>
        {physical && (
          <div className="tk-drawer-meter">
            <p className="tk-meter-row"><span>{total >= FREE_SHIPPING ? B.freeShipping : `${money(FREE_SHIPPING - total)} ${B.toFreeShipping}`}</span><span>{Math.min(total, FREE_SHIPPING)} / {FREE_SHIPPING}</span></p>
            <span className="tk-meter" role="presentation"><span style={{ width: `${Math.min(100, (total / FREE_SHIPPING) * 100)}%` }} /></span>
          </div>
        )}
        <div className="tk-drawer-body">
          {items.length === 0 ? (
            <div className="tk-empty">
              <span className="tk-empty-mark" aria-hidden><ShoppingBag size={26} strokeWidth={1.25} /></span>
              <p className="tk-empty-title">{B.empty}</p>
              <p className="tk-empty-body">{B.emptyBody}</p>
              {shopHref && <a className="hs-btn hs-btn-secondary" data-size="sm" href={shopHref} onClick={() => dialog.current?.close()}>{B.visit}</a>}
            </div>
          ) : (
            items.map((c) => (
              <div key={c.key} className="tk-line">
                {c.img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
                  <img src={c.img} alt="" className="tk-line-img" />
                ) : (
                  <span className="tk-line-img" aria-hidden />
                )}
                <div>
                  <p className="tk-line-title">{c.title}</p>
                  {c.meta && <p className="tk-line-meta">{c.meta}</p>}
                  <p className="tk-line-meta">Qty {c.qty}</p>
                </div>
                <p className="tk-line-price">{money(c.price)}</p>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="tk-drawer-foot">
            <p className="tk-drawer-sub"><span>{B.subtotal}</span><b>{money(total)}</b></p>
            {shopHref && <a className="hs-btn hs-btn-primary" data-size="lg" href={shopHref}>{B.checkout}</a>}
            <p className="tk-drawer-fine">{B.fine}</p>
          </div>
        )}
      </div>
    </dialog>
  )
}

export function TempleKitTools({ origin, slug, shopHref, items = [] }: { origin: string; slug: string; shopHref: string | null; items?: TempleKitCartItem[] }) {
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
  const door = (Icon: typeof User, label: string, href: string) => (
    <a role="menuitem" key={label} href={href} className="tk-menu-item"><Icon aria-hidden size={15} strokeWidth={1.5} />{label}</a>
  )

  return (
    <div className="tk-tools" ref={box}>
      {shopHref && (
        <button type="button" className="tk-icon-btn" aria-label="Bag" title="Bag" aria-haspopup="dialog" onClick={showBag}>
          <ShoppingBag aria-hidden size={19} strokeWidth={1.5} />
          {count > 0 && <span className="tk-count">{count}</span>}
        </button>
      )}
      <div className="tk-account">
        <button type="button" className="tk-icon-btn" aria-label={account ? `${account.name}, account menu` : 'Account'} title="Account" aria-haspopup="menu" aria-expanded={open} data-active={open ? '' : undefined} onClick={() => setOpen((o) => !o)}>
          {account ? (
            <span className="tk-avatar">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the member's own photo on an arbitrary host
                <img src={account.avatarUrl} alt="" />
              ) : (
                templeKitInitials(account.name)
              )}
            </span>
          ) : (
            <User aria-hidden size={19} strokeWidth={1.5} />
          )}
        </button>
        {open && (
          <div className="tk-menu" role="menu">
            {account ? (
              <>
                <div className="tk-menu-who">
                  <span className="tk-avatar" data-size="lg">
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
                {door(LayoutGrid, 'Overview', account.handle ? `${origin}/people/${account.handle}` : `${origin}/feed`)}
                {door(Calendar, 'Bookings', `${origin}/events`)}
                {door(Package, A.orders, `${origin}/orders`)}
                {door(Settings, A.settings, `${origin}/settings`)}
                <form method="post" action="/_s/exit"><button type="submit" role="menuitem" className="tk-menu-out">{A.signOut}</button></form>
              </>
            ) : (
              <div className="tk-menu-in">
                <p className="tk-menu-welcome">{A.welcome} <em>{A.welcomeEm}</em></p>
                <p className="tk-menu-body">{A.signedOutBody}</p>
                <a role="menuitem" className="hs-btn hs-btn-primary" data-size="sm" href={logIn} onClick={comeBack}>{A.emailLink}</a>
              </div>
            )}
          </div>
        )}
      </div>
      <span className="tk-tools-rule" aria-hidden />
      {shopHref && <CartDrawer dialog={drawer} items={items} shopHref={shopHref} />}
    </div>
  )
}
