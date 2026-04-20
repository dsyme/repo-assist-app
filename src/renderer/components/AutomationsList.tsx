import { useState, useEffect, useMemo, useCallback } from 'react'
import { Text, ActionList, Label, Button, Spinner, RelativeTime, CounterLabel } from '@primer/react'
import {
  WorkflowIcon,
  LinkExternalIcon,
  FileCodeIcon,
  CopilotIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlayIcon,
  CommentIcon,
  IssueOpenedIcon,
  ZapIcon,
  MarkGithubIcon,
  SyncIcon,
  StopIcon,
} from '@primer/octicons-react'
import { marked } from 'marked'
import { RepoWorkflow, RepoRun } from '@shared/types'
import { sanitizeHtml } from '../utils/sanitize'

marked.setOptions({ gfm: true, breaks: true })

interface AutomationsListProps {
  repo: string
  writeMode: boolean
}

/** Enriched workflow with agentic detection and resolved spec path */
interface EnrichedWorkflow extends RepoWorkflow {
  agentic: boolean
  specPath: string | null
  kind: 'cicd' | 'ghaw' | 'copilot' | 'github'
}

function workflowKind(w: RepoWorkflow, agentic: boolean): EnrichedWorkflow['kind'] {
  // GitHub built-in automations — check by name first, before agentic
  if (w.name === 'Dependabot Updates' || w.name === 'pages-build-deployment') return 'github'
  if (w.path.startsWith('dynamic/') && w.name.toLowerCase().includes('copilot')) return 'copilot'
  if (agentic) return 'ghaw'
  if (w.path.startsWith('dynamic/')) return 'github'
  return 'cicd'
}

function WorkflowKindIcon({ kind, size = 16 }: { kind: EnrichedWorkflow['kind']; size?: number }) {
  switch (kind) {
    case 'ghaw': return <WorkflowIcon size={size} className="gh-icon-accent" />
    case 'copilot': return <CopilotIcon size={size} className="gh-icon-accent" />
    case 'github': return <MarkGithubIcon size={size} className="gh-icon-muted" />
    default: return <WorkflowIcon size={size} className="gh-icon-muted" />
  }
}

function kindLabel(kind: EnrichedWorkflow['kind']): string {
  switch (kind) {
    case 'ghaw': return 'Agentic'
    case 'copilot': return 'Copilot'
    case 'github': return 'GitHub'
    default: return 'CI/CD'
  }
}

/** Ordering for kind groups */
const KIND_ORDER: EnrichedWorkflow['kind'][] = ['ghaw', 'cicd', 'copilot', 'github']

/** Compute a succinct time span like "19h", "3d", "2w" from the oldest run to now */
function runsTimeSpan(runList: RepoRun[]): string {
  if (runList.length === 0) return ''
  // Runs are newest-first; oldest is last
  const oldest = new Date(runList[runList.length - 1].createdAt)
  const diffMs = Date.now() - oldest.getTime()
  const hours = Math.round(diffMs / (1000 * 60 * 60))
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d`
  const weeks = Math.round(days / 7)
  return `${weeks}w`
}

/** Describe what triggered a run in a human-friendly way */
function runTriggerDescription(run: RepoRun, isAgentic: boolean, slashCommand?: string): { icon: React.ReactNode; label: string } {
  const event = run.event
  const cmd = slashCommand ? `/${slashCommand}` : '/command'
  // Agentic workflows triggered by issue/PR events are almost certainly slash-command invocations
  if (isAgentic) {
    if (event === 'issue_comment' || event === 'issues') {
      return { icon: <ZapIcon size={14} />, label: `Triggered by ${cmd} on issue` }
    }
    if (event === 'pull_request_review_comment' || event === 'pull_request' || event === 'pull_request_target') {
      return { icon: <ZapIcon size={14} />, label: `Triggered by ${cmd} on PR` }
    }
  }
  if (event === 'schedule') {
    return { icon: <ClockIcon size={14} />, label: 'Scheduled run' }
  }
  if (event === 'workflow_dispatch') {
    return { icon: <PlayIcon size={14} />, label: 'Triggered manually' }
  }
  if (event === 'push') {
    return { icon: <ZapIcon size={14} />, label: `Push to ${run.headBranch || 'branch'}` }
  }
  if (event === 'pull_request' || event === 'pull_request_target') {
    return { icon: <IssueOpenedIcon size={14} />, label: 'Pull request event' }
  }
  if (event === 'issue_comment') {
    return { icon: <CommentIcon size={14} />, label: 'Issue comment' }
  }
  if (event === 'issues') {
    return { icon: <IssueOpenedIcon size={14} />, label: 'Issue event' }
  }
  return { icon: <PlayIcon size={14} />, label: event }
}

function RunStatusIcon({ status, conclusion }: { status: string; conclusion: string }) {
  if (status === 'completed' && conclusion === 'success') return <CheckCircleIcon size={14} fill="var(--fgColor-success)" />
  if (status === 'completed' && conclusion === 'failure') return <XCircleIcon size={14} fill="var(--fgColor-danger)" />
  if (status === 'in_progress') return <PlayIcon size={14} fill="var(--fgColor-attention)" />
  return <ClockIcon size={14} />
}

export function AutomationsList({ repo, writeMode }: AutomationsListProps) {
  const [workflows, setWorkflows] = useState<EnrichedWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState<RepoRun[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [selectedWorkflow, setSelectedWorkflow] = useState<EnrichedWorkflow | null>(null)
  const [sourceContent, setSourceContent] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [togglingWorkflow, setTogglingWorkflow] = useState<number | null>(null)

  // Load workflows
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const wf = await window.repoAssist.getWorkflows(repo)
        const enriched: EnrichedWorkflow[] = await Promise.all(
          wf.map(async (w): Promise<EnrichedWorkflow> => {
            if (w.path.startsWith('dynamic/')) {
              const kind = workflowKind(w, true)
              const isGithubBuiltin = kind === 'github'
              return { ...w, agentic: !isGithubBuiltin, specPath: null, kind }
            }
            if (w.path.endsWith('.lock.yml')) {
              const mdPath = w.path.replace('.lock.yml', '.md')
              return { ...w, agentic: true, specPath: mdPath, kind: 'ghaw' }
            }
            if (w.path.endsWith('.yml') || w.path.endsWith('.yaml')) {
              const lockPath = w.path.replace(/\.(yml|yaml)$/, '.lock.yml')
              const lockExists = await window.repoAssist.getFileContent(repo, lockPath)
              if (lockExists !== null) {
                const mdPath = w.path.replace(/\.(yml|yaml)$/, '.md')
                return { ...w, agentic: true, specPath: mdPath, kind: 'ghaw' }
              }
            }
            const kind = workflowKind(w, false)
            return { ...w, agentic: false, specPath: null, kind }
          })
        )
        setWorkflows(enriched)
      } catch {
        setWorkflows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [repo, refreshKey])

  // Lazy-load runs after workflows
  useEffect(() => {
    if (loading) return
    setRunsLoading(true)
    window.repoAssist.getRuns(repo).then(r => {
      setRuns(r as RepoRun[])
      setRunsLoading(false)
    }).catch(() => {
      setRuns([])
      setRunsLoading(false)
    })
  }, [repo, loading])

  // Map workflow name → runs (exclude skipped/cancelled as defense in depth)
  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, RepoRun[]>()
    for (const run of runs) {
      if (run.conclusion === 'skipped' || run.conclusion === 'cancelled') continue
      const list = map.get(run.workflowName) || []
      list.push(run)
      map.set(run.workflowName, list)
    }
    return map
  }, [runs])

  const handleSelectWorkflow = useCallback(async (wf: EnrichedWorkflow) => {
    setSelectedWorkflow(wf)
    setSourceContent(null)
    setSourceLoading(true)
    try {
      if (wf.specPath) {
        const mdContent = await window.repoAssist.getFileContent(repo, wf.specPath)
        if (mdContent) {
          setSourceContent(mdContent)
          setSourceLoading(false)
          return
        }
      }
      if (!wf.path.startsWith('dynamic/')) {
        const content = await window.repoAssist.getFileContent(repo, wf.path)
        setSourceContent(content)
      }
    } catch {
      setSourceContent(null)
    } finally {
      setSourceLoading(false)
    }
  }, [repo])

  const handleToggleWorkflow = useCallback(async (e: React.MouseEvent, wf: EnrichedWorkflow) => {
    e.stopPropagation()
    setTogglingWorkflow(wf.id)
    try {
      const isActive = wf.state === 'active'
      if (isActive) {
        await window.repoAssist.disableWorkflow(repo, wf.id)
      } else {
        await window.repoAssist.enableWorkflow(repo, wf.id)
      }
      if (writeMode) {
        setWorkflows(prev => prev.map(w =>
          w.id === wf.id ? { ...w, state: isActive ? 'disabled_manually' : 'active' } : w
        ))
      }
    } catch (err) {
      await window.repoAssist.showMessageBox({
        type: 'error',
        message: `Failed to ${wf.state === 'active' ? 'disable' : 'enable'} workflow`,
        detail: String(err),
        buttons: ['OK'],
      }).catch(() => {})
    } finally {
      setTogglingWorkflow(null)
    }
  }, [repo, writeMode])

  const handlePlayRun = useCallback(async (e: React.MouseEvent, wf: EnrichedWorkflow, repeat?: number) => {
    e.stopPropagation()
    const ensureResult = await window.repoAssist.ensureAwExtension()
    if (!ensureResult.success) {
      await window.repoAssist.showMessageBox({
        type: 'warning',
        message: 'Failed to install gh-aw extension',
        detail: ensureResult.error || 'Install manually: gh extension install github/gh-aw',
        buttons: ['OK'],
      })
      return
    }
    if (wf.specPath) {
      await window.repoAssist.awRun(repo, wf.specPath, repeat)
    }
  }, [repo])

  const openInGitHub = (wf: EnrichedWorkflow) => {
    const path = wf.specPath || wf.path
    window.repoAssist.openExternal(`https://github.com/${repo}/blob/main/${path}`)
  }

  const openEditInGitHub = (wf: EnrichedWorkflow) => {
    const path = wf.specPath || wf.path
    window.repoAssist.openExternal(`https://github.com/${repo}/edit/main/${path}`)
  }

  const openRunInGitHub = (run: RepoRun) => {
    window.repoAssist.openExternal(`https://github.com/${repo}/actions/runs/${run.databaseId}`)
  }

  // Detail view for a selected workflow
  if (selectedWorkflow) {
    const wfRuns = runsByWorkflow.get(selectedWorkflow.name) || []
    return (
      <AutomationDetail
        workflow={selectedWorkflow}
        repo={repo}
        runs={wfRuns}
        runsLoading={runsLoading}
        sourceContent={sourceContent}
        sourceLoading={sourceLoading}
        writeMode={writeMode}
        onBack={() => setSelectedWorkflow(null)}
        onViewInGitHub={() => openInGitHub(selectedWorkflow)}
        onEditInGitHub={() => openEditInGitHub(selectedWorkflow)}
        onOpenRun={openRunInGitHub}
      />
    )
  }

  // List view
  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Automations — {repo.split('/').pop()}</h2>
          <span className="subtitle">
            {workflows.length} workflows{loading ? ' (loading…)' : ''}
            {!loading && runsLoading && ' · loading runs…'}
            {!loading && !runsLoading && runs.length > 0 && ` · ${runs.length} runs in last ${runsTimeSpan(runs)}`}
          </span>
        </div>
        <Button
          leadingVisual={loading ? Spinner : SyncIcon}
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          size="small"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {loading && (
        <div className="loading-center" style={{ height: 120 }}>
          <Spinner size="medium" />
        </div>
      )}

      {!loading && (() => {
        // Group workflows by kind, sort alphabetically within each group
        const groups = new Map<EnrichedWorkflow['kind'], EnrichedWorkflow[]>()
        for (const wf of workflows) {
          const list = groups.get(wf.kind) || []
          list.push(wf)
          groups.set(wf.kind, list)
        }
        for (const [, group] of groups) {
          group.sort((a, b) => a.name.localeCompare(b.name))
        }
        const orderedKinds = KIND_ORDER.filter(k => groups.has(k))

        return (
          <ActionList>
            {orderedKinds.map((kind, kindIdx) => {
              const group = groups.get(kind)!
              return (
                <div key={kind}>
                  {kindIdx > 0 && <hr className="automation-divider" />}
                  {group.map(wf => {
                    const wfRuns = runsByWorkflow.get(wf.name) || []
                    const runCount = wfRuns.length
                    const showPlay = wf.kind === 'ghaw' && wf.specPath
                    const canToggle = !wf.path.startsWith('dynamic/') &&
                      (wf.state === 'active' || wf.state === 'disabled_manually' || wf.state === 'disabled_inactivity')
                    const isActive = wf.state === 'active'
                    const showButtons = showPlay || canToggle
                    return (
                      <div key={wf.id} className={showButtons ? 'aw-item-wrapper' : undefined}>
                        <ActionList.Item onSelect={() => handleSelectWorkflow(wf)}>
                          <ActionList.LeadingVisual>
                            <WorkflowKindIcon kind={wf.kind} />
                          </ActionList.LeadingVisual>
                          <div>
                            <Text weight="semibold">{wf.name}</Text>
                            <div className="run-meta">
                              <Label variant={wf.kind === 'ghaw' ? 'accent' : 'secondary'}>
                                {kindLabel(wf.kind)}
                              </Label>
                              <Label variant={wf.state === 'active' ? 'success' : 'secondary'}>
                                {wf.state}
                              </Label>
                              {runCount > 0 && (
                                <CounterLabel>{runCount} in {runsTimeSpan(wfRuns)}</CounterLabel>
                              )}
                              {runsLoading && <Spinner size="small" />}
                            </div>
                          </div>
                        </ActionList.Item>
                        {showButtons && (
                          <div className="aw-play-buttons">
                            {showPlay && (
                              <>
                                <Button size="small" variant="invisible" onClick={(e) => handlePlayRun(e, wf)}>
                                  <PlayIcon size={14} /> Play
                                </Button>
                                <Button size="small" variant="invisible" onClick={(e) => handlePlayRun(e, wf, 10)}>
                                  <PlayIcon size={14} /> Play (10)
                                </Button>
                              </>
                            )}
                            {canToggle && (
                              <Button
                                size="small"
                                variant="invisible"
                                onClick={(e) => handleToggleWorkflow(e, wf)}
                                disabled={togglingWorkflow === wf.id}
                              >
                                {togglingWorkflow === wf.id
                                  ? <Spinner size="small" />
                                  : isActive
                                    ? <><StopIcon size={14} /> {writeMode ? 'Disable' : 'Disable (dry-run)'}</>
                                    : <><PlayIcon size={14} /> {writeMode ? 'Enable' : 'Enable (dry-run)'}</>
                                }
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </ActionList>
        )
      })()}

      {!loading && workflows.length === 0 && (
        <div className="empty-state">
          <WorkflowIcon size={48} />
          <Text>No workflows found</Text>
        </div>
      )}
    </div>
  )
}

/** Separate component for workflow detail — avoids conditional hook calls */
function AutomationDetail({
  workflow,
  repo,
  runs,
  runsLoading,
  sourceContent,
  sourceLoading,
  writeMode,
  onBack,
  onViewInGitHub,
  onEditInGitHub,
  onOpenRun,
}: {
  workflow: EnrichedWorkflow
  repo: string
  runs: RepoRun[]
  runsLoading: boolean
  sourceContent: string | null
  sourceLoading: boolean
  writeMode: boolean
  onBack: () => void
  onViewInGitHub: () => void
  onEditInGitHub: () => void
  onOpenRun: (run: RepoRun) => void
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onBack])

  const [busyRunAction, setBusyRunAction] = useState<number | null>(null)
  const [runActionError, setRunActionError] = useState<string | null>(null)

  const handleCancelRun = useCallback(async (e: React.MouseEvent, run: RepoRun) => {
    e.stopPropagation()
    setBusyRunAction(run.databaseId)
    setRunActionError(null)
    try {
      await window.repoAssist.cancelRun(repo, run.databaseId)
    } catch (err) {
      setRunActionError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setBusyRunAction(null)
    }
  }, [repo])

  const handleRerunFailed = useCallback(async (e: React.MouseEvent, run: RepoRun) => {
    e.stopPropagation()
    setBusyRunAction(run.databaseId)
    setRunActionError(null)
    try {
      await window.repoAssist.rerunFailedJobs(repo, run.databaseId)
    } catch (err) {
      setRunActionError(err instanceof Error ? err.message : 'Rerun failed')
    } finally {
      setBusyRunAction(null)
    }
  }, [repo])

  const isMdContent = workflow.specPath != null

  const { frontmatter, markdownBody, slashCommand } = useMemo(() => {
    if (!isMdContent || !sourceContent) return { frontmatter: '', markdownBody: '', slashCommand: undefined as string | undefined }
    const fmMatch = sourceContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    const fm = fmMatch ? fmMatch[1] : ''
    const body = fmMatch ? fmMatch[2] : sourceContent
    // Extract slash_command name from frontmatter (e.g. "slash_command:\n    name: repo-assist")
    const cmdMatch = fm.match(/slash_command:\s*\n\s+name:\s*(.+)/)
    const cmd = cmdMatch ? cmdMatch[1].trim() : undefined
    return { frontmatter: fm, markdownBody: body, slashCommand: cmd }
  }, [isMdContent, sourceContent])

  const renderedBody = useMemo(() => {
    if (!markdownBody) return ''
    try {
      const raw = marked.parse(markdownBody)
      return typeof raw === 'string' ? sanitizeHtml(raw) : ''
    } catch { return '' }
  }, [markdownBody])

  const displayPath = workflow.specPath || workflow.path
  const recentRuns = runs.filter(r => r.conclusion !== 'skipped' && r.conclusion !== 'cancelled').slice(0, 5)

  return (
    <div className="detail-panel fade-in">
      <div className="detail-header">
        <div className="detail-title-row">
          <Button size="small" variant="invisible" onClick={onBack}>
            <ChevronLeftIcon size={16} />
          </Button>
          <WorkflowKindIcon kind={workflow.kind} size={20} />
          <div>
            <h3 className="detail-title">{workflow.name}</h3>
            <div className="detail-meta">
              <Label variant={workflow.agentic ? 'accent' : 'secondary'}>
                {kindLabel(workflow.kind)}
              </Label>
              <Label variant={workflow.state === 'active' ? 'success' : 'secondary'}>
                {workflow.state}
              </Label>
              <Text size="small" style={{ color: 'var(--fgColor-muted)', fontFamily: 'var(--fontFamily-mono)' }}>
                {displayPath}
              </Text>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" leadingVisual={FileCodeIcon} onClick={onViewInGitHub}>
            View
          </Button>
          <Button size="small" leadingVisual={LinkExternalIcon} onClick={onEditInGitHub}>
            Edit
          </Button>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="automation-runs-section">
        <h4 className="detail-section-title">
          <PlayIcon size={16} /> Recent Runs
          {runsLoading && <Spinner size="small" />}
          {!runsLoading && <CounterLabel>{runs.length}</CounterLabel>}
        </h4>
        {runActionError && (
          <Text size="small" style={{ color: 'var(--fgColor-danger)', padding: '4px 0' }}>{runActionError}</Text>
        )}
        {recentRuns.length > 0 && (
          <div className="automation-runs-list">
            {recentRuns.map(run => {
              const trigger = runTriggerDescription(run, workflow.agentic, slashCommand)
              const isBusy = busyRunAction === run.databaseId
              const isInProgress = run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting'
              const isFailed = run.status === 'completed' && run.conclusion === 'failure'
              return (
                <button
                  key={run.databaseId}
                  className="automation-run-row"
                  onClick={() => onOpenRun(run)}
                >
                  <RunStatusIcon status={run.status} conclusion={run.conclusion} />
                  <span className="automation-run-trigger">
                    {trigger.icon}
                    <span>{trigger.label}</span>
                  </span>
                  <Label size="small" variant={
                    run.conclusion === 'success' ? 'success'
                    : run.conclusion === 'failure' ? 'danger'
                    : 'secondary'
                  }>
                    {run.conclusion || run.status}
                  </Label>
                  <RelativeTime date={new Date(run.createdAt)} />
                  {isInProgress && (
                    <Button
                      size="small"
                      variant="invisible"
                      disabled={isBusy}
                      onClick={(e) => handleCancelRun(e, run)}
                      aria-label="Cancel run"
                    >
                      {isBusy ? <Spinner size="small" /> : <StopIcon size={14} />}
                      {writeMode ? 'Cancel' : 'Cancel (dry-run)'}
                    </Button>
                  )}
                  {isFailed && (
                    <Button
                      size="small"
                      variant="invisible"
                      disabled={isBusy}
                      onClick={(e) => handleRerunFailed(e, run)}
                      aria-label="Re-run failed jobs"
                    >
                      {isBusy ? <Spinner size="small" /> : <SyncIcon size={14} />}
                      {writeMode ? 'Rerun failed' : 'Rerun failed (dry-run)'}
                    </Button>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {!runsLoading && recentRuns.length === 0 && (
          <Text size="small" style={{ color: 'var(--fgColor-muted)', padding: '8px 0' }}>No recent runs</Text>
        )}
      </div>

      {/* Source / Spec */}
      {sourceLoading && (
        <div className="loading-center" style={{ height: 120 }}>
          <Spinner size="medium" />
        </div>
      )}

      {!sourceLoading && sourceContent === null && (
        <Text size="small" style={{ padding: 16, color: 'var(--fgColor-muted)' }}>
          {workflow.path.startsWith('dynamic/')
            ? 'This is a GitHub-hosted agentic service — no local workflow file.'
            : 'Could not load workflow source.'}
        </Text>
      )}

      {!sourceLoading && sourceContent !== null && isMdContent && (
        <div className="detail-body">
          {frontmatter && (
            <div className="automation-detail-source">
              <pre><code>{frontmatter}</code></pre>
            </div>
          )}
          {renderedBody && (
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderedBody }} />
          )}
        </div>
      )}

      {!sourceLoading && sourceContent !== null && !isMdContent && (
        <div className="detail-body">
          <div className="automation-detail-source">
            <pre><code>{sourceContent}</code></pre>
          </div>
        </div>
      )}
    </div>
  )
}
