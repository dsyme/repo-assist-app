import { ActionList, Label, RelativeTime, Text } from '@primer/react'
import { CommentIcon, IssueClosedIcon, IssueOpenedIcon } from '@primer/octicons-react'
import { RepoIssue } from '@shared/types'
import { isInteractiveNavigationTarget, type NavigationEvent } from '../utils/github-navigation'

interface IssueItemRowProps {
  issue: RepoIssue
  unread: boolean
  onSelect: (event: NavigationEvent) => void
  className?: string
  style?: React.CSSProperties
  trailingVisual?: React.ReactNode
}

export function IssueItemRow({ issue, unread, onSelect, className, style, trailingVisual }: IssueItemRowProps) {
  const handleSelect = (event: NavigationEvent) => {
    if (isInteractiveNavigationTarget(event)) return
    onSelect(event)
  }

  return (
    <ActionList.Item
      onSelect={handleSelect}
      className={className}
      style={style}
    >
      <ActionList.LeadingVisual>
        {issue.state.toUpperCase() === 'CLOSED'
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
          {issue.labels?.slice(1).map(label => (
            <Label key={label.name} size="small">{label.name}</Label>
          ))}
        </div>
      </div>
      <ActionList.TrailingVisual>
        <span className="sidebar-item-row">
          <CommentIcon size={12} />
          <Text size="small">{Array.isArray(issue.comments) ? issue.comments.length : 0}</Text>
        </span>
        {trailingVisual}
      </ActionList.TrailingVisual>
    </ActionList.Item>
  )
}
