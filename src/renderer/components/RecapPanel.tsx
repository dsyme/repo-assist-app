import React, { useState, useEffect } from 'react'
import { Text, ActionList, Label, Button, Spinner, Flash } from '@primer/react'
import {
  GitPullRequestIcon,
  CommentIcon,
  GitMergeIcon,
  XCircleIcon,
  AlertIcon,
  TagIcon,
  CheckCircleIcon,
  SyncIcon,
} from '@primer/octicons-react'
import { RecapItem, RepoIssue, RepoPR, RepoRun, NavState } from '@shared/types'

interface RepoData {
  issues: RepoIssue[]
  prs: RepoPR[]
  runs: RepoRun[]
  loading: boolean
}

interface RecapPanelProps {
  repos: string[]
  repoData: Record<string, RepoData>
  onNavigate: (nav: NavState) => void
}

const RECAP_ICONS: Record<RecapItem['type'], React.ReactNode> = {
  REVIEW_PR: <GitPullRequestIcon size={16} className="gh-icon-open" />,
  CHECK_COMMENT: <CommentIcon size={16} className="gh-icon-accent" />,
  MERGE_PR: <GitMergeIcon size={16} className="gh-icon-merged" />,
  CLOSE_ISSUE: <XCircleIcon size={16} className="gh-icon-closed" />,
  FIX_CI: <AlertIcon size={16} className="gh-icon-danger" />,
  TRIAGE_ISSUE: <TagIcon size={16} className="gh-icon-muted" />,
}

const RECAP_LABELS: Record<RecapItem['type'], { text: string; variant: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done' | 'sponsors' }> = {
  REVIEW_PR: { text: 'Review PR', variant: 'accent' },
  CHECK_COMMENT: { text: 'Check comment', variant: 'primary' },
  MERGE_PR: { text: 'Merge PR', variant: 'success' },
  CLOSE_ISSUE: { text: 'Close issue', variant: 'attention' },
  FIX_CI: { text: 'Fix CI', variant: 'danger' },
  TRIAGE_ISSUE: { text: 'Triage', variant: 'secondary' },
}

/** Generate recap items from loaded data (heuristic, pre-AI) */
function generateRecapItems(repos: string[], repoData: Record<string, RepoData>): RecapItem[] {
  const items: RecapItem[] = []
  let priority = 0

  for (const repo of repos) {
    const data = repoData[repo]
    if (!data) continue
    const shortName = repo.split('/').pop() || repo

    // PRs with passing CI → REVIEW_PR
    for (const pr of data.prs) {
      const isRepoAssist = pr.labels?.some(l => l.name === 'repo-assist')
      if (isRepoAssist && pr.isDraft) {
        items.push({
          id: `${repo}#pr${pr.number}`,
          type: 'REVIEW_PR',
          repo,
          number: pr.number,
          title: pr.title.replace('[Repo Assist] ', ''),
          summary: `${shortName} — Repo Assist draft PR`,
          priority: priority++,
          done: false,
        })
      }
    }

    // Recent issues with repo-assist comments → CHECK_COMMENT
    for (const issue of data.issues.slice(0, 10)) {
      const isRepoAssist = issue.labels?.some(l => l.name === 'repo-assist')
      if (isRepoAssist && !issue.title.includes('Monthly Activity')) {
        items.push({
          id: `${repo}#issue${issue.number}`,
          type: 'CHECK_COMMENT',
          repo,
          number: issue.number,
          title: issue.title.replace('[Repo Assist] ', ''),
          summary: `${shortName} — bot activity on issue`,
          priority: priority++,
          done: false,
        })
      }
    }
  }

  return items.slice(0, 10) // Show top 10
}

export function RecapPanel({ repos, repoData, onNavigate }: RecapPanelProps) {
  const [items, setItems] = useState<RecapItem[]>([])
  const [synthesizing, setSynthesizing] = useState(false)
  const hasData = Object.keys(repoData).length > 0

  useEffect(() => {
    if (hasData) {
      // Start with heuristic items
      setItems(generateRecapItems(repos, repoData))
    }
  }, [repos, repoData, hasData])

  const handleComplete = (id: string) => {
    setItems(prev =>
      prev.map(item => item.id === id ? { ...item, done: true } : item)
    )
    // Animate out after a short delay
    setTimeout(() => {
      setItems(prev => prev.filter(item => item.id !== id))
    }, 400)
  }

  const handleRefresh = async () => {
    setSynthesizing(true)
    // For now, regenerate from heuristics
    // TODO: Call AI synthesis here
    await new Promise(r => setTimeout(r, 500))
    setItems(generateRecapItems(repos, repoData))
    setSynthesizing(false)
  }

  const handleItemClick = (item: RecapItem) => {
    // Navigate to the item's detail view
    const isPR = item.type === 'REVIEW_PR' || item.type === 'MERGE_PR'
    onNavigate({
      section: null,
      repo: item.repo,
      repoSection: isPR ? 'prs' : 'issues',
      selectedItem: item.number,
    })
  }

  const pendingItems = items.filter(item => !item.done)
  const completedCount = items.length - pendingItems.length

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Morning Recap</h2>
          <span className="subtitle">
            {pendingItems.length} actions across {repos.length} repositories
            {completedCount > 0 && ` · ${completedCount} completed`}
          </span>
        </div>
        <Button
          leadingVisual={synthesizing ? Spinner : SyncIcon}
          onClick={handleRefresh}
          disabled={synthesizing}
          size="small"
        >
          {synthesizing ? 'Synthesizing...' : 'Refresh'}
        </Button>
      </div>

      {!hasData && (
        <div className="loading-center" style={{ height: 200 }}>
          <div className="loading-spinner" />
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Fetching repository data…</Text>
        </div>
      )}

      {hasData && (
      <ActionList>
        {pendingItems.map((item, idx) => (
          <ActionList.Item key={item.id} onClick={() => handleItemClick(item)}>
            <ActionList.LeadingVisual>
              {RECAP_ICONS[item.type]}
            </ActionList.LeadingVisual>
            <div className="recap-item-row fade-in" style={{ animationDelay: `${idx * 60}ms` }}>
              <div className="recap-item-meta">
                <Label variant={RECAP_LABELS[item.type].variant}>
                  {RECAP_LABELS[item.type].text}
                </Label>
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>{item.repo.split('/').pop()}</Text>
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>#{item.number}</Text>
              </div>
              <Text weight="semibold">{item.title}</Text>
            </div>
            <ActionList.TrailingVisual>
              <Button
                size="small"
                variant="invisible"
                onClick={(e) => { e.stopPropagation(); handleComplete(item.id) }}
                aria-label="Mark as done"
              >
                <CheckCircleIcon size={16} />
              </Button>
            </ActionList.TrailingVisual>
          </ActionList.Item>
        ))}
      </ActionList>
      )}

      {pendingItems.length === 0 && hasData && (
        <div className="empty-state">
          <CheckCircleIcon size={48} />
          <p>All caught up! No pending actions.</p>
        </div>
      )}
    </div>
  )
}
