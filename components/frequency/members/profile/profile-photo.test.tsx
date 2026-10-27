import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { ProfilePhoto } from './profile-body'
import { readProfileAvatarFocusWithFallback } from '@/lib/profile/header-focus'
it('saved metadata wins over URL focus; absent metadata preserves URL fragment, legacy center and initials', () => {
  const src = 'https://cdn.test/avatar.jpg#fp=30,70'
  expect(readProfileAvatarFocusWithFallback({ avatarFocal: '25% 65%' }, src)).toBe('25% 65%')
  expect(readProfileAvatarFocusWithFallback({}, src)).toBe('30% 70%')
  expect(readProfileAvatarFocusWithFallback({}, 'https://cdn.test/avatar.jpg')).toBeNull()
  const html = renderToStaticMarkup(<ProfilePhoto src={src} name="Test Person" initials="TP" focus={readProfileAvatarFocusWithFallback({ avatarFocal: '25% 65%' }, src)} dimmed />)
  expect(html).toContain('background-position:25% 65%'); expect(html).not.toContain('#fp=')
  expect(html).toContain('av xl mc-photo dimmed'); expect(html).toContain('aria-label="Test Person"')
  expect(renderToStaticMarkup(<ProfilePhoto src={null} name="Test Person" initials="TP" />)).toContain('>TP</span>')
})
it('actual profile page forwards existing loaded metadata and demo flag, without a new read', () => {
  const source = readFileSync('app/(main)/people/[handle]/page.tsx', 'utf8')
  expect(source).toContain('focus={readProfileAvatarFocusWithFallback(profile.meta, profile.avatar_url)} dimmed={isDemo}')
})
