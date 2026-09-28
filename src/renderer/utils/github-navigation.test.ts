import { describe, expect, it } from 'vitest'
import { githubItemUrl, isExternalNavigationModifier, isInteractiveNavigationTarget } from './github-navigation'

describe('GitHub navigation', () => {
  it('builds issue and pull request URLs', () => {
    expect(githubItemUrl('owner/repo', 'issue', 12)).toBe('https://github.com/owner/repo/issues/12')
    expect(githubItemUrl('owner/repo', 'pr', 34)).toBe('https://github.com/owner/repo/pull/34')
  })

  it('recognizes Ctrl, Cmd, and Shift as external-navigation modifiers', () => {
    expect(isExternalNavigationModifier({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true)
    expect(isExternalNavigationModifier({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe(true)
    expect(isExternalNavigationModifier({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe(true)
    expect(isExternalNavigationModifier({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe(false)
  })

  it('recognizes interactive descendants without treating the row itself as nested', () => {
    const row = {} as Element
    const nestedButton = {} as Element
    const nestedButtonTarget = { closest: (selector: string) => selector.includes('button') ? nestedButton : null }
    const rowTextTarget = { closest: (selector: string) => selector.includes('button') ? row : null }

    expect(isInteractiveNavigationTarget({
      target: nestedButtonTarget as unknown as EventTarget,
      currentTarget: row as unknown as EventTarget & HTMLElement,
    })).toBe(true)
    expect(isInteractiveNavigationTarget({
      target: rowTextTarget as unknown as EventTarget,
      currentTarget: row as unknown as EventTarget & HTMLElement,
    })).toBe(false)
  })
})
