import { describe, expect, it } from 'vitest'
import { workflowKind, kindLabel, runsTimeSpan } from './automation-classify'
import { RepoWorkflow, RepoRun } from '@shared/types'

function makeWorkflow(overrides: Partial<RepoWorkflow> = {}): RepoWorkflow {
  return { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', ...overrides }
}

function makeRun(createdAt: string): RepoRun {
  return {
    databaseId: 1,
    displayTitle: 'Run',
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    workflowName: 'CI',
    headBranch: 'main',
    createdAt,
    updatedAt: createdAt,
  }
}

describe('workflowKind', () => {
  it('classifies Dependabot Updates as github', () => {
    expect(workflowKind(makeWorkflow({ name: 'Dependabot Updates' }), false)).toBe('github')
  })

  it('classifies pages-build-deployment as github', () => {
    expect(workflowKind(makeWorkflow({ name: 'pages-build-deployment' }), false)).toBe('github')
  })

  it('classifies dynamic copilot workflows as copilot', () => {
    expect(workflowKind(makeWorkflow({ path: 'dynamic/copilot-swe-agent', name: 'Copilot' }), false)).toBe('copilot')
  })

  it('classifies agentic workflows as ghaw regardless of path', () => {
    expect(workflowKind(makeWorkflow({ path: '.github/workflows/repo-assist.yml' }), true)).toBe('ghaw')
  })

  it('classifies other dynamic workflows as github', () => {
    expect(workflowKind(makeWorkflow({ path: 'dynamic/something-else' }), false)).toBe('github')
  })

  it('classifies regular workflows as cicd', () => {
    expect(workflowKind(makeWorkflow(), false)).toBe('cicd')
  })

  it('prioritizes name-based github detection over agentic flag', () => {
    expect(workflowKind(makeWorkflow({ name: 'Dependabot Updates' }), true)).toBe('github')
  })
})

describe('kindLabel', () => {
  it('maps ghaw to Agentic', () => {
    expect(kindLabel('ghaw')).toBe('Agentic')
  })

  it('maps copilot to Copilot', () => {
    expect(kindLabel('copilot')).toBe('Copilot')
  })

  it('maps github to GitHub', () => {
    expect(kindLabel('github')).toBe('GitHub')
  })

  it('maps cicd to CI/CD', () => {
    expect(kindLabel('cicd')).toBe('CI/CD')
  })
})

describe('runsTimeSpan', () => {
  it('returns empty string for no runs', () => {
    expect(runsTimeSpan([])).toBe('')
  })

  it('returns <1h for very recent runs', () => {
    const now = new Date().toISOString()
    expect(runsTimeSpan([makeRun(now)])).toBe('<1h')
  })

  it('returns hours for runs under 48h old', () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
    expect(runsTimeSpan([makeRun(new Date().toISOString()), makeRun(tenHoursAgo)])).toBe('10h')
  })

  it('returns days for runs under 14 days old', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(runsTimeSpan([makeRun(new Date().toISOString()), makeRun(fiveDaysAgo)])).toBe('5d')
  })

  it('returns weeks for runs 14+ days old', () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
    expect(runsTimeSpan([makeRun(new Date().toISOString()), makeRun(threeWeeksAgo)])).toBe('3w')
  })

  it('uses the oldest (last) run in a newest-first list', () => {
    const now = new Date().toISOString()
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    expect(runsTimeSpan([makeRun(now), makeRun(tenDaysAgo)])).toBe('10d')
  })
})
