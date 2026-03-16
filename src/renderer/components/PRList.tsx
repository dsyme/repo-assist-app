
import { useState, useEffect, useRef } from 'react'
import { Text, ActionList, Label, RelativeTime, Spinner, Button } from '@primer/react'
import {
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  GitPullRequestClosedIcon,
  GitMergeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CheckIcon,
  SyncIcon,
  AlertIcon,
  NoEntryIcon,
} from '@primer/octicons-react'
import { RepoPR, PRBranchStatus } from '@shared/types'

interface PRListProps {
  repo: string
  prs: RepoPR[]
  writeMode: boolean
  onSelectItem: (number: number) => void
  onRefresh: () => void
  onPRStateChange?: (prNumber: number) => void
}

export function PRList({ repo, prs, writeMode, onSelectItem, onRefresh, onPRStateChange }: PRListProps) {
  const [markingReady, setMarkingReady] = useState<number | null>(null)
  const [updatingBranch, setUpdatingBranch] = useState<number | null>(null)
  const [approvingPR, setApprovingPR] = useState<number | null>(null)
  const [mergingPR, setMergingPR] = useState<number | null>(null)
  const [closingPR, setClosingPR] = useState<number | null>(null)
  // Optimistic overrides for PRs mutated in this view (e.g. draft → ready)
  const [localOverrides, setLocalOverrides] = useState<Record<number, Partial<RepoPR>>>({})
  // Cached branch status per PR number
  const [branchStatus, setBranchStatus] = useState<Record<number, PRBranchStatus>>({})
  const branchStatusFetched = useRef<Set<string>>(new Set())

  // Asynchronously fetch branch status for each PR (cached per repo+number)
  useEffect(() => {
    for (const pr of prs) {
      const key = `${repo}#${pr.number}`
      if (branchStatusFetched.current.has(key)) continue
      branchStatusFetched.current.add(key)
      window.repoAssist.getPRBranchStatus(repo, pr.number).then(status => {
        setBranchStatus(prev => ({ ...prev, [pr.number]: status }))
      }).catch(() => {
        // Ignore failures — status stays unknown
      })
    }
  }, [repo, prs])

  // Apply local overrides to props, filtering out closed/merged PRs
  const effectivePRs = prs
    .map(pr => localOverrides[pr.number] ? { ...pr, ...localOverrides[pr.number] } : pr)
    .filter(pr => pr.state !== 'MERGED' && pr.state !== 'CLOSED')
  const sorted = [...effectivePRs].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  /** Render compact CI check icons — green ticks, red Xs, yellow clocks */
  const renderCIIcons = (pr: RepoPR) => {
    if (!pr.statusCheckRollup || pr.statusCheckRollup.length === 0) return null
    const passed = pr.statusCheckRollup.filter(s => s.conclusion === 'SUCCESS' || s.conclusion === 'NEUTRAL').length
    const failed = pr.statusCheckRollup.filter(s => s.conclusion === 'FAILURE' || s.conclusion === 'CANCELLED' || s.conclusion === 'TIMED_OUT' || s.conclusion === 'ERROR').length
    const pending = pr.statusCheckRollup.filter(s => s.status === 'IN_PROGRESS' || s.status === 'QUEUED' || s.status === 'PENDING' || (!s.conclusion && s.status !== 'COMPLETED')).length
    return (
      <span className="ci-check-icons">
        {failed > 0 && <span className="ci-icon-group" title={`${failed} failing`}><XCircleIcon size={14} className="gh-icon-danger" />{failed > 1 && <span className="ci-icon-count">{failed}</span>}</span>}
        {pending > 0 && <span className="ci-icon-group" title={`${pending} pending`}><ClockIcon size={14} className="gh-icon-attention" />{pending > 1 && <span className="ci-icon-count">{pending}</span>}</span>}
        {passed > 0 && <span className="ci-icon-group" title={`${passed} passing`}><CheckCircleIcon size={14} className="gh-icon-success" />{passed > 1 && <span className="ci-icon-count">{passed}</span>}</span>}
      </span>
    )
  }

  const handleMarkReady = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setMarkingReady(prNumber)
    try {
      await window.repoAssist.markPRReady(repo, prNumber)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { isDraft: false } }))
    } finally {
      setMarkingReady(null)
    }
  }

  const handleUpdateBranch = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setUpdatingBranch(prNumber)
    try {
      await window.repoAssist.updatePRBranch(repo, prNumber)
      setBranchStatus(prev => ({ ...prev, [prNumber]: { behindBy: 0, status: 'up_to_date' } }))
    } finally {
      setUpdatingBranch(null)
    }
  }

  const handleApprovePR = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setApprovingPR(prNumber)
    try {
      await window.repoAssist.approvePR(repo, prNumber)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { reviewDecision: 'APPROVED' } }))
    } finally {
      setApprovingPR(null)
    }
  }

  const handleMergePR = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setMergingPR(prNumber)
    try {
      await window.repoAssist.mergePR(repo, prNumber)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { state: 'MERGED' } }))
      onPRStateChange?.(prNumber)
    } finally {
      setMergingPR(null)
    }
  }

  const handleClosePR = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setClosingPR(prNumber)
    try {
      await window.repoAssist.exec(`pr close ${prNumber} -R ${repo}`)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { state: 'CLOSED', isDraft: false } }))
      onPRStateChange?.(prNumber)
    } finally {
      setClosingPR(null)
    }
  }

  const isRepoAssist = (pr: RepoPR) => pr.labels?.some(l => l.name === 'repo-assist')
  const isOpen = (pr: RepoPR) => pr.state !== 'MERGED' && pr.state !== 'CLOSED'

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
          leadingVisual={SyncIcon}
          onClick={onRefresh}
          size="small"
        >
          Refresh
        </Button>
      </div>

      <ActionList>
        {sorted.map(pr => {
          const isBot = isRepoAssist(pr)
          const open = isOpen(pr)
          const bs = branchStatus[pr.number]
          const behind = bs?.status === 'behind'
          const behindCount = bs?.behindBy ?? 0
          return (
            <ActionList.Item key={pr.number} onSelect={() => onSelectItem(pr.number)}>
              <ActionList.LeadingVisual>
                {pr.state === 'MERGED'
                  ? <GitMergeIcon size={16} className="gh-icon-merged" />
                  : pr.state === 'CLOSED'
                    ? <GitPullRequestClosedIcon size={16} className="gh-icon-closed" />
                    : pr.isDraft
                      ? <GitPullRequestDraftIcon size={16} className="gh-icon-draft" />
                      : <GitPullRequestIcon size={16} className="gh-icon-open" />
                }
              </ActionList.LeadingVisual>
              <div>
                <span className="pr-title-line">
                  <Text weight="semibold">
                    #{pr.number} {pr.title.replace('[Repo Assist] ', '')}
                  </Text>
                  {renderCIIcons(pr)}
                </span>
                <div className="pr-meta">
                  {isBot && (
                    <Label variant="accent">🤖 Repo Assist</Label>
                  )}
                  <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                    by {pr.author?.login ?? 'unknown'}
                  </Text>
                  <RelativeTime date={new Date(pr.updatedAt)} />
                  {/* Inline action buttons */}
                  <span className="pr-action-buttons">
                    {behind && open && (
                      <button
                        className="pr-action-btn pr-action-attention"
                        title={`${behindCount} commit${behindCount !== 1 ? 's' : ''} behind — update branch`}
                        onClick={(e) => handleUpdateBranch(e, pr.number)}
                        disabled={updatingBranch === pr.number}
                      >
                        {updatingBranch === pr.number
                          ? <Spinner size="small" />
                          : <><AlertIcon size={14} /> <span className="pr-action-label">{behindCount} behind — update</span></>
                        }
                      </button>
                    )}
                    {pr.isDraft && open && (
                      <button
                        className="pr-action-btn pr-action-default"
                        title="Mark as ready for review"
                        onClick={(e) => handleMarkReady(e, pr.number)}
                        disabled={markingReady === pr.number}
                      >
                        {markingReady === pr.number
                          ? <Spinner size="small" />
                          : <><GitPullRequestIcon size={14} /> <span className="pr-action-label">Ready</span></>
                        }
                      </button>
                    )}
                    {!pr.isDraft && open && pr.reviewDecision !== 'APPROVED' && (
                      <button
                        className="pr-action-btn pr-action-success"
                        title="Approve PR"
                        onClick={(e) => handleApprovePR(e, pr.number)}
                        disabled={approvingPR === pr.number}
                      >
                        {approvingPR === pr.number
                          ? <Spinner size="small" />
                          : <><CheckIcon size={14} /> <span className="pr-action-label">Approve</span></>
                        }
                      </button>
                    )}
                    {!pr.isDraft && open && (
                      <button
                        className="pr-action-btn pr-action-success"
                        title="Merge PR"
                        onClick={(e) => handleMergePR(e, pr.number)}
                        disabled={mergingPR === pr.number}
                      >
                        {mergingPR === pr.number
                          ? <Spinner size="small" />
                          : <><GitMergeIcon size={14} /> <span className="pr-action-label">Merge</span></>
                        }
                      </button>
                    )}
                    {open && (
                      <button
                        className="pr-action-btn pr-action-danger"
                        title="Close PR"
                        onClick={(e) => handleClosePR(e, pr.number)}
                        disabled={closingPR === pr.number}
                      >
                        {closingPR === pr.number
                          ? <Spinner size="small" />
                          : <NoEntryIcon size={14} />
                        }
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </ActionList.Item>
          )
        })}
      </ActionList>

      {effectivePRs.length === 0 && (
        <div className="empty-state">
          <Text>No open pull requests</Text>
        </div>
      )}
    </div>
  )
}
