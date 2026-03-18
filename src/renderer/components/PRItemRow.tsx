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

// --- Shared hook: manages branch status, permissions, overrides, and action handlers ---

export interface PRListActionsState {
  branchStatus: Record<number, PRBranchStatus>
  repoPermission: string | null
  localOverrides: Record<number, Partial<RepoPR>>
  markingReady: number | null
  updatingBranch: number | null
  approvingPR: number | null
  mergingPR: number | null
  closingPR: number | null
  handleMarkReady: (e: React.MouseEvent, prNumber: number) => void
  handleUpdateBranch: (e: React.MouseEvent, prNumber: number) => void
  handleApprovePR: (e: React.MouseEvent, prNumber: number) => void
  handleMergePR: (e: React.MouseEvent, prNumber: number, bypass?: boolean) => void
  handleClosePR: (e: React.MouseEvent, prNumber: number) => void
}

export function usePRListActions(
  repo: string,
  prs: RepoPR[],
  onPRStateChange?: (prNumber: number) => void,
): PRListActionsState {
  const [markingReady, setMarkingReady] = useState<number | null>(null)
  const [updatingBranch, setUpdatingBranch] = useState<number | null>(null)
  const [approvingPR, setApprovingPR] = useState<number | null>(null)
  const [mergingPR, setMergingPR] = useState<number | null>(null)
  const [closingPR, setClosingPR] = useState<number | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Record<number, Partial<RepoPR>>>({})
  const [branchStatus, setBranchStatus] = useState<Record<number, PRBranchStatus>>({})
  const branchStatusFetched = useRef<Set<string>>(new Set())
  const [repoPermission, setRepoPermission] = useState<string | null>(null)
  const permissionFetched = useRef(false)

  // Clear optimistic overrides and branch cache when fresh data arrives
  const prevPrsRef = useRef(prs)
  useEffect(() => {
    if (prs !== prevPrsRef.current) {
      prevPrsRef.current = prs
      setLocalOverrides({})
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
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { isDraft: false } }))
    } finally {
      setMarkingReady(null)
    }
  }, [repo])

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
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { reviewDecision: 'APPROVED' } }))
    } finally {
      setApprovingPR(null)
    }
  }, [repo])

  const handleMergePR = useCallback(async (e: React.MouseEvent, prNumber: number, bypass: boolean = false) => {
    e.stopPropagation()
    setMergingPR(prNumber)
    try {
      await window.repoAssist.mergePR(repo, prNumber, bypass)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { state: 'MERGED' } }))
      onPRStateChange?.(prNumber)
    } finally {
      setMergingPR(null)
    }
  }, [repo, onPRStateChange])

  const handleClosePR = useCallback(async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setClosingPR(prNumber)
    try {
      await window.repoAssist.exec(`pr close ${prNumber} -R ${repo}`)
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { state: 'CLOSED', isDraft: false } }))
      onPRStateChange?.(prNumber)
    } finally {
      setClosingPR(null)
    }
  }, [repo, onPRStateChange])

  return {
    branchStatus, repoPermission, localOverrides,
    markingReady, updatingBranch, approvingPR, mergingPR, closingPR,
    handleMarkReady, handleUpdateBranch, handleApprovePR, handleMergePR, handleClosePR,
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
  onSelect: () => void
}

export function PRItemRow({ pr, actions, onSelect }: PRItemRowProps) {
  const {
    branchStatus, repoPermission,
    markingReady, updatingBranch, approvingPR, mergingPR, closingPR,
    handleMarkReady, handleUpdateBranch, handleApprovePR, handleMergePR, handleClosePR,
  } = actions

  const isBot = pr.labels?.some(l => l.name === 'repo-assist')
  const open = pr.state !== 'MERGED' && pr.state !== 'CLOSED'
  const bs = branchStatus[pr.number]
  const behind = bs?.status === 'behind'
  const behindCount = bs?.behindBy ?? 0

  return (
    <ActionList.Item onSelect={onSelect}>
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
            {!pr.isDraft && open && (() => {
              const isConflicting = pr.mergeable === 'CONFLICTING'
              const isDirty = pr.mergeStateStatus === 'DIRTY'
              const isBlocked = pr.mergeStateStatus === 'BLOCKED'
              const canBypass = repoPermission === 'admin' || repoPermission === 'maintain'
              if (isConflicting || isDirty) {
                return (
                  <span className="pr-action-btn pr-action-muted" title="Has merge conflicts">
                    <AlertIcon size={14} /> <span className="pr-action-label">Conflicts</span>
                  </span>
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
    </ActionList.Item>
  )
}
