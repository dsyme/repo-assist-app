import { describe, expect, it } from 'vitest'
import { ptalActionTitle } from './ptal-action-title'
import { PTALItem } from '@shared/types'

function makeItem(overrides: Partial<PTALItem> = {}): PTALItem {
  return {
    key: 'owner/repo#1',
    repo: 'owner/repo',
    type: 'issue',
    number: 1,
    title: 'Some issue title',
    author: 'someone',
    lastActivity: {
      id: 'created:2026-01-01T00:00:00Z',
      actor: 'repo-assist',
      automationName: 'Repo Assist',
      type: 'created',
      when: '2026-01-01T00:00:00Z',
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ptalActionTitle', () => {
  it('strips the "[Repo Assist]" title prefix', () => {
    const item = makeItem({ title: '[Repo Assist] Monthly Activity 2026-09' })
    expect(ptalActionTitle(item).title).toBe('Monthly Activity 2026-09')
  })

  it('formats the item number with a leading #', () => {
    const item = makeItem({ number: 42 })
    expect(ptalActionTitle(item).number).toBe('#42')
  })

  it('uses "Check comment on" verb for comment activity', () => {
    const item = makeItem({ lastActivity: { ...makeItem().lastActivity, type: 'comment' } })
    expect(ptalActionTitle(item).verb).toBe('Check comment on')
  })

  it('uses "Review update on" verb for commit activity', () => {
    const item = makeItem({ lastActivity: { ...makeItem().lastActivity, type: 'commit' } })
    expect(ptalActionTitle(item).verb).toBe('Review update on')
  })

  it('uses "Review" verb for a freshly created PR', () => {
    const item = makeItem({ type: 'pr', lastActivity: { ...makeItem().lastActivity, type: 'created' } })
    expect(ptalActionTitle(item).verb).toBe('Review')
  })

  it('uses "Review" verb for a freshly created issue', () => {
    const item = makeItem({ type: 'issue', lastActivity: { ...makeItem().lastActivity, type: 'created' } })
    expect(ptalActionTitle(item).verb).toBe('Review')
  })

  it('leaves titles without the prefix unchanged', () => {
    const item = makeItem({ title: 'Regular issue title' })
    expect(ptalActionTitle(item).title).toBe('Regular issue title')
  })
})
