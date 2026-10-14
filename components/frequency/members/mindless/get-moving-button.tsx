'use client'

import { useMovement } from '@/components/on-air/movement'

// Get Moving, the one timer's second mode, from a server-rendered Mindless screen (the empty state).
// It opens the same Mindless overlay the header's door opens, on a free movement session, so it needs
// no adopted practice and logs the way it does everywhere else.
export function GetMovingButton({ className = 'btn', label = 'Get Moving' }: { className?: string; label?: string }) {
  const movement = useMovement()
  return (
    <button type="button" className={className} onClick={() => movement.open()}>
      {label}
    </button>
  )
}
