'use client'

import { useRouter } from 'next/navigation'

// The splash "Join" CTA. Records where on the page the visitor clicked (as a
// viewport-height %), so /welcome can tear the page open along that seam.
export function JoinButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const yPct = (e.clientY / window.innerHeight) * 100
    try {
      sessionStorage.setItem('freq-tear-y', String(yPct))
    } catch {
      // sessionStorage may be unavailable (private mode); /welcome falls back to centre.
    }
    router.push('/welcome')
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  )
}
