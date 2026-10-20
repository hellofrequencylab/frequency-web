import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fonts, radius, shadow, useTheme } from '@/theme'
import { Button, type ButtonVariant } from './button'
import { ease, useReducedMotion } from './motion'

// Dialog and Toast (components/ui/dialog.tsx, the kit's `.mu-window` sheet, `.fq-toast`).
// Dialog: a bottom sheet on a phone, card surface, radius 28 at the top, the float lift. The scrim is
// ink-void at 60%. It enters with the web's slideUp: from 20px down and .95 scale, 300ms ease-out.
// `useConfirm()` gives every screen the same confirm. Toast: the dark pill 76pt above the bottom edge.

export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; actions?: ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const t = useState(() => new Animated.Value(0))[0]
  useEffect(() => {
    if (open) Animated.timing(t, { toValue: 1, duration: reduced ? 0 : 300, easing: ease.out, useNativeDriver: true }).start()
    else t.setValue(0)
  }, [open, reduced, t])
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: c.card,
              boxShadow: `${shadow.float}, inset 0px 0px 0px 1px ${c.border}`,
              paddingBottom: 24 + insets.bottom,
              opacity: t,
              transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 20, letterSpacing: -0.43, color: c.textStrong }}>
            {title}
          </Text>
          {typeof children === 'string' ? <Text style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: c.text }}>{children}</Text> : children}
          {actions ? <View style={{ gap: 10, marginTop: 6 }}>{actions}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

type ConfirmOptions = { title: string; body: string; confirm: string; variant?: ButtonVariant }
type Feedback = { confirm: (o: ConfirmOptions) => Promise<boolean>; toast: (text: string) => void }

const FeedbackContext = createContext<Feedback | null>(null)

/** Mount once near the root. Gives `useConfirm()` and `useToast()` to every screen. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [toastText, setToastText] = useState<string | null>(null)
  const toastO = useState(() => new Animated.Value(0))[0]
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), [])
  const toast = useCallback(
    (text: string) => {
      setToastText(text)
      if (timer.current) clearTimeout(timer.current)
      Animated.timing(toastO, { toValue: 1, duration: reduced ? 0 : 160, easing: ease.out, useNativeDriver: true }).start()
      timer.current = setTimeout(() => {
        Animated.timing(toastO, { toValue: 0, duration: reduced ? 0 : 260, easing: ease.out, useNativeDriver: true }).start(() => setToastText(null))
      }, 2600)
    },
    [reduced, toastO],
  )
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const answer = (v: boolean) => {
    ask?.resolve(v)
    setAsk(null)
  }

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <Dialog
        open={!!ask}
        onClose={() => answer(false)}
        title={ask?.title ?? ''}
        actions={
          <>
            <Button block variant={ask?.variant ?? 'primary'} label={ask?.confirm ?? 'OK'} onPress={() => answer(true)} />
            <Button block variant="ghost" label="Cancel" onPress={() => answer(false)} />
          </>
        }
      >
        {ask?.body}
      </Dialog>
      {toastText ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { bottom: 76 + insets.bottom, backgroundColor: c.tipBg, opacity: toastO }]}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 18, color: c.onTip }}>{toastText}</Text>
        </Animated.View>
      ) : null}
    </FeedbackContext.Provider>
  )
}

function useFeedback(): Feedback {
  const v = useContext(FeedbackContext)
  if (!v) throw new Error('FeedbackProvider is missing')
  return v
}

export const useConfirm = () => useFeedback().confirm
export const useToast = () => useFeedback().toast

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 24, gap: 12 },
  toast: { position: 'absolute', alignSelf: 'center', borderRadius: radius.orb, paddingVertical: 12, paddingHorizontal: 20, maxWidth: '90%' },
})
