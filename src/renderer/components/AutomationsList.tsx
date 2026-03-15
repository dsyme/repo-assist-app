import React, { useState, useEffect, useMemo } from 'react'
import { Text, ActionList, Label, Button, Spinner } from '@primer/react'
import {
  WorkflowIcon,
  LinkExternalIcon,
  FileCodeIcon,
  CopilotIcon,
  ChevronLeftIcon,
} from '@primer/octicons-react'
import { marked } from 'marked'
import { RepoWorkflow } from '@shared/types'

marked.setOptions({ gfm: true, breaks: true })

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript:/gi, '')
}

interface AutomationsListProps {
  repo: string
}

/** Enriched workflow with agentic detection and resolved spec path */
interface EnrichedWorkflow extends RepoWorkflow {
  agentic: boolean
  /** For agentic workflows backed by .lock.yml, this is the .md spec path */
  specPath: string | null
}

export function AutomationsList({ repo }: AutomationsListProps) {
  const [workflows, setWorkflows] = useState<EnrichedWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWorkflow, setSelectedWorkflow] = useState<EnrichedWorkflow | null>(null)
  const [sourceContent, setSourceContent] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const wf = await window.repoAssist.getWorkflows(repo)

        // Enrich each workflow with agentic detection
        const enriched: EnrichedWorkflow[] = await Promise.all(
          wf.map(async (w): Promise<EnrichedWorkflow> => {
            // Dynamic workflows (GitHub-hosted agentic services like Copilot)
            if (w.path.startsWith('dynamic/')) {
              return { ...w, agentic: true, specPath: null }
            }

            // .lock.yml = compiled form of an agentic .md workflow spec
            // The primary file is the .md — check if it exists
            if (w.path.endsWith('.lock.yml')) {
              const mdPath = w.path.replace('.lock.yml', '.md')
              return { ...w, agentic: true, specPath: mdPath }
            }

            // For regular .yml/.yaml, check if a .lock.yml sibling exists
            // (meaning this .yml is actually also part of an agentic pair)
            if (w.path.endsWith('.yml') || w.path.endsWith('.yaml')) {
              const lockPath = w.path.replace(/\.(yml|yaml)$/, '.lock.yml')
              const lockExists = await window.repoAssist.getFileContent(repo, lockPath)
              if (lockExists !== null) {
                const mdPath = w.path.replace(/\.(yml|yaml)$/, '.md')
                return { ...w, agentic: true, specPath: mdPath }
              }
            }

            return { ...w, agentic: false, specPath: null }
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
  }, [repo])

  const handleSelectWorkflow = async (wf: EnrichedWorkflow) => {
    setSelectedWorkflow(wf)
    setSourceContent(null)
    setSourceLoading(true)
    try {
      // For agentic workflows, load the .md spec (the primary file)
      if (wf.specPath) {
        const mdContent = await window.repoAssist.getFileContent(repo, wf.specPath)
        if (mdContent) {
          setSourceContent(mdContent)
          setSourceLoading(false)
          return
        }
      }
      // Fallback: load whatever path the API reported
      if (!wf.path.startsWith('dynamic/')) {
        const content = await window.repoAssist.getFileContent(repo, wf.path)
        setSourceContent(content)
      }
    } catch {
      setSourceContent(null)
    } finally {
      setSourceLoading(false)
    }
  }

  const openInGitHub = (wf: EnrichedWorkflow) => {
    // Link to the .md spec for agentic workflows, otherwise the workflow file
    const path = wf.specPath || wf.path
    window.repoAssist.openExternal(`https://github.com/${repo}/blob/main/${path}`)
  }

  const openEditInGitHub = (wf: EnrichedWorkflow) => {
    const path = wf.specPath || wf.path
    window.repoAssist.openExternal(`https://github.com/${repo}/edit/main/${path}`)
  }

  // Detail view for a selected workflow
  if (selectedWorkflow) {
    return (
      <AutomationDetail
        workflow={selectedWorkflow}
        repo={repo}
        sourceContent={sourceContent}
        sourceLoading={sourceLoading}
        onBack={() => setSelectedWorkflow(null)}
        onViewInGitHub={() => openInGitHub(selectedWorkflow)}
        onEditInGitHub={() => openEditInGitHub(selectedWorkflow)}
      />
    )
  }

  // List view
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
          {workflows.map(wf => (
            <ActionList.Item key={wf.id} onSelect={() => handleSelectWorkflow(wf)}>
              <ActionList.LeadingVisual>
                {wf.agentic
                  ? <CopilotIcon size={16} className="gh-icon-accent" />
                  : <WorkflowIcon size={16} className="gh-icon-muted" />
                }
              </ActionList.LeadingVisual>
              <div>
                <Text weight="semibold">{wf.name}</Text>
                <div className="run-meta">
                  <Label variant={wf.agentic ? 'accent' : 'secondary'}>
                    {wf.agentic ? 'Agentic' : 'CI/CD'}
                  </Label>
                  <Label variant={wf.state === 'active' ? 'success' : 'secondary'}>
                    {wf.state}
                  </Label>
                  <Text size="small" style={{ color: 'var(--fgColor-muted)', fontFamily: 'var(--fontFamily-mono)' }}>
                    {wf.specPath || wf.path}
                  </Text>
                </div>
              </div>
            </ActionList.Item>
          ))}
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

/** Separate component for workflow detail — avoids conditional hook calls */
function AutomationDetail({
  workflow,
  repo,
  sourceContent,
  sourceLoading,
  onBack,
  onViewInGitHub,
  onEditInGitHub,
}: {
  workflow: EnrichedWorkflow
  repo: string
  sourceContent: string | null
  sourceLoading: boolean
  onBack: () => void
  onViewInGitHub: () => void
  onEditInGitHub: () => void
}) {
  // Content is markdown if we loaded the .md spec file
  const isMdContent = workflow.specPath != null

  // Parse frontmatter and body for markdown content
  const { frontmatter, markdownBody } = useMemo(() => {
    if (!isMdContent || !sourceContent) return { frontmatter: '', markdownBody: '' }
    const fmMatch = sourceContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (fmMatch) {
      return { frontmatter: fmMatch[1], markdownBody: fmMatch[2] }
    }
    return { frontmatter: '', markdownBody: sourceContent }
  }, [isMdContent, sourceContent])

  const renderedBody = useMemo(() => {
    if (!markdownBody) return ''
    try {
      const raw = marked.parse(markdownBody)
      return typeof raw === 'string' ? sanitizeHtml(raw) : ''
    } catch { return '' }
  }, [markdownBody])

  const displayPath = workflow.specPath || workflow.path

  return (
    <div className="detail-panel fade-in">
      <div className="detail-header">
        <div className="detail-title-row">
          <Button size="small" variant="invisible" onClick={onBack}>
            <ChevronLeftIcon size={16} />
          </Button>
          {workflow.agentic
            ? <CopilotIcon size={20} className="gh-icon-accent" />
            : <WorkflowIcon size={20} className="gh-icon-muted" />
          }
          <div>
            <h3 className="detail-title">{workflow.name}</h3>
            <div className="detail-meta">
              <Label variant={workflow.agentic ? 'accent' : 'secondary'}>
                {workflow.agentic ? 'Agentic' : 'CI/CD'}
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
