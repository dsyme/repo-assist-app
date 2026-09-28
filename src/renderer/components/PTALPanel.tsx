import { useState, useCallback, useMemo } from 'react'
import { Text, ActionList, Button, Spinner, RelativeTime } from '@primer/react'
import {
  IssueOpenedIcon,
  GitPullRequestIcon,
  CheckCircleIcon,
  SyncIcon,
  CommentIcon,
  GitCommitIcon,
  XIcon,
} from '@primer/octicons-react'
import { PTALItem, RepoIssue, RepoPR, NavState } from '@shared/types'
import { usePRListActions, PRItemRow } from './PRItemRow'
import { ApproveAllWorkflowsButton } from './ApproveAllWorkflowsButton'
import { IssueItemRow } from './IssueItemRow'
import { openGitHubItemOnModifierClick, type NavigationEvent } from '../utils/github-navigation'

interface PTALPanelProps {
  repos: string[]
  /** Canonical PTAL items from App (single source of truth) */
  items: PTALItem[]
  loading: boolean
  initialized: boolean
  /** Optional: restrict to a single repo (for repo-specific view) */
  filterRepo?: string
  /** PR data per repo — used to render rich PR rows */
  repoData?: Record<string, { issues: RepoIssue[]; prs: RepoPR[] }>
  writeMode: boolean
  isUnread: (repo: string, number: number, updatedAt: string) => boolean
  onMarkRead: (key: string) => void
  onClear: (item: PTALItem) => void
  onRefresh: () => void
  onNavigate: (nav: NavState) => void
  onIssueClosed: (repo: string, issueNumber: number) => void
  onPRUpdate?: (repo: string, prNumber: number, updates: Partial<RepoPR>) => void
  onWorkflowRunsApproved: (runIds: number[]) => void
}

export function PTALPanel({ repos, items, loading, initialized, filterRepo, repoData, writeMode, isUnread, onMarkRead, onClear, onRefresh, onNavigate, onIssueClosed, onPRUpdate, onWorkflowRunsApproved }: PTALPanelProps) {
  // Local clearing set: tracks items mid-animation so they render with fade-out
  // before actually being removed from App state
  const [clearing, setClearing] = useState<Set<string>>(new Set())

  const handleClear = useCallback((item: PTALItem) => {
    setClearing(prev => new Set(prev).add(item.key))
    // Persist + protect against races immediately, then remove after animation
    setTimeout(() => {
      onClear(item)
      setClearing(prev => {
        const next = new Set(prev)
        next.delete(item.key)
        return next
      })
    }, 350)
  }, [onClear])

  const handleItemClick = useCallback((event: NavigationEvent, item: PTALItem) => {
    if (openGitHubItemOnModifierClick(event, item.repo, item.type, item.number)) return
    if (item.type === 'issue') onMarkRead(item.key)
    onNavigate({
      section: null,
      repo: item.repo,
      repoSection: item.type === 'pr' ? 'prs' : 'issues',
      selectedItem: item.number,
    })
  }, [onMarkRead, onNavigate])

  // Filter and group items
  const filteredItems = useMemo(() => {
    if (filterRepo) return items.filter(i => i.repo === filterRepo)
    return items
  }, [items, filterRepo])

  const groupedByRepo = useMemo(() => {
    const groups: { repo: string; items: PTALItem[] }[] = []
    const map = new Map<string, PTALItem[]>()
    for (const item of filteredItems) {
      const arr = map.get(item.repo) ?? []
      arr.push(item)
      map.set(item.repo, arr)
    }
    for (const [repo, repoItems] of map) {
      groups.push({ repo, items: repoItems })
    }
    return groups
  }, [filteredItems])

  const shortRepo = (repo: string) => repo.split('/').pop() || repo
  const showGroupHeaders = !filterRepo && groupedByRepo.length > 1
  const workflowRunsByRepo = useMemo(() => {
    const runsByRepo: Record<string, number[]> = {}
    for (const group of groupedByRepo) {
      const prNumbers = new Set(group.items.filter(item => item.type === 'pr').map(item => item.number))
      const runIds = repoData?.[group.repo]?.prs
        .filter(pr => prNumbers.has(pr.number))
        .flatMap(pr => pr.workflowRunIdsAwaitingApproval)
        ?? []
      if (runIds.length > 0) runsByRepo[group.repo] = [...new Set(runIds)]
    }
    return runsByRepo
  }, [groupedByRepo, repoData])

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Please Take a Look</h2>
          <span className="subtitle">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} needing attention
            {filterRepo
              ? <> in {shortRepo(filterRepo)}</>
              : <> across {repos.length} repo{repos.length !== 1 ? 's' : ''}</>
            }
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <ApproveAllWorkflowsButton
            runsByRepo={workflowRunsByRepo}
            onApproved={onWorkflowRunsApproved}
          />
          <Button
            leadingVisual={loading ? Spinner : SyncIcon}
            onClick={onRefresh}
            disabled={loading}
            size="small"
          >
            {loading ? 'Scanning…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {!initialized && (
        <div className="loading-center" style={{ height: 200 }}>
          <Spinner size="medium" />
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Scanning repositories…</Text>
        </div>
      )}

      {initialized && filteredItems.length === 0 && (
        <div className="empty-state">
          <CheckCircleIcon size={48} />
          <p>All caught up! No automation activity needs your attention.</p>
        </div>
      )}

      {initialized && filteredItems.length > 0 && (
        <div>
          {groupedByRepo.map(group => (
            <div key={group.repo}>
              {showGroupHeaders && (
                <div className="ptal-repo-header">
                  <Text weight="semibold" size="small">{shortRepo(group.repo)}</Text>
                </div>
              )}
              <PTALRepoGroup
                repo={group.repo}
                items={group.items}
                repoIssues={repoData?.[group.repo]?.issues ?? []}
                repoPRs={repoData?.[group.repo]?.prs ?? []}
                writeMode={writeMode}
                isUnread={isUnread}
                clearing={clearing}
                onClear={handleClear}
                onItemClick={handleItemClick}
                onIssueClosed={(number) => onIssueClosed(group.repo, number)}
                onPRUpdate={onPRUpdate ? (number, updates) => onPRUpdate(group.repo, number, updates) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Renders a group of PTAL items for a single repo — enables the usePRListActions hook */
function PTALRepoGroup({ repo, items, repoIssues, repoPRs, writeMode, isUnread, clearing, onClear, onItemClick, onIssueClosed, onPRUpdate }: {
  repo: string
  items: PTALItem[]
  repoIssues: RepoIssue[]
  repoPRs: RepoPR[]
  writeMode: boolean
  isUnread: (repo: string, number: number, updatedAt: string) => boolean
  clearing: Set<string>
  onClear: (item: PTALItem) => void
  onItemClick: (event: NavigationEvent, item: PTALItem) => void
  onIssueClosed: (issueNumber: number) => void
  onPRUpdate?: (prNumber: number, updates: Partial<RepoPR>) => void
}) {
  // Filter to just the PRs that appear in PTAL items
  const ptalPRNumbers = useMemo(() => new Set(items.filter(i => i.type === 'pr').map(i => i.number)), [items])
  const relevantPRs = useMemo(
    () => repoPRs.filter(pr => ptalPRNumbers.has(pr.number)),
    [repoPRs, ptalPRNumbers]
  )
  const issueLookup = useMemo(
    () => new Map(repoIssues.map(issue => [issue.number, issue])),
    [repoIssues]
  )

  const actions = usePRListActions(repo, relevantPRs, onPRUpdate)

  // Build a lookup from PR number to RepoPR
  const prLookup = useMemo(() => {
    const map = new Map<number, RepoPR>()
    for (const pr of relevantPRs) {
      map.set(pr.number, pr)
    }
    return map
  }, [relevantPRs])

  return (
    <ActionList>
      {items.map((item, idx) => {
        const isClearing = clearing.has(item.key)
        const pr = item.type === 'pr' ? prLookup.get(item.number) : undefined
        const issue = item.type === 'issue' ? issueLookup.get(item.number) : undefined

        const dismissButton = (
          <button
            className="ptal-dismiss-btn"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClear(item)
            }}
            aria-label="Dismiss item"
            title="Dismiss"
          >
            <XIcon size={14} />
          </button>
        )

        if (pr && pr.state !== 'MERGED' && pr.state !== 'CLOSED') {
          return (
            <div
              key={item.key}
              className={`ptal-row-container fade-in ${isClearing ? 'ptal-clearing' : ''}`}
              style={{ animationDelay: `${idx * 40}ms` }}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest('.pr-action-btn, .ptal-dismiss-btn')) return
                openGitHubItemOnModifierClick(event, item.repo, item.type, item.number)
              }}
            >
              <PRItemRow
                pr={pr}
                actions={actions}
                onSelect={(event) => onItemClick(event, item)}
              />
              {dismissButton}
            </div>
          )
        }

        if (issue) {
          return (
            <div
              key={item.key}
              className={`ptal-row-container fade-in ${isClearing ? 'ptal-clearing' : ''}`}
              style={{ animationDelay: `${idx * 40}ms` }}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest('.pr-action-btn, .ptal-dismiss-btn')) return
                openGitHubItemOnModifierClick(event, item.repo, item.type, item.number)
              }}
            >
              <IssueItemRow
                issue={issue}
                unread={isUnread(repo, issue.number, issue.updatedAt)}
                repo={repo}
                writeMode={writeMode}
                onSelect={(event) => onItemClick(event, item)}
                onIssueClosed={onIssueClosed}
              />
              {dismissButton}
            </div>
          )
        }

        // Keep a fallback for cached PTAL items whose source item is no longer open.
        const action = ptalActionTitle(item)
        return (
          <div
            key={item.key}
            className={`ptal-row-container fade-in ${isClearing ? 'ptal-clearing' : ''}`}
            style={{ animationDelay: `${idx * 40}ms` }}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('.pr-action-btn, .ptal-dismiss-btn')) return
              openGitHubItemOnModifierClick(event, item.repo, item.type, item.number)
            }}
          >
            <ActionList.Item
              onSelect={(event) => onItemClick(event, item)}
            >
              <ActionList.LeadingVisual>
                {item.type === 'pr'
                  ? <GitPullRequestIcon size={16} className="gh-icon-open" />
                  : <IssueOpenedIcon size={16} className="gh-icon-open" />
                }
              </ActionList.LeadingVisual>
              <div className="ptal-item-content">
                <div className="ptal-item-header">
                  <Text style={{ color: 'var(--fgColor-muted)' }}>{action.verb} </Text>
                  <Text weight="semibold">{action.number}</Text>
                  <Text style={{ color: 'var(--fgColor-muted)' }}> — </Text>
                  <Text>{action.title}</Text>
                </div>
                <div className="ptal-item-meta">
                  <PTALActivityBadge activity={item.lastActivity} />
                  <RelativeTime date={new Date(item.lastActivity.when)} style={{ fontSize: 12 }} />
                </div>
              </div>
            </ActionList.Item>
            {dismissButton}
          </div>
        )
      })}
    </ActionList>
  )
}

/**
 * Build a human-friendly action title for a PTAL item
 */
function ptalActionTitle(item: PTALItem): { verb: string; number: string; title: string } {
  const cleanTitle = item.title.replace(/^\[Repo Assist\]\s*/, '')
  const number = `#${item.number}`
  if (item.lastActivity.type === 'comment') {
    return { verb: 'Check comment on', number, title: cleanTitle }
  }
  if (item.lastActivity.type === 'commit') {
    return { verb: 'Review update on', number, title: cleanTitle }
  }
  if (item.type === 'pr') {
    return { verb: 'Review', number, title: cleanTitle }
  }
  return { verb: 'Review', number, title: cleanTitle }
}

function PTALActivityBadge({ activity }: { activity: PTALItem['lastActivity'] }) {
  const name = activity.automationName ?? activity.actor
  const icon = activity.type === 'comment'
    ? <CommentIcon size={12} />
    : activity.type === 'commit'
      ? <GitCommitIcon size={12} />
      : <IssueOpenedIcon size={12} />

  return (
    <span className="ptal-activity-badge">
      {icon}
      <Text size="small" style={{ color: '#da70d6' }}>{name}</Text>
      <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
        {activity.type === 'comment' ? 'commented' : activity.type === 'commit' ? 'pushed' : 'created'}
      </Text>
    </span>
  )
}
