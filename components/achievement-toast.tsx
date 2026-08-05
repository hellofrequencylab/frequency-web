'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Award, Trophy, Zap, Flame, Star, Users, Link as LinkIcon,
  Calendar, Mic, Edit, BookOpen, Volume2, MessageCircle, PenTool,
  Compass, Shield, Sun, Gem, Crown, TrendingUp, HandMetal, X,
} from 'lucide-react'
import { TIER_CONFIG } from '@/lib/gamification'
import type { AchievementTier } from '@/lib/gamification'

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

function AchievementToastCard({ achievement, onDismiss }: ToastProps) {
  const tier = TIER_CONFIG[achievement.tier]
  const Icon = ICON_MAP[achievement.icon] ?? Award

  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className={`
        pointer-events-auto w-80 rounded-2xl border shadow-xl backdrop-blur-sm
        animate-[slideUp_0.4s_ease-out]
        ${tier.border} ${tier.bg}
        ${tier.glow ? `shadow-lg ${tier.glow}` : ''}
      `}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tier.bg} ${tier.color} ring-2 ${tier.border}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-3xs font-bold uppercase tracking-wider text-muted">
                Achievement Unlocked
              </p>
              <button
                onClick={onDismiss}
                aria-label="Dismiss"
                className="p-0.5 rounded text-subtle hover:text-muted dark:hover:text-subtle transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
            <p className="text-body-sm font-bold text-text mt-0.5">
              {achievement.name}
            </p>
            <p className="text-meta text-muted mt-0.5 leading-relaxed">
              {achievement.description}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-3xs px-1.5 py-0.5 rounded-md font-semibold ${tier.bg} ${tier.color}`}>
                {tier.label}
              </span>
              {achievement.zapsReward > 0 && (
                <span className="text-2xs font-medium text-warning flex items-center gap-0.5">
                  <Zap className="w-3 h-3" />
                  +{achievement.zapsReward} zaps
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
