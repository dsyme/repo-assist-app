import React, { useState, useEffect } from 'react'
import { Text, ActionList, Label, RelativeTime } from '@primer/react'
import { TerminalIcon } from '@primer/octicons-react'

interface LogEntry {
  command: string
  startedAt: string
  durationMs: number
  exitCode: number
  mode: 'read' | 'write' | 'dry-run'
}

export function CommandLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])

  useEffect(() => {
    const load = async () => {
      const log = await window.repoAssist.getCommandLog() as LogEntry[]
      setEntries(log.reverse())
    }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <div className="panel-header">
        <h2>Command Log</h2>
        <span className="subtitle">{entries.length} commands executed</span>
      </div>

      <ActionList>
        {entries.map((entry, i) => (
          <ActionList.Item key={i}>
            <ActionList.LeadingVisual>
              <TerminalIcon size={16} />
            </ActionList.LeadingVisual>
            <div>
              <code className="cmd-code">$ {entry.command}</code>
              <div className="cmd-meta">
                <Label variant={entry.exitCode === 0 ? 'success' : 'danger'}>
                  exit {entry.exitCode}
                </Label>
                <Label variant={entry.mode === 'dry-run' ? 'attention' : entry.mode === 'write' ? 'danger' : 'secondary'}>
                  {entry.mode}
                </Label>
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>{entry.durationMs}ms</Text>
                <RelativeTime date={new Date(entry.startedAt)} />
              </div>
            </div>
          </ActionList.Item>
        ))}
      </ActionList>

      {entries.length === 0 && (
        <div className="empty-state">
          <Text>No commands executed yet</Text>
        </div>
      )}
    </div>
  )
}
