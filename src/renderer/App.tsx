import { useState, useEffect, useCallback, useRef } from 'react'
import { Flash, ToggleSwitch, Text, Button } from '@primer/react'
import { ZapIcon } from '@primer/octicons-react'
import { NavState, RepoIssue, RepoPR, PTALItem, RepoStorageStatus } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { RecapPanel } from './components/RecapPanel'
import { PTALPanel } from './components/PTALPanel'
import { IssueList } from './components/IssueList'
import { PRList } from './components/PRList'
import { CommandLog } from './components/CommandLog'
import { AutomationsList } from './components/AutomationsList'
import { DetailPanel } from './components/DetailPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/app.css'

interface RepoData {
  issues: RepoIssue[]
  prs: RepoPR[]
  loading: boolean
}

export default function App() {
  const [nav, setNav] = useState<NavState>({ section: 'recap', repo: null, repoSection: null, selectedItem: null })
  const [repos, setRepos] = useState<string[]>([])
  const [repoData, setRepoData] = useState<Record<string, RepoData>>({})
  const [readState, setReadState] = useState<Record<string, string>>({})
  const [writeMode, setWriteMode] = useState(false)
  const [ptalItems, setPtalItems] = useState<PTALItem[]>([])
  const [ptalLoading, setPtalLoading] = useState(false)
  const [ptalInitialized, setPtalInitialized] = useState(false)
  // Keys cleared this session — prevents in-flight scans from resurrecting dismissed items
  const ptalClearedKeysRef = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storagePrompt, setStoragePrompt] = useState(false)
  const [storageLoading, setStorageLoading] = useState(false)
  // Track the nav state to return to when closing a detail view
  const returnNavRef = useRef<NavState | null>(null)

  useEffect(() => {
    async function init() {
      try {
        // Check repo storage status first
        const status: RepoStorageStatus = await window.repoAssist.getRepoStorageStatus()
        if (status.preference === null && !status.remoteExists) {
          // Need to ask the user — show prompt
          setStoragePrompt(true)
          setLoading(false)
          return
        }

        await loadApp()
      } catch (err) {
        setError(`Failed to initialize: ${err}`)
        setLoading(false)
      }
    }
    init()
  }, [])

  const loadApp = useCallback(async () => {
    try {
      const [repoList, readSt, wm] = await Promise.all([
        window.repoAssist.getRepos(),
        window.repoAssist.getReadState(),
        window.repoAssist.getWriteMode(),
      ])
      setRepos(repoList)
      setReadState(readSt)
      setWriteMode(wm)
      setLoading(false)

      const dataEntries = await Promise.all(
        repoList.map(async (repo) => {
          try {
            const [issues, prs] = await Promise.all([
              window.repoAssist.getIssues(repo),
              window.repoAssist.getPRs(repo),
            ])
            return [repo, { issues, prs, loading: false }] as const
          } catch {
            return [repo, { issues: [], prs: [], loading: false }] as const
          }
        })
      )
      setRepoData(Object.fromEntries(dataEntries))

      // Load PTAL cache for sidebar counts, then refresh in background
      window.repoAssist.getPTALCache().then((cached: PTALItem[]) => {
        if (cached.length > 0) {
          setPtalItems(cached)
          setPtalInitialized(true)
        }
      }).catch(() => {})
      setPtalLoading(true)
      window.repoAssist.scanPTAL(repoList).then((fresh: PTALItem[]) => {
        setPtalItems(fresh.filter(i => !ptalClearedKeysRef.current.has(i.key)))
        setPtalInitialized(true)
        setPtalLoading(false)
      }).catch(() => { setPtalLoading(false) })

      // Kick off background recap generation so results are cached when the user opens panels.
      const generateInBackground = async () => {
        try {
          // Check all recap caches in parallel to minimise IPC round-trips
          const keys = ['__all__', ...repoList]
          const caches = await Promise.all(keys.map(k => window.repoAssist.getRecapCache(k).catch(() => null)))
          const [globalCache, ...repoCaches] = caches
          if (!globalCache) {
            await window.repoAssist.generateRecap(repoList)
          }
          for (let i = 0; i < repoList.length; i++) {
            if (!repoCaches[i]) {
              await window.repoAssist.generateRecap([repoList[i]])
            }
          }
        } catch { /* background — ignore errors */ }
      }
      generateInBackground()
    } catch (err) {
      setError(`Failed to initialize: ${err}`)
      setLoading(false)
    }
  }, [])

  const handleStorageChoice = useCallback(async (choice: 'remote' | 'local') => {
    setStorageLoading(true)
    try {
      await window.repoAssist.setRepoStoragePreference(choice)
      setStoragePrompt(false)
      setLoading(true)
      await loadApp()
    } catch (err) {
      setError(`Failed to set up repo storage: ${err}`)
    } finally {
      setStorageLoading(false)
    }
  }, [loadApp])

  const handleWriteModeToggle = useCallback(async () => {
    const newValue = !writeMode
    setWriteMode(newValue)
    await window.repoAssist.setWriteMode(newValue)
  }, [writeMode])

  const handleMarkRead = useCallback(async (key: string) => {
    await window.repoAssist.markRead(key)
    setReadState(prev => ({ ...prev, [key]: new Date().toISOString() }))
  }, [])

  const isUnread = useCallback((repo: string, number: number, updatedAt: string): boolean => {
    const key = `${repo}#${number}`
    const lastRead = readState[key]
    if (!lastRead) return true
    return new Date(updatedAt) > new Date(lastRead)
  }, [readState])

  const refreshPTAL = useCallback(async (repoList?: string[]) => {
    const target = repoList ?? repos
    setPtalLoading(true)
    try {
      const fresh = await window.repoAssist.scanPTAL(target)
      setPtalItems(fresh.filter(i => !ptalClearedKeysRef.current.has(i.key)))
      setPtalInitialized(true)
    } catch { /* keep current items */ }
    setPtalLoading(false)
  }, [repos])

  const handleClearPTAL = useCallback(async (item: PTALItem) => {
    ptalClearedKeysRef.current.add(item.key)
    await window.repoAssist.clearPTALItem(item.key, item.lastActivity.id)
    setPtalItems(prev => prev.filter(i => i.key !== item.key))
  }, [])

  const handleRemoveRepo = useCallback(async (repo: string) => {
    await window.repoAssist.removeRepo(repo)
    setRepos(prev => prev.filter(r => r !== repo))
    setRepoData(prev => {
      const next = { ...prev }
      delete next[repo]
      return next
    })
    setPtalItems(prev => prev.filter(i => i.repo !== repo))
    // Navigate away if viewing the removed repo
    if (nav.repo === repo) {
      setNav({ section: 'recap', repo: null, repoSection: null, selectedItem: null })
    }
  }, [nav.repo])

  const handleAddRepo = useCallback(async (repo: string) => {
    // Probe for existing repo-assist workflow
    const hasWorkflow = await window.repoAssist.hasRepoAssistWorkflow(repo)

    if (!hasWorkflow) {
      const result = await window.repoAssist.showMessageBox({
        message: `Repository ${repo} doesn't have a GitHub Agentic Workflow (repo-assist) installed.`,
        detail: 'Would you like to open a terminal to install it using the gh-aw wizard?',
        buttons: ['Yes', 'No', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      })

      if (result.response === 2) return // Cancel — don't add

      if (result.response === 0) {
        // Yes — ensure gh-aw extension, then open wizard terminal
        const ensureResult = await window.repoAssist.ensureAwExtension()
        if (!ensureResult.success) {
          await window.repoAssist.showMessageBox({
            type: 'warning',
            message: 'Failed to install gh-aw extension',
            detail: ensureResult.error || 'Unknown error. You can install it manually with: gh extension install github/gh-aw',
            buttons: ['OK'],
          })
        } else {
          await window.repoAssist.awAddWizard(repo)
        }
      }
      // Yes or No: fall through to add the repo
    }

    await window.repoAssist.addRepo(repo)
    if (!repos.includes(repo)) {
      const updatedRepos = [...repos, repo]
      setRepos(updatedRepos)
      // Fetch data for the new repo
      try {
        const [issues, prs] = await Promise.all([
          window.repoAssist.getIssues(repo),
          window.repoAssist.getPRs(repo),
        ])
        setRepoData(prev => ({ ...prev, [repo]: { issues, prs, loading: false } }))
      } catch {
        setRepoData(prev => ({ ...prev, [repo]: { issues: [], prs: [], loading: false } }))
      }
      // Re-scan PTAL across all repos (including the new one)
      refreshPTAL(updatedRepos)
    }
  }, [repos, refreshPTAL])

  /** Optimistically remove a PTAL item by repo+number (e.g. after merge/close) */
  const removePTALForPR = useCallback((repo: string, prNumber: number) => {
    const key = `${repo}#${prNumber}`
    ptalClearedKeysRef.current.add(key)
    setPtalItems(prev => prev.filter(i => i.key !== key))
  }, [])

  /** Explicitly re-fetch issues & PRs for a repo (user-triggered refresh) */
  const handleRefreshRepo = useCallback(async (repo: string) => {
    setRepoData(prev => ({ ...prev, [repo]: { ...prev[repo], loading: true } }))
    try {
      const [issues, prs] = await Promise.all([
        window.repoAssist.getIssues(repo),
        window.repoAssist.getPRs(repo),
      ])
      setRepoData(prev => ({ ...prev, [repo]: { issues, prs, loading: false } }))
    } catch {
      setRepoData(prev => ({ ...prev, [repo]: { ...prev[repo], loading: false } }))
    }
    // Also refresh PTAL in background
    refreshPTAL()
  }, [refreshPTAL])

  // Global click handler: intercept GitHub issue/PR links
  // Normal click = navigate internally, Shift+click = open in browser
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Walk up from click target to find closest <a>
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return

      // Parse GitHub issue/PR URLs
      const match = href.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/)
      if (!match) {
        // Non-GitHub link or non-issue/PR — open externally
        e.preventDefault()
        window.repoAssist.openExternal(href)
        return
      }

      e.preventDefault()
      const [, linkRepo, linkType, linkNum] = match
      const number = parseInt(linkNum, 10)

      if (e.shiftKey) {
        // Shift+click: open externally
        window.repoAssist.openExternal(href)
        return
      }

      // Navigate internally
      returnNavRef.current = { ...nav }
      const repoSection = linkType === 'pull' ? 'prs' : 'issues'
      setNav({ section: null, repo: linkRepo, repoSection, selectedItem: number })
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [nav])

  if (loading) {
    return (
      <div className="loading-center">
        <div className="loading-spinner" />
        <Text size="medium" style={{ color: 'var(--fgColor-muted)' }}>Connecting to repositories…</Text>
      </div>
    )
  }

  if (storagePrompt) {
    return (
      <div className="loading-center">
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <ZapIcon size={32} />
          <h2 style={{ marginTop: 12 }}>Repo List Storage</h2>
          <p style={{ color: 'var(--fgColor-muted)', lineHeight: 1.5 }}>
            Would you like to store your repository list in a private <strong>.repo-assist-app</strong> repo
            on your GitHub account? This keeps your list synced across machines.
          </p>
          <p style={{ color: 'var(--fgColor-muted)', fontSize: '0.85em' }}>
            If you choose no, the list will be stored locally on this machine only.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <Button
              variant="primary"
              disabled={storageLoading}
              onClick={() => handleStorageChoice('remote')}
            >
              {storageLoading ? 'Creating…' : 'Yes, create repo'}
            </Button>
            <Button
              disabled={storageLoading}
              onClick={() => handleStorageChoice('local')}
            >
              No, store locally
            </Button>
          </div>
          {error && <Flash variant="danger" style={{ marginTop: 16 }}>{error}</Flash>}
        </div>
      </div>
    )
  }

  const dataLoading = Object.values(repoData).length < repos.length

  return (
    <div className="app-root">
      {/* Title bar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-brand">
            🌈 Repo Assist
          </span>
          <span className="toolbar-meta">{repos.length} repositories</span>
        </div>
        <div className="toolbar-right">
          <span id="write-mode-label" className={`write-mode-indicator ${writeMode ? 'active' : 'inactive'}`}>
            {writeMode ? '● Write' : '○ Read-only'}
          </span>
          <div className="toggle-row">
            <ToggleSwitch
              checked={writeMode}
              onClick={handleWriteModeToggle}
              size="small"
              aria-labelledby="write-mode-label"
            />
          </div>
        </div>
      </div>

      {/* Loading bar */}
      {dataLoading && (
        <div className="loading-bar">
          <div className="loading-bar-inner" />
        </div>
      )}

      {error && <Flash variant="danger" style={{ margin: '8px 16px' }}>{error}</Flash>}

      {/* Main content */}
      <div className="main-content">
        <Sidebar
          repos={repos}
          repoData={repoData}
          nav={nav}
          onNavigate={setNav}
          ptalItems={ptalItems}
          onAddRepo={handleAddRepo}
          onRemoveRepo={handleRemoveRepo}
          onRefreshRepo={handleRefreshRepo}
        />

        <div className="center-panel">
          {nav.section === 'recap' && (
            <RecapPanel repos={repos} />
          )}
          {nav.section === 'ptal' && (
            <PTALPanel
              repos={repos}
              items={ptalItems}
              loading={ptalLoading}
              initialized={ptalInitialized}
              repoData={repoData}
              onClear={handleClearPTAL}
              onRefresh={() => refreshPTAL()}
              onNavigate={(target) => {
                returnNavRef.current = { ...nav }
                setNav(target)
              }}
              onPRStateChange={(repo, prNumber) => removePTALForPR(repo, prNumber)}
            />
          )}
          {nav.section === 'commands' && (
            <CommandLog />
          )}
          {nav.repo && nav.repoSection === 'issues' && repoData[nav.repo] && !nav.selectedItem && (
            <IssueList
              repo={nav.repo}
              issues={repoData[nav.repo].issues}
              isUnread={isUnread}
              onMarkRead={handleMarkRead}
              onSelectItem={(num: number) => setNav(prev => ({ ...prev, selectedItem: num }))}
              onRefresh={() => handleRefreshRepo(nav.repo!)}
            />
          )}
          {nav.repo && nav.repoSection === 'prs' && repoData[nav.repo] && !nav.selectedItem && (
            <PRList
              repo={nav.repo}
              prs={repoData[nav.repo].prs}
              writeMode={writeMode}
              loading={repoData[nav.repo].loading}
              onSelectItem={(num: number) => setNav(prev => ({ ...prev, selectedItem: num }))}
              onRefresh={() => handleRefreshRepo(nav.repo!)}
              onPRStateChange={(prNumber: number) => removePTALForPR(nav.repo!, prNumber)}
            />
          )}
          {nav.repo && nav.repoSection === 'automations' && (
            <AutomationsList repo={nav.repo} writeMode={writeMode} />
          )}
          {nav.repo && nav.repoSection === 'repo-recap' && (
            <RecapPanel repos={repos} filterRepo={nav.repo} />
          )}
          {nav.repo && nav.repoSection === 'repo-ptal' && (
            <PTALPanel
              repos={repos}
              items={ptalItems}
              loading={ptalLoading}
              initialized={ptalInitialized}
              filterRepo={nav.repo}
              repoData={repoData}
              onClear={handleClearPTAL}
              onRefresh={() => refreshPTAL()}
              onNavigate={(target) => {
                returnNavRef.current = { ...nav }
                setNav(target)
              }}
              onPRStateChange={(repo, prNumber) => removePTALForPR(repo, prNumber)}
            />
          )}
          {/* Detail view for selected issue or PR */}
          {nav.repo && nav.selectedItem && (nav.repoSection === 'issues' || nav.repoSection === 'prs') && (
            <ErrorBoundary key={`${nav.repo}#${nav.selectedItem}`}>
              <DetailPanel
                type={nav.repoSection === 'issues' ? 'issue' : 'pr'}
                repo={nav.repo}
                number={nav.selectedItem}
                writeMode={writeMode}
                onClose={() => {
                  if (returnNavRef.current) {
                    setNav(returnNavRef.current)
                    returnNavRef.current = null
                  } else {
                    setNav(prev => ({ ...prev, selectedItem: null }))
                  }
                }}
                onIssueClosed={() => {
                  const closedRepo = nav.repo!
                  const closedNumber = nav.selectedItem!
                  removePTALForPR(closedRepo, closedNumber)
                  // Remove from the open issues list
                  setRepoData(prev => {
                    const data = prev[closedRepo]
                    if (!data) return prev
                    return { ...prev, [closedRepo]: { ...data, issues: data.issues.filter(i => i.number !== closedNumber) } }
                  })
                }}
                onMerged={() => {
                  const mergedRepo = nav.repo!
                  const mergedNumber = nav.selectedItem!
                  // Close the detail panel
                  if (returnNavRef.current) {
                    setNav(returnNavRef.current)
                    returnNavRef.current = null
                  } else {
                    setNav(prev => ({ ...prev, selectedItem: null }))
                  }
                  // Remove the PR from the open PRs list
                  setRepoData(prev => {
                    const data = prev[mergedRepo]
                    if (!data) return prev
                    return { ...prev, [mergedRepo]: { ...data, prs: data.prs.filter(pr => pr.number !== mergedNumber) } }
                  })
                  // Remove from PTAL items
                  removePTALForPR(mergedRepo, mergedNumber)
                }}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  )
}
