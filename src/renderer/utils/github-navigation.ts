import type { KeyboardEvent, MouseEvent } from 'react'

export type NavigationEvent =
  | MouseEvent<HTMLElement>
  | KeyboardEvent<HTMLElement>

export function isExternalNavigationModifier(event: Pick<NavigationEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey
}

export function isInteractiveNavigationTarget(event: Pick<NavigationEvent, 'target' | 'currentTarget'>): boolean {
  const target = event.target as { closest?: (selector: string) => Element | null } | null
  const interactiveTarget = target?.closest?.('button, a, input, select, textarea')
  return Boolean(interactiveTarget && interactiveTarget !== event.currentTarget)
}

export function githubItemUrl(repo: string, type: 'issue' | 'pr', number: number): string {
  return `https://github.com/${repo}/${type === 'pr' ? 'pull' : 'issues'}/${number}`
}

export function openGitHubItemOnModifierClick(
  event: NavigationEvent,
  repo: string,
  type: 'issue' | 'pr',
  number: number,
): boolean {
  if (!isExternalNavigationModifier(event)) return false
  event.preventDefault()
  event.stopPropagation()
  void window.repoAssist.openExternal(githubItemUrl(repo, type, number))
  return true
}
