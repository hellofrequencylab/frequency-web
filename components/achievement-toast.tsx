'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Award, Trophy, Zap, Flame, Star, Users, Link as LinkIcon,
  Calendar, Mic, Edit, BookOpen, Volume2, MessageCircle, PenTool,
  Compass, Shield, Sun, Gem, Crown, TrendingUp, HandMetal,
} from 'lucide-react'
import { TIER_CONFIG } from '@/lib/gamification'
import type { AchievementTier } from '@/lib/gamification'
import { Toast } from '@/components/ui/toast'

const ICON_MAP: Record<string, React.ElementType> = {
  award: Award, trophy: Trophy, zap: Zap, flame: Flame, star: Star,
  users: Users, link: LinkIcon, calendar: Calendar, mic: Mic, edit: Edit,
  'book-open': BookOpen, 'volume-2': Volume2, 'message-circle': MessageCircle,
  'pen-tool': PenTool, compass: Compass, shield: Shield, sun: Sun,
  gem: Gem, crown: Crown, 'trending-up': TrendingUp, 'hand-metal': HandMetal,
}

export interface AchievementUnlock {
  id: string
  name: string
  description: string
  icon: string
  tier: AchievementTier
  zapsReward: number
}

interface ToastProps {
  achievement: AchievementUnlock
  onDismiss: () => void
}

// The CARD is components/ui/toast.tsx now. What stays here is what is actually
// achievement-specific: the icon lookup, the TIER tint (which is data, so it arrives as a
// ToastSkin rather than a tone), the eyebrow, the tier chip + Zaps reward footer, and the
// 6s dwell — a Quest award earns twice the reading time a "+15 Zaps" notice does.
function AchievementToastCard({ achievement, onDismiss }: ToastProps) {
  const tier = TIER_CONFIG[achievement.tier]
  const Icon = ICON_MAP[achievement.icon] ?? Award

  return (
    <Toast
      className="w-80"
      size="lg"
      skin={{ surface: tier.bg, border: tier.border, ink: tier.color, glow: tier.glow }}
      icon={<Icon className="h-6 w-6" />}
      eyebrow="Achievement Unlocked"
      title={achievement.name}
      duration={6000}
      dismissible
      onDismiss={onDismiss}
      footer={
        <>
          <span
            className={`rounded-control px-1.5 py-0.5 text-3xs font-semibold ${tier.bg} ${tier.color}`}
          >
            {tier.label}
          </span>
          {achievement.zapsReward > 0 && (
            <span className="flex items-center gap-0.5 text-2xs font-medium text-warning">
              <Zap className="h-3 w-3" aria-hidden />+{achievement.zapsReward} zaps
            </span>
          )}
        </>
      }
    >
      {achievement.description}
    </Toast>
  )
}

// Global toast container. Rendered once in the layout
export function AchievementToastContainer() {
  const [toasts, setToasts] = useState<AchievementUnlock[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    function handleEvent(e: CustomEvent<AchievementUnlock>) {
      setToasts(prev => [...prev, e.detail])
    }
    window.addEventListener('achievement-unlocked', handleEvent as EventListener)
    return () => window.removeEventListener('achievement-unlocked', handleEvent as EventListener)
  }, [])

  if (toasts.length === 0) return null

  return (
    // The TOAST LANE of the bottom-right stacking contract (see the comment in
    // components/sidebar/game-stats-dock.tsx): md clears the chat edge pill (bottom-20),
    // lg clears the Vault dock chip too (bottom-32). Mobile keeps bottom-20 (above the tab bar).
    // BOTTOM-RIGHT LANE, and the arithmetic behind it (verified 2026-08-04).
    // Mobile: the chat edge pill sits at bottom-20 with h-11, so it occupies 80-124px, and
    // The lane itself is <ToastLane> in app/(main)/layout.tsx — ONE fixed column shared with the
    // zap stack. This container used to declare its own `fixed bottom-32 md:bottom-24 right-4
    // z-50`, byte-identical to the zap toast's, so two independent boxes claimed the same rect
    // and DOM order decided which one a member could read. See components/toast-lane.tsx.
    <div className="flex flex-col items-end gap-3">
      {toasts.map(t => (
        <AchievementToastCard
          key={t.id}
          achievement={t}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>
  )
}

// Fire this from client code after a server action completes
export function showAchievementToast(achievement: AchievementUnlock) {
  window.dispatchEvent(
    new CustomEvent('achievement-unlocked', { detail: achievement })
  )
}
