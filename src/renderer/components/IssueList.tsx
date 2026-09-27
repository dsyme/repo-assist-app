import { useMemo } from 'react'
import { ActionList, Label, CounterLabel, Button } from '@primer/react'
import { SyncIcon } from '@primer/octicons-react'
import { RepoIssue } from '@shared/types'
import { openGitHubItemOnModifierClick } from '../utils/github-navigation'
import { IssueItemRow } from './IssueItemRow'

interface IssueListProps {
  repo: string
  issues: RepoIssue[]
  isUnread: (repo: string, number: number, updatedAt: string) => boolean
  onMarkRead: (key: string) => void
  onSelectItem: (number: number) => void
  onRefresh: () => void
}

export function IssueList({ repo, issues, isUnread, onMarkRead, onSelectItem, onRefresh }: IssueListProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, RepoIssue[]> = {}
    for (const issue of issues) {
      const primaryLabel = issue.labels?.[0]?.name ?? 'unlabelled'
      if (!groups[primaryLabel]) groups[primaryLabel] = []
      groups[primaryLabel].push(issue)
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [issues])

  const handleClick = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>, issueNumber: number) => {
    if (openGitHubItemOnModifierClick(event, repo, 'issue', issueNumber)) return
    onMarkRead(`${repo}#${issueNumber}`)
    onSelectItem(issueNumber)
  }

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Issues — {repo.split('/').pop()}</h2>
          <span className="subtitle">{issues.length} open issues</span>
        </div>
        <Button
          leadingVisual={SyncIcon}
          onClick={onRefresh}
          size="small"
        >
          Refresh
        </Button>
      </div>

      {grouped.map(([label, groupIssues]) => {
        const unreadCount = groupIssues.filter(i => isUnread(repo, i.number, i.updatedAt)).length
        return (
          <div key={label} style={{ marginBottom: 16 }}>
            <div className="label-group">
              <Label>{label}</Label>
              <CounterLabel>{groupIssues.length}</CounterLabel>
              {unreadCount > 0 && (
                <CounterLabel scheme="primary">{unreadCount} unread</CounterLabel>
              )}
            </div>
            <ActionList>
              {groupIssues.map(issue => {
                const unread = isUnread(repo, issue.number, issue.updatedAt)
                return (
                  <IssueItemRow
                    key={issue.number}
                    issue={issue}
                    unread={unread}
                    onSelect={(event) => handleClick(event, issue.number)}
                  />
                )
              })}
            </ActionList>
          </div>
        )
      })}
    </div>
  )
}
