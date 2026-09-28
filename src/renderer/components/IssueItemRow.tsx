import { useState } from 'react'
import { ActionList, Label, RelativeTime, Text } from '@primer/react'
import { CommentIcon, IssueClosedIcon, IssueOpenedIcon, NoEntryIcon } from '@primer/octicons-react'
import { RepoIssue } from '@shared/types'
import { isInteractiveNavigationTarget, type NavigationEvent } from '../utils/github-navigation'

interface IssueItemRowProps {
  issue: RepoIssue
  unread: boolean
  repo: string
  writeMode: boolean
  onSelect: (event: NavigationEvent) => void
  onIssueClosed: (issueNumber: number) => void
  className?: string
  style?: React.CSSProperties
  trailingVisual?: React.ReactNode
}

export function IssueItemRow({ issue, unread, repo, writeMode, onSelect, onIssueClosed, className, style, trailingVisual }: IssueItemRowProps) {
  const [closing, setClosing] = useState(false)
  const handleSelect = (event: NavigationEvent) => {
    if (isInteractiveNavigationTarget(event)) return
    onSelect(event)
  }
  const handleClose = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setClosing(true)
    try {
      await window.repoAssist.closeIssue(repo, issue.number, 'completed')
      onIssueClosed(issue.number)
    } catch (err) {
      await window.repoAssist.showMessageBox({
        type: 'error',
        message: `Failed to close issue #${issue.number}`,
        detail: err instanceof Error ? err.message : String(err),
        buttons: ['OK'],
      })
    } finally {
      setClosing(false)
    }
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
          <span className="pr-action-buttons">
            <button
              className="pr-action-btn pr-action-danger"
              title={writeMode ? 'Close issue as completed' : 'Enable write mode to close issue'}
              onClick={handleClose}
              disabled={closing || !writeMode}
            >
              <NoEntryIcon size={14} />
            </button>
          </span>
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
