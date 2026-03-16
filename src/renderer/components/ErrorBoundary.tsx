import React from 'react'
import { Flash, Button } from '@primer/react'
import { CopyIcon, AlertIcon, XIcon } from '@primer/octicons-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * React Error Boundary — catches render crashes and shows a copyable error
 * report instead of a white screen or silent failure.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })
    // Also log to console for dev tools
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  private getErrorReport(): string {
    const { error, errorInfo } = this.state
    const lines = [
      '## Repo Assist Crash Report',
      '',
      `**Error:** ${error?.message ?? 'Unknown error'}`,
      '',
      '**Stack:**',
      '```',
      error?.stack ?? '(no stack)',
      '```',
      '',
    ]
    if (errorInfo?.componentStack) {
      lines.push('**Component Stack:**', '```', errorInfo.componentStack, '```', '')
    }
    lines.push(`**Time:** ${new Date().toISOString()}`)
    return lines.join('\n')
  }

  private handleCopy = () => {
    navigator.clipboard.writeText(this.getErrorReport())
  }

  private handleDismiss = () => {
    this.setState({ error: null, errorInfo: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxHeight: '100vh', overflow: 'auto' }}>
          <Flash variant="danger" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertIcon size={16} />
              <strong>Something crashed</strong>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button size="small" leadingVisual={CopyIcon} onClick={this.handleCopy}>
                  Copy report
                </Button>
                <Button size="small" variant="invisible" onClick={this.handleDismiss} aria-label="Dismiss">
                  <XIcon size={14} />
                </Button>
              </div>
            </div>
          </Flash>
          <div style={{
            background: 'var(--bgColor-inset, #0d1117)',
            border: '1px solid var(--borderColor-default, #30363d)',
            borderRadius: 6,
            padding: 16,
            fontFamily: 'var(--fontFamily-mono)',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--fgColor-muted, #9198a1)',
            maxHeight: '60vh',
            overflow: 'auto',
          }}>
            <div style={{ color: 'var(--danger-fg, #f85149)', marginBottom: 8 }}>
              {this.state.error.message}
            </div>
            {this.state.error.stack && (
              <div style={{ marginBottom: 12 }}>{this.state.error.stack}</div>
            )}
            {this.state.errorInfo?.componentStack && (
              <>
                <div style={{ color: 'var(--fgColor-default, #f0f6fc)', marginBottom: 4 }}>Component stack:</div>
                <div>{this.state.errorInfo.componentStack}</div>
              </>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
