import React from 'react'
import { Text, ActionList, Label, RelativeTime, StateLabel } from '@primer/react'
import {
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  GitPullRequestClosedIcon,
  GitMergeIcon,
} from '@primer/octicons-react'
import { RepoPR } from '@shared/types'

interface PRListProps {
  repo: string
  prs: RepoPR[]
  writeMode: boolean
  onSelectItem: (number: number) => void
}

export function PRList({ repo, prs, writeMode, onSelectItem }: PRListProps) {
  const sorted = [...prs].sort((a, b) => {
    if (a.isDraft !== b.isDraft) return a.isDraft ? 1 : -1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const getCIStatus = (pr: RepoPR): { text: string; variant: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done' | 'sponsors' } => {
    if (!pr.statusCheckRollup || pr.statusCheckRollup.length === 0) {
      return { text: 'No checks', variant: 'secondary' }
    }
    const states = pr.statusCheckRollup.map(s => s.state)
    if (states.some(s => s === 'FAILURE' || s === 'ERROR')) return { text: 'CI failing', variant: 'danger' }
    if (states.some(s => s === 'PENDING')) return { text: 'CI running', variant: 'attention' }
    if (states.every(s => s === 'SUCCESS')) return { text: 'CI passing', variant: 'success' }
    return { text: 'CI unknown', variant: 'secondary' }
  }

  const isRepoAssist = (pr: RepoPR) => pr.labels?.some(l => l.name === 'repo-assist')

  return (
    <div>
      <div className="panel-header">
        <h2>Pull Requests — {repo.split('/').pop()}</h2>
        <span className="subtitle">
          {prs.length} open PRs
          {!writeMode && ' · Read-only mode'}
        </span>
      </div>

      <ActionList>
        {sorted.map(pr => {
          const ci = getCIStatus(pr)
          const isBot = isRepoAssist(pr)
          return (
            <ActionList.Item key={pr.number} onClick={() => onSelectItem(pr.number)}>
              <ActionList.LeadingVisual>
                {pr.isDraft
                  ? <GitPullRequestDraftIcon size={16} className="gh-icon-draft" />
                  : pr.state === 'MERGED'
                    ? <GitMergeIcon size={16} className="gh-icon-merged" />
                    : pr.state === 'CLOSED'
                      ? <GitPullRequestClosedIcon size={16} className="gh-icon-closed" />
                      : <GitPullRequestIcon size={16} className="gh-icon-open" />
                }
              </ActionList.LeadingVisual>
              <div>
                <Text weight="semibold">
                  #{pr.number} {pr.title.replace('[Repo Assist] ', '')}
                </Text>
                <div className="pr-meta">
                  {pr.isDraft && <StateLabel status="draft">Draft</StateLabel>}
                  <Label variant={ci.variant}>{ci.text}</Label>
                  {isBot && (
                    <Label variant="accent">🤖 Repo Assist</Label>
                  )}
                  <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                    by {pr.author?.login ?? 'unknown'}
                  </Text>
                  <RelativeTime date={new Date(pr.updatedAt)} />
                </div>
              </div>
            </ActionList.Item>
          )
        })}
      </ActionList>

      {prs.length === 0 && (
        <div className="empty-state">
          <Text>No open pull requests</Text>
        </div>
      )}
    </div>
  )
}
