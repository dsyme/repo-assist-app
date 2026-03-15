import React, { useState, useEffect } from 'react'
import { Text, ActionList, Label, Button } from '@primer/react'
import { WorkflowIcon, LinkExternalIcon, FileCodeIcon, CopilotIcon } from '@primer/octicons-react'
import { RepoWorkflow } from '@shared/types'

interface AutomationsListProps {
  repo: string
}

export function AutomationsList({ repo }: AutomationsListProps) {
  const [workflows, setWorkflows] = useState<RepoWorkflow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const wf = await window.repoAssist.getWorkflows(repo)
        setWorkflows(wf)
      } catch {
        setWorkflows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [repo])

  const isAgenticWorkflow = (wf: RepoWorkflow) =>
    wf.path.endsWith('.md') || wf.path.includes('copilot') || wf.path.includes('agent')

  const openWorkflowInGitHub = (wf: RepoWorkflow) => {
    window.repoAssist.openExternal(
      `https://github.com/${repo}/edit/main/${wf.path}`
    )
  }

  const openWorkflowViewInGitHub = (wf: RepoWorkflow) => {
    window.repoAssist.openExternal(
      `https://github.com/${repo}/blob/main/${wf.path}`
    )
  }

  return (
    <div>
      <div className="panel-header">
        <h2>Automations — {repo.split('/').pop()}</h2>
        <span className="subtitle">
          {workflows.length} workflows{loading ? ' (loading…)' : ''}
        </span>
      </div>

      {loading && (
        <div className="loading-center" style={{ height: 120 }}>
          <div className="loading-spinner" />
        </div>
      )}

      {!loading && (
        <ActionList>
          {workflows.map(wf => {
            const agentic = isAgenticWorkflow(wf)
            return (
              <ActionList.Item key={wf.id}>
                <ActionList.LeadingVisual>
                  {agentic
                    ? <CopilotIcon size={16} className="gh-icon-accent" />
                    : <WorkflowIcon size={16} className="gh-icon-muted" />
                  }
                </ActionList.LeadingVisual>
                <div>
                  <Text weight="semibold">{wf.name}</Text>
                  <div className="run-meta">
                    <Label variant={agentic ? 'accent' : 'secondary'}>
                      {agentic ? 'Agentic' : 'CI/CD'}
                    </Label>
                    <Label variant={wf.state === 'active' ? 'success' : 'secondary'}>
                      {wf.state}
                    </Label>
                    <Text size="small" style={{ color: 'var(--fgColor-muted)', fontFamily: 'var(--fontFamily-mono)' }}>
                      {wf.path}
                    </Text>
                  </div>
                </div>
                <ActionList.TrailingVisual>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <Button
                      size="small"
                      variant="invisible"
                      onClick={(e) => { e.stopPropagation(); openWorkflowViewInGitHub(wf) }}
                      aria-label="View on GitHub"
                    >
                      <FileCodeIcon size={14} />
                    </Button>
                    <Button
                      size="small"
                      variant="invisible"
                      onClick={(e) => { e.stopPropagation(); openWorkflowInGitHub(wf) }}
                      aria-label="Edit on GitHub"
                    >
                      <LinkExternalIcon size={14} />
                    </Button>
                  </span>
                </ActionList.TrailingVisual>
              </ActionList.Item>
            )
          })}
        </ActionList>
      )}

      {!loading && workflows.length === 0 && (
        <div className="empty-state">
          <WorkflowIcon size={48} />
          <Text>No workflows found</Text>
        </div>
      )}
    </div>
  )
}
