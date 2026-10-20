import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import { duration, easing } from '@/theme'

// space-motion.css for React Native: the three durations and the brand curves, and 0ms when the phone
// asks for reduced motion (the CSS `prefers-reduced-motion` rule).

export const ease = {
  out: Easing.bezier(...easing.out),
  breath: Easing.bezier(...easing.breath),
  drop: Easing.bezier(...easing.drop),
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return reduced
}

/** A duration that is 0 under reduced motion. */
export function useDuration(which: keyof typeof duration): number {
  return useReducedMotion() ? 0 : duration[which]
}

/** The press feedback every pressable in the kit shares: `.btn:active { transform: scale(.97) }`, fast,
 *  ease-out. Returns the animated scale and the two handlers to spread on a Pressable. */
export function usePressScale(to = 0.97) {
  const scale = useState(() => new Animated.Value(1))[0]
  const ms = useDuration('fast')
  const go = (v: number) => Animated.timing(scale, { toValue: v, duration: ms, easing: ease.out, useNativeDriver: true }).start()
  return { scale, onPressIn: () => go(to), onPressOut: () => go(1) }
}
