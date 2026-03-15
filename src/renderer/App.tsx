import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Flash, ToggleSwitch, Text, Spinner } from '@primer/react'
import { ZapIcon } from '@primer/octicons-react'
import { NavState, RepoIssue, RepoPR, RepoRun } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { RecapPanel } from './components/RecapPanel'
import { IssueList } from './components/IssueList'
import { PRList } from './components/PRList'
import { RunList } from './components/RunList'
import { CommandLog } from './components/CommandLog'
import { AutomationsList } from './components/AutomationsList'
import { DetailPanel } from './components/DetailPanel'
import './styles/app.css'

interface RepoData {
  issues: RepoIssue[]
  prs: RepoPR[]
  runs: RepoRun[]
  loading: boolean
}

export default function App() {
  const [nav, setNav] = useState<NavState>({ section: 'recap', repo: null, repoSection: null, selectedItem: null })
  const [repos, setRepos] = useState<string[]>([])
  const [repoData, setRepoData] = useState<Record<string, RepoData>>({})
  const [readState, setReadState] = useState<Record<string, string>>({})
  const [writeMode, setWriteMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Track the nav state to return to when closing a detail view
  const returnNavRef = useRef<NavState | null>(null)

  useEffect(() => {
    async function init() {
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
              const [issues, prs, runs] = await Promise.all([
                window.repoAssist.getIssues(repo),
                window.repoAssist.getPRs(repo),
                window.repoAssist.getRuns(repo),
              ])
              return [repo, { issues, prs, runs, loading: false }] as const
            } catch {
              return [repo, { issues: [], prs: [], runs: [], loading: false }] as const
            }
          })
        )
        setRepoData(Object.fromEntries(dataEntries))
      } catch (err) {
        setError(`Failed to initialize: ${err}`)
        setLoading(false)
      }
    }
    init()
  }, [])

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

  const getUnreadCount = useCallback((repo: string, items: { number: number; updatedAt: string }[]): number => {
    return items.filter(item => isUnread(repo, item.number, item.updatedAt)).length
  }, [isUnread])

  const handleAddRepo = useCallback(async (repo: string) => {
    await window.repoAssist.addRepo(repo)
    if (!repos.includes(repo)) {
      setRepos(prev => [...prev, repo])
      // Fetch data for the new repo
      try {
        const [issues, prs, runs] = await Promise.all([
          window.repoAssist.getIssues(repo),
          window.repoAssist.getPRs(repo),
          window.repoAssist.getRuns(repo),
        ])
        setRepoData(prev => ({ ...prev, [repo]: { issues, prs, runs, loading: false } }))
      } catch {
        setRepoData(prev => ({ ...prev, [repo]: { issues: [], prs: [], runs: [], loading: false } }))
      }
    }
  }, [repos])

  if (loading) {
    return (
      <div className="loading-center">
        <div className="loading-spinner" />
        <Text size="medium" style={{ color: 'var(--fgColor-muted)' }}>Connecting to repositories…</Text>
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
            <ZapIcon size={16} />
            Repo Assist
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
          isUnread={isUnread}
          getUnreadCount={getUnreadCount}
          onAddRepo={handleAddRepo}
        />

        <div className="center-panel">
          {nav.section === 'recap' && (
            <RecapPanel repos={repos} repoData={repoData} onNavigate={(target) => {
              // Save current nav so we can return to recap when detail is closed
              returnNavRef.current = { ...nav }
              setNav(target)
            }} />
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
            />
          )}
          {nav.repo && nav.repoSection === 'prs' && repoData[nav.repo] && !nav.selectedItem && (
            <PRList
              repo={nav.repo}
              prs={repoData[nav.repo].prs}
              writeMode={writeMode}
              onSelectItem={(num: number) => setNav(prev => ({ ...prev, selectedItem: num }))}
            />
          )}
          {nav.repo && nav.repoSection === 'runs' && repoData[nav.repo] && (
            <RunList
              repo={nav.repo}
              runs={repoData[nav.repo].runs}
            />
          )}
          {nav.repo && nav.repoSection === 'automations' && (
            <AutomationsList repo={nav.repo} />
          )}
          {/* Detail view for selected issue or PR */}
          {nav.repo && nav.selectedItem && (nav.repoSection === 'issues' || nav.repoSection === 'prs') && (
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
              onNavigateToItem={(targetRepo, num) => {
                // Navigate to the item — try issues first, fallback to prs
                returnNavRef.current = { ...nav }
                setNav({ section: null, repo: targetRepo, repoSection: 'issues', selectedItem: num })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
