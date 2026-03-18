
import { Text, ActionList, Spinner, Button } from '@primer/react'
import { SyncIcon } from '@primer/octicons-react'
import { RepoPR } from '@shared/types'
import { usePRListActions, PRItemRow } from './PRItemRow'

interface PRListProps {
  repo: string
  prs: RepoPR[]
  writeMode: boolean
  loading?: boolean
  onSelectItem: (number: number) => void
  onRefresh: () => void
  onPRStateChange?: (prNumber: number) => void
}

export function PRList({ repo, prs, writeMode, loading, onSelectItem, onRefresh, onPRStateChange }: PRListProps) {
  const actions = usePRListActions(repo, prs, onPRStateChange)

  // Apply local overrides to props, filtering out closed/merged PRs
  const effectivePRs = prs
    .map(pr => actions.localOverrides[pr.number] ? { ...pr, ...actions.localOverrides[pr.number] } : pr)
    .filter(pr => pr.state !== 'MERGED' && pr.state !== 'CLOSED')
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
        <Button
          leadingVisual={loading ? undefined : SyncIcon}
          onClick={onRefresh}
          size="small"
          disabled={loading}
        >
          {loading ? <><Spinner size="small" /> Refreshing…</> : 'Refresh'}
        </Button>
      </div>

      <ActionList>
        {sorted.map(pr => (
          <PRItemRow
            key={pr.number}
            pr={pr}
            actions={actions}
            onSelect={() => onSelectItem(pr.number)}
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
