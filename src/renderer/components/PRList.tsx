
import { Text, ActionList, Spinner, Button } from '@primer/react'
import { SyncIcon } from '@primer/octicons-react'
import { RepoPR } from '@shared/types'
import { usePRListActions, PRItemRow } from './PRItemRow'
import { ApproveAllWorkflowsButton } from './ApproveAllWorkflowsButton'
import { openGitHubItemOnModifierClick } from '../utils/github-navigation'

interface PRListProps {
  repo: string
  prs: RepoPR[]
  writeMode: boolean
  loading?: boolean
  onSelectItem: (number: number) => void
  onRefresh: () => void
  onPRUpdate?: (prNumber: number, updates: Partial<RepoPR>) => void
  onWorkflowRunsApproved: (runIds: number[]) => void
}

export function PRList({ repo, prs, writeMode, loading, onSelectItem, onRefresh, onPRUpdate, onWorkflowRunsApproved }: PRListProps) {
  const actions = usePRListActions(repo, prs, onPRUpdate)

  const effectivePRs = prs
    .filter(pr => pr.state !== 'MERGED' && pr.state !== 'CLOSED')
  const workflowRunIds = [...new Set(effectivePRs.flatMap(pr => pr.workflowRunIdsAwaitingApproval))]
  const sorted = [...effectivePRs].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Pull Requests — {repo.split('/').pop()}</h2>
          <span className="subtitle">
            {effectivePRs.length} open PRs
            {!writeMode && ' · Read-only mode'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <ApproveAllWorkflowsButton
            runsByRepo={{ [repo]: workflowRunIds }}
            onApproved={onWorkflowRunsApproved}
          />
          <Button
            leadingVisual={loading ? undefined : SyncIcon}
            onClick={onRefresh}
            size="small"
            disabled={loading}
          >
            {loading ? <><Spinner size="small" /> Refreshing…</> : 'Refresh'}
          </Button>
        </div>
      </div>

      <ActionList>
        {sorted.map(pr => (
          <PRItemRow
            key={pr.number}
            pr={pr}
            actions={actions}
            onSelect={(event) => {
              if (openGitHubItemOnModifierClick(event, repo, 'pr', pr.number)) return
              onSelectItem(pr.number)
            }}
          />
        ))}
      </ActionList>

      {effectivePRs.length === 0 && (
        <div className="empty-state">
          <Text>No open pull requests</Text>
        </div>
      )}
    </div>
  )
}
