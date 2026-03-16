import { useMemo } from 'react'
import { Text, ActionList, Label, CounterLabel, RelativeTime, Button } from '@primer/react'
import { IssueOpenedIcon, IssueClosedIcon, CommentIcon, SyncIcon } from '@primer/octicons-react'
import { RepoIssue } from '@shared/types'

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

  const handleClick = (issueNumber: number) => {
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
                  <ActionList.Item
                    key={issue.number}
                    onClick={() => handleClick(issue.number)}
                  >
                    <ActionList.LeadingVisual>
                      {issue.state === 'closed'
                        ? <IssueClosedIcon size={16} className="gh-icon-closed-issue" />
                        : <IssueOpenedIcon size={16} className="gh-icon-open" />
                      }
                    </ActionList.LeadingVisual>
                    <div className="issue-row">
                      <Text weight={unread ? 'semibold' : 'normal'}>
                        #{issue.number} {issue.title}
                      </Text>
                      <div className="issue-meta">
                        <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                          by {issue.author?.login ?? 'unknown'}
                        </Text>
                        <RelativeTime date={new Date(issue.updatedAt)} />
                        {issue.labels?.slice(1).map(l => (
                          <Label key={l.name} size="small">{l.name}</Label>
                        ))}
                      </div>
                    </div>
                    <ActionList.TrailingVisual>
                      <span className="sidebar-item-row">
                        <CommentIcon size={12} />
                        <Text size="small">{Array.isArray(issue.comments) ? issue.comments.length : 0}</Text>
                      </span>
                    </ActionList.TrailingVisual>
                  </ActionList.Item>
                )
              })}
            </ActionList>
          </div>
        )
      })}
    </div>
  )
}
