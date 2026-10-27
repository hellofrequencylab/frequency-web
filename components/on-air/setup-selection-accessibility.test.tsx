// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import React, { act, type ComponentType, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { choiceTileClasses } from '@/components/ui/choice-tile'

type Props = { active: boolean; onClick: () => void; label?: string; icon?: React.ElementType; children?: ReactNode; title?: string; disabled?: boolean }
// Load the actual pure setup helper bodies. This deliberately avoids mounting timer
// engines/audio/persistence; no copied JSX implementation can drift from production.
function actualControl(file: string, name: string): ComponentType<Props> {
  const source = ts.createSourceFile(file, readFileSync(resolve(process.cwd(), file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (!declaration) throw new Error(`Missing actual ${name} in ${file}`)
  const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText
  return new Function('React', 'choiceTileClasses', `${js}\nreturn ${name}`)(React, choiceTileClasses) as ComponentType<Props>
}
const SeatedMode = actualControl('components/on-air/session.tsx', 'ModeButton')
const MovementMode = actualControl('components/on-air/movement-session.tsx', 'ModeButton')
const MovementPreset = actualControl('components/on-air/movement-session.tsx', 'Chip')
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const Icon = () => <span aria-hidden />

describe('actual timer setup controls announce selection', () => {
  it.each([['seated mode', SeatedMode], ['movement mode', MovementMode], ['movement preset', MovementPreset]] as const)('%s exposes both selected states and retains its click callback', async (_label, Control) => {
    const onClick = vi.fn()
    const props = { onClick, label: 'Practice mode', icon: Icon, children: 'Five minutes', title: 'Preset' }
    await act(async () => root.render(<Control {...props} active={false} />))
    let button = container.querySelector('button')!
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await act(async () => button.click())
    expect(onClick).toHaveBeenCalledOnce()
    await act(async () => root.render(<Control {...props} active />))
    button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps an unavailable seated mode disabled rather than starting a session', async () => {
    const onClick = vi.fn()
    await act(async () => root.render(<SeatedMode active={false} disabled onClick={onClick} label="Timed sit" icon={Icon} />))
    const button = container.querySelector('button')!
    expect(button.disabled).toBe(true)
    await act(async () => button.click())
    expect(onClick).not.toHaveBeenCalled()
  })
})
