import { useState, useEffect, useRef, useCallback } from 'react'
import { Text, ActionList, Label, RelativeTime, Spinner } from '@primer/react'
import {
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  GitPullRequestClosedIcon,
  GitMergeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  NoEntryIcon,
} from '@primer/octicons-react'
import { RepoPR, PRBranchStatus } from '@shared/types'
import { isInteractiveNavigationTarget } from '../utils/github-navigation'

// --- Shared hook: manages branch status, permissions, overrides, and action handlers ---

export interface PRListActionsState {
  repo: string
  branchStatus: Record<number, PRBranchStatus>
  repoPermission: string | null
  viewerLogin: string | null
  markingReady: number | null
  updatingBranch: number | null
  approvingPR: number | null
  approvingWorkflowRuns: number | null
  mergingPR: number | null
  closingPR: number | null
  handleMarkReady: (e: React.MouseEvent, prNumber: number) => void
  handleUpdateBranch: (e: React.MouseEvent, prNumber: number) => void
  handleApprovePR: (e: React.MouseEvent, prNumber: number) => void
  handleApproveWorkflowRuns: (e: React.MouseEvent, prNumber: number, runIds: number[]) => void
  handleMergePR: (e: React.MouseEvent, prNumber: number, bypass?: boolean) => void
  handleClosePR: (e: React.MouseEvent, prNumber: number) => void
}

export function usePRListActions(
  repo: string,
  prs: RepoPR[],
  onPRUpdate?: (prNumber: number, updates: Partial<RepoPR>) => void,
): PRListActionsState {
  const [markingReady, setMarkingReady] = useState<number | null>(null)
  const [updatingBranch, setUpdatingBranch] = useState<number | null>(null)
  const [approvingPR, setApprovingPR] = useState<number | null>(null)
  const [approvingWorkflowRuns, setApprovingWorkflowRuns] = useState<number | null>(null)
  const [mergingPR, setMergingPR] = useState<number | null>(null)
  const [closingPR, setClosingPR] = useState<number | null>(null)
  const [branchStatus, setBranchStatus] = useState<Record<number, PRBranchStatus>>({})
  const branchStatusFetched = useRef<Set<string>>(new Set())
  const [repoPermission, setRepoPermission] = useState<string | null>(null)
  const permissionFetched = useRef(false)
  const [viewerLogin, setViewerLogin] = useState<string | null>(null)
  const viewerLoginFetched = useRef(false)

  // Clear the branch cache when fresh PR data arrives
  const prevPrsRef = useRef(prs)
  useEffect(() => {
    if (prs !== prevPrsRef.current) {
      prevPrsRef.current = prs
      branchStatusFetched.current = new Set()
      setBranchStatus({})
    }
  }, [prs])

  // Fetch repo permission once
  useEffect(() => {
    if (permissionFetched.current) return
    permissionFetched.current = true
    window.repoAssist.getRepoPermission(repo).then(perm => {
      setRepoPermission(perm)
    }).catch(() => {})
  }, [repo])

  // Fetch viewer login once
  useEffect(() => {
    if (viewerLoginFetched.current) return
    viewerLoginFetched.current = true
    window.repoAssist.getViewerLogin().then(login => {
      setViewerLogin(login)
    }).catch(() => {})
  }, [])

  // Asynchronously fetch branch status for each PR
  useEffect(() => {
    for (const pr of prs) {
      const key = `${repo}#${pr.number}`
      if (branchStatusFetched.current.has(key)) continue
      branchStatusFetched.current.add(key)
      window.repoAssist.getPRBranchStatus(repo, pr.number).then(status => {
        setBranchStatus(prev => ({ ...prev, [pr.number]: status }))
      }).catch(() => {})
    }
  }, [repo, prs])

  const handleMarkReady = useCallback(async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setMarkingReady(prNumber)
    try {
      await window.repoAssist.markPRReady(repo, prNumber)
      onPRUpdate?.(prNumber, { isDraft: false })
    } finally {
      setMarkingReady(null)
    }
  }, [repo, onPRUpdate])

  const handleUpdateBranch = useCallback(async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setUpdatingBranch(prNumber)
    try {
      await window.repoAssist.updatePRBranch(repo, prNumber)
      setBranchStatus(prev => ({ ...prev, [prNumber]: { behindBy: 0, status: 'up_to_date' } }))
    } catch {
      try {
        const status = await window.repoAssist.getPRBranchStatus(repo, prNumber)
        setBranchStatus(prev => ({ ...prev, [prNumber]: status }))
      } catch { /* ignore */ }
    } finally {
      setUpdatingBranch(null)
    }
  }, [repo])

  const handleApprovePR = useCallback(async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setApprovingPR(prNumber)
    try {
      await window.repoAssist.approvePR(repo, prNumber)
      onPRUpdate?.(prNumber, { reviewDecision: 'APPROVED' })
    } finally {
      setApprovingPR(null)
    }
  }, [repo, onPRUpdate])

  const handleApproveWorkflowRuns = useCallback(async (e: React.MouseEvent, prNumber: number, runIds: number[]) => {
    e.stopPropagation()
    setApprovingWorkflowRuns(prNumber)
    try {
      await window.repoAssist.approveWorkflowRuns(repo, runIds)
      onPRUpdate?.(prNumber, { workflowRunIdsAwaitingApproval: [] })
    } finally {
      setApprovingWorkflowRuns(null)
    }
  }, [repo, onPRUpdate])

  const handleMergePR = useCallback(async (e: React.MouseEvent, prNumber: number, bypass: boolean = false) => {
    e.stopPropagation()
    setMergingPR(prNumber)
    try {
      await window.repoAssist.mergePR(repo, prNumber, bypass)
      onPRUpdate?.(prNumber, { state: 'MERGED' })
    } finally {
      setMergingPR(null)
    }
  }, [repo, onPRUpdate])

  const handleClosePR = useCallback(async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setClosingPR(prNumber)
    try {
      await window.repoAssist.closePR(repo, prNumber)
      onPRUpdate?.(prNumber, { state: 'CLOSED', isDraft: false })
    } finally {
      setClosingPR(null)
    }
  }, [repo, onPRUpdate])

  return {
    repo, branchStatus, repoPermission, viewerLogin,
    markingReady, updatingBranch, approvingPR, approvingWorkflowRuns, mergingPR, closingPR,
    handleMarkReady, handleUpdateBranch, handleApprovePR, handleApproveWorkflowRuns, handleMergePR, handleClosePR,
  }
}

// --- Shared CI icons renderer ---

export function CICheckIcons({ pr }: { pr: RepoPR }) {
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

// --- Shared PR row component ---

interface PRItemRowProps {
  pr: RepoPR
  actions: PRListActionsState
  onSelect: (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => void
  className?: string
  style?: React.CSSProperties
  trailingVisual?: React.ReactNode
}

export function PRItemRow({ pr, actions, onSelect, className, style, trailingVisual }: PRItemRowProps) {
  const {
    repo, branchStatus, repoPermission, viewerLogin,
    markingReady, updatingBranch, approvingPR, approvingWorkflowRuns, mergingPR, closingPR,
    handleMarkReady, handleUpdateBranch, handleApprovePR, handleApproveWorkflowRuns, handleMergePR, handleClosePR,
  } = actions

  const isBot = pr.labels?.some(l => l.name === 'repo-assist')
  const open = pr.state !== 'MERGED' && pr.state !== 'CLOSED'
  const bs = branchStatus[pr.number]
  const behind = bs?.status === 'behind'
  const behindCount = bs?.behindBy ?? 0
  const viewerHasApproved = viewerLogin
    ? pr.latestReviews?.some(r => r.author?.login === viewerLogin && r.state === 'APPROVED') ?? false
    : false
  const handleSelect = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
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
          <CICheckIcons pr={pr} />
        </span>
        <div className="pr-meta">
          {isBot && (
            <Label variant="accent">🤖 Repo Assist</Label>
          )}
          {!pr.isDraft && open && (
            <Label variant="success">Ready</Label>
          )}
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
            by {pr.author?.login ?? 'unknown'}
          </Text>
          <RelativeTime date={new Date(pr.updatedAt)} />
          {/* Inline action buttons */}
          <span className="pr-action-buttons">
            {open && pr.workflowRunIdsAwaitingApproval.length > 0 && (
              <button
                className="pr-action-btn pr-action-attention"
                title={`Approve ${pr.workflowRunIdsAwaitingApproval.length} workflow run${pr.workflowRunIdsAwaitingApproval.length === 1 ? '' : 's'} to start`}
                onClick={(e) => handleApproveWorkflowRuns(e, pr.number, pr.workflowRunIdsAwaitingApproval)}
                disabled={approvingWorkflowRuns === pr.number}
              >
                {approvingWorkflowRuns === pr.number
                  ? <Spinner size="small" />
                  : <><CheckCircleIcon size={14} /> <span className="pr-action-label">Approve workflows</span></>
                }
              </button>
            )}
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
            {!pr.isDraft && open && !viewerHasApproved && pr.reviewDecision !== 'APPROVED' && pr.author?.login !== viewerLogin && (
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
            {!pr.isDraft && open && (() => {
              const isConflicting = pr.mergeable === 'CONFLICTING'
              const isDirty = pr.mergeStateStatus === 'DIRTY'
              const isBlocked = pr.mergeStateStatus === 'BLOCKED'
              const canBypass = repoPermission === 'admin' || repoPermission === 'maintain'
              if (isConflicting || isDirty) {
                return (
                  <button
                    className="pr-action-btn pr-action-muted"
                    title="Has merge conflicts — click to resolve on GitHub"
                    onClick={(e) => { e.stopPropagation(); window.repoAssist.openExternal(`https://github.com/${repo}/pull/${pr.number}/conflicts`) }}
                  >
                    <AlertIcon size={14} /> <span className="pr-action-label">Conflicts</span>
                  </button>
                )
              }
              if (isBlocked && !canBypass) {
                return (
                  <span className="pr-action-btn pr-action-muted" title="Merging is blocked">
                    <AlertIcon size={14} /> <span className="pr-action-label">Blocked</span>
                  </span>
                )
              }
              return (
                <button
                  className={isBlocked ? 'pr-action-btn pr-action-danger' : 'pr-action-btn pr-action-success'}
                  title={isBlocked ? 'Merge (bypass rules)' : 'Merge PR'}
                  onClick={(e) => handleMergePR(e, pr.number, isBlocked)}
                  disabled={mergingPR === pr.number}
                >
                  {mergingPR === pr.number
                    ? <Spinner size="small" />
                    : <><GitMergeIcon size={14} /> <span className="pr-action-label">{isBlocked ? 'Merge (bypass)' : 'Merge'}</span></>
                  }
                </button>
              )
            })()}
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
      {trailingVisual && (
        <ActionList.TrailingVisual>{trailingVisual}</ActionList.TrailingVisual>
      )}
    </ActionList.Item>
  )
}
