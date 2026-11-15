// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CampaignLinkBuilder } from './campaign-link-builder'

it('generates a copyable production link without exposing the private label', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('a7452a9d-c9c8-4b7a-97b1-afc59859c001')
  const copy = vi.fn().mockResolvedValue(undefined)
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<CampaignLinkBuilder />))
    const inputs = container.querySelectorAll('input')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inputs[0], 'Private wellness label')
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
      const selects = container.querySelectorAll('select')
      selects[1].value = '/join'
      selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
    await act(async () => button('Generate campaign link').click())
    const link = container.querySelector('input[readonly]') as HTMLInputElement
    expect(link.value).toContain('https://frequencylocal.com/join?utm_source=email')
    expect(link.value).not.toContain('wellness')
    expect(link.value).toContain('utm_campaign=a7452a9d-c9c8-4b7a-97b1-afc59859c001')
    await act(async () => button('Copy link').click())
    expect(copy).toHaveBeenCalledWith(link.value)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Campaign link copied.')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    uuid.mockRestore()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.unstubAllGlobals()
  }
})

it('discards a generated link when its destination choice changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('a7452a9d-c9c8-4b7a-97b1-afc59859c001')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<CampaignLinkBuilder />))
    const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label)
    await act(async () => button('Generate campaign link')!.click())
    expect(container.querySelector('input[readonly]')).not.toBeNull()
    await act(async () => {
      const destination = container.querySelectorAll('select')[1]
      destination.value = '/join'
      destination.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('input[readonly]')).toBeNull()
    expect(button('Copy link')).toBeUndefined()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Generate a new campaign link')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    uuid.mockRestore()
    vi.unstubAllGlobals()
  }
})
