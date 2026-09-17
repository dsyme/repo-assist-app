import { RepoWorkflow, RepoRun } from '@shared/types'

export type WorkflowKind = 'cicd' | 'ghaw' | 'copilot' | 'github'

/** Classify a workflow into a kind used for grouping/icon selection in AutomationsList. */
export function workflowKind(w: RepoWorkflow, agentic: boolean): WorkflowKind {
  // GitHub built-in automations — check by name first, before agentic
  if (w.name === 'Dependabot Updates' || w.name === 'pages-build-deployment') return 'github'
  if (w.path.startsWith('dynamic/') && w.name.toLowerCase().includes('copilot')) return 'copilot'
  if (agentic) return 'ghaw'
  if (w.path.startsWith('dynamic/')) return 'github'
  return 'cicd'
}

/** Human-readable label for a workflow kind. */
export function kindLabel(kind: WorkflowKind): string {
  switch (kind) {
    case 'ghaw': return 'Agentic'
    case 'copilot': return 'Copilot'
    case 'github': return 'GitHub'
    default: return 'CI/CD'
  }
}

/** Compute a succinct time span like "19h", "3d", "2w" from the oldest run to now. */
export function runsTimeSpan(runList: RepoRun[]): string {
  if (runList.length === 0) return ''
  // Runs are newest-first; oldest is last
  const oldest = new Date(runList[runList.length - 1].createdAt)
  const diffMs = Date.now() - oldest.getTime()
  const hours = Math.round(diffMs / (1000 * 60 * 60))
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d`
  const weeks = Math.round(days / 7)
  return `${weeks}w`
}
