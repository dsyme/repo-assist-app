import { useState, useEffect, useCallback, useMemo } from 'react'
import { Text, Button, Spinner, Flash } from '@primer/react'
import {
  SyncIcon,
  TrashIcon,
  SparkleIcon,
  DownloadIcon,
} from '@primer/octicons-react'
import { marked } from 'marked'
import { RecapSummary } from '@shared/types'
import { sanitizeHtml } from '../utils/sanitize'

marked.setOptions({ gfm: true, breaks: true })

interface RecapPanelProps {
  repos: string[]
  /** Optional: restrict to a single repo (for repo-specific view) */
  filterRepo?: string
}

export function RecapPanel({ repos, filterRepo }: RecapPanelProps) {
  const [summary, setSummary] = useState<RecapSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [modelsInstalled, setModelsInstalled] = useState<boolean | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  // The repos to generate for
  const targetRepos = filterRepo ? [filterRepo] : repos
  const cacheKey = filterRepo ?? '__all__'

  // Reset state when switching between repos/global
  useEffect(() => {
    setSummary(null)
    setInitialized(false)
    setLoading(false)
  }, [cacheKey])

  // Check if gh-models extension is installed
  useEffect(() => {
    window.repoAssist.checkModelsExtension().then(setModelsInstalled)
  }, [])

  const handleInstallModels = useCallback(async () => {
    setInstalling(true)
    setInstallError(null)
    const result = await window.repoAssist.installModelsExtension()
    setInstalling(false)
    if (result.success) {
      setModelsInstalled(true)
    } else {
      setInstallError(result.error || 'Installation failed')
    }
  }, [])

  // Load cached recap, then auto-refresh if stale or missing
  useEffect(() => {
    if (modelsInstalled === null) return // Still checking
    let cancelled = false
    async function init() {
      const cached = await window.repoAssist.getRecapCache(cacheKey) as RecapSummary | null
      if (!cancelled && cached?.markdown) {
        setSummary(cached)
        setInitialized(true)
        return
      }
      // No cache — auto generate only if extension is installed
      if (!cancelled && targetRepos.length > 0 && modelsInstalled) {
        setInitialized(true)
        setLoading(true)
        try {
          const fresh = await window.repoAssist.generateRecap(targetRepos)
          if (!cancelled) setSummary(fresh)
        } catch {
          if (!cancelled) setSummary({ markdown: '', generatedAt: new Date().toISOString(), error: 'Failed to generate recap.' })
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else {
        setInitialized(true)
      }
    }
    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, modelsInstalled])

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const fresh = await window.repoAssist.generateRecap(targetRepos)
      setSummary(fresh)
    } catch {
      setSummary({ markdown: '', generatedAt: new Date().toISOString(), error: 'Failed to generate recap.' })
    } finally {
      setLoading(false)
    }
  }, [targetRepos])

  const handleClear = useCallback(async () => {
    await window.repoAssist.clearRecap(cacheKey)
    setSummary(null)
  }, [cacheKey])

  const renderedHtml = useMemo(() => {
    if (!summary?.markdown) return ''
    try {
      const raw = marked.parse(summary.markdown)
      return typeof raw === 'string' ? sanitizeHtml(raw) : ''
    } catch {
      return sanitizeHtml(summary.markdown)
    }
  }, [summary?.markdown])

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>
            <span style={{ marginRight: 6, verticalAlign: 'text-bottom', display: 'inline-block' }}><SparkleIcon size={20} /></span>
            Recap
          </h2>
          <span className="subtitle">
            AI chronicle of recent activity
            {filterRepo
              ? <> in {filterRepo.split('/').pop()}</>
              : <> across {repos.length} repo{repos.length !== 1 ? 's' : ''}</>
            }
            {summary?.generatedAt && !summary.error && (
              <> · generated <time dateTime={summary.generatedAt}>{relativeTimeString(summary.generatedAt)}</time></>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            leadingVisual={loading ? Spinner : SyncIcon}
            onClick={handleRefresh}
            disabled={loading}
            size="small"
          >
            {loading ? <span className="generating-text">Generating</span> : 'Refresh'}
          </Button>
          {summary?.markdown && (
            <Button
              leadingVisual={TrashIcon}
              onClick={handleClear}
              size="small"
              variant="danger"
              disabled={loading}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {summary?.error && (
        <Flash variant="danger" style={{ margin: '12px 0' }}>
          {summary.error}
        </Flash>
      )}

      {modelsInstalled === false && !summary?.markdown && (
        <div className="empty-state">
          <SparkleIcon size={48} />
          <p>The <strong>gh-models</strong> extension is required for AI-powered recaps.</p>
          <Button
            variant="primary"
            leadingVisual={installing ? Spinner : DownloadIcon}
            onClick={handleInstallModels}
            disabled={installing}
          >
            {installing ? 'Installing…' : 'Install gh-models extension'}
          </Button>
          {installError && (
            <Flash variant="danger" style={{ marginTop: 8 }}>{installError}</Flash>
          )}
        </div>
      )}

      {!initialized && !loading && (
        <div className="loading-center" style={{ height: 200 }}>
          <Spinner size="medium" />
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Loading…</Text>
        </div>
      )}

      {loading && !summary?.markdown && (
        <div className="loading-center" style={{ height: 200 }}>
          <Spinner size="medium" />
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Scanning repos and generating AI summary…</Text>
        </div>
      )}

      {renderedHtml && (
        <div className="recap-body markdown-body fade-in" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      )}

      {initialized && !loading && !summary?.markdown && !summary?.error && (
        <div className="empty-state">
          <SparkleIcon size={48} />
          <p>No recap yet. Hit Refresh to generate an AI summary of automation activity.</p>
        </div>
      )}
    </div>
  )
}

function relativeTimeString(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
