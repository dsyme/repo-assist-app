import React from 'react'
import { Text, ActionList, Label, RelativeTime } from '@primer/react'
import { CheckCircleIcon, XCircleIcon, ClockIcon, PlayIcon } from '@primer/octicons-react'
import { RepoRun } from '@shared/types'

interface RunListProps {
  repo: string
  runs: RepoRun[]
}

function RunStatusIcon({ status, conclusion }: { status: string; conclusion: string }) {
  if (status === 'completed' && conclusion === 'success') return <CheckCircleIcon size={16} fill="var(--fgColor-success)" />
  if (status === 'completed' && conclusion === 'failure') return <XCircleIcon size={16} fill="var(--fgColor-danger)" />
  if (status === 'in_progress') return <PlayIcon size={16} fill="var(--fgColor-attention)" />
  return <ClockIcon size={16} />
}

export function RunList({ repo, runs }: RunListProps) {
  return (
    <div>
      <div className="panel-header">
        <h2>Actions Runs — {repo.split('/').pop()}</h2>
        <span className="subtitle">{runs.length} recent runs</span>
      </div>

      <ActionList>
        {runs.map(run => (
          <ActionList.Item key={run.databaseId}>
            <ActionList.LeadingVisual>
              <RunStatusIcon status={run.status} conclusion={run.conclusion} />
            </ActionList.LeadingVisual>
            <div>
              <Text weight="semibold">{run.displayTitle}</Text>
              <div className="run-meta">
                <Label>{run.workflowName}</Label>
                <Label variant={run.conclusion === 'success' ? 'success' : run.conclusion === 'failure' ? 'danger' : 'secondary'}>
                  {run.conclusion || run.status}
                </Label>
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>{run.event}</Text>
                <RelativeTime date={new Date(run.createdAt)} />
              </div>
            </div>
          </ActionList.Item>
        ))}
      </ActionList>

      {runs.length === 0 && (
        <div className="empty-state">
          <Text>No recent action runs</Text>
        </div>
      )}
    </div>
  )
}
