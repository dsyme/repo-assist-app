import { useState, useEffect, useRef, useCallback } from 'react'
import { Text, TreeView, CounterLabel, Button, Spinner } from '@primer/react'
import {
  RepoIcon,
  IssueOpenedIcon,
  GitPullRequestIcon,
  TerminalIcon,
  WorkflowIcon,
  PlusCircleIcon,
  XIcon,
  SearchIcon,
  EyeIcon,
  SparkleIcon,
  SyncIcon,
  LinkExternalIcon,
} from '@primer/octicons-react'
import { NavState, RepoIssue, RepoPR, PTALItem, RepoSearchResult } from '@shared/types'

interface RepoData {
  issues: RepoIssue[]
  prs: RepoPR[]
  loading: boolean
}

interface SidebarProps {
  repos: string[]
  repoData: Record<string, RepoData>
  nav: NavState
  onNavigate: (nav: NavState) => void
  ptalItems: PTALItem[]
  onAddRepo?: (repo: string) => void
  onRefreshRepo?: (repo: string) => void
  onRemoveRepo?: (repo: string) => void
}

export function Sidebar({ repos, repoData, nav, onNavigate, ptalItems, onAddRepo, onRemoveRepo, onRefreshRepo }: SidebarProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [showRepoChooser, setShowRepoChooser] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [searchResults, setSearchResults] = useState<RepoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recentRepos, setRecentRepos] = useState<RepoSearchResult[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const chooserRef = useRef<HTMLDivElement>(null)

  const toggleRepo = (repo: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repo)) next.delete(repo)
      else next.add(repo)
      return next
    })
  }

  const repoShortName = (repo: string) => repo.split('/').pop() || repo

  const handleRepoSearch = async () => {
    if (!repoSearch.trim()) return
    setSearching(true)
    try {
      const results = await window.repoAssist.searchRepos(repoSearch)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleAddRepo = (fullName: string) => {
    onAddRepo?.(fullName)
    closeChooser()
  }

  const closeChooser = useCallback(() => {
    setShowRepoChooser(false)
    setRepoSearch('')
    setSearchResults([])
    setRecentRepos([])
  }, [])

  const openChooser = useCallback(() => {
    setShowRepoChooser(prev => {
      if (prev) {
        // Closing
        closeChooser()
        return false
      }
      return true
    })
  }, [closeChooser])

  // Fetch recent repos when chooser opens
  useEffect(() => {
    if (!showRepoChooser) return
    let cancelled = false
    setLoadingRecent(true)
    window.repoAssist.getRecentRepos().then(results => {
      if (!cancelled) {
        setRecentRepos(results.filter(r => !repos.includes(r.fullName)))
        setLoadingRecent(false)
      }
    }).catch(() => {
      if (!cancelled) setLoadingRecent(false)
    })
    return () => { cancelled = true }
  }, [showRepoChooser, repos])

  // Escape key closes chooser
  useEffect(() => {
    if (!showRepoChooser) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeChooser()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showRepoChooser, closeChooser])

  return (
    <div className="sidebar">
      <TreeView>
        {/* Recap */}
        <TreeView.Item
          id="recap"
          current={nav.section === 'recap'}
          onSelect={() => onNavigate({ section: 'recap', repo: null, repoSection: null, selectedItem: null })}
        >
          <TreeView.LeadingVisual>
            <SparkleIcon />
          </TreeView.LeadingVisual>
          <Text weight={nav.section === 'recap' ? 'semibold' : 'normal'}>Recap</Text>
        </TreeView.Item>

        {/* Please Take a Look */}
        <TreeView.Item
          id="ptal"
          current={nav.section === 'ptal'}
          onSelect={() => onNavigate({ section: 'ptal', repo: null, repoSection: null, selectedItem: null })}
        >
          <TreeView.LeadingVisual>
            <EyeIcon />
          </TreeView.LeadingVisual>
          <span className="sidebar-item-row">
            <Text weight={nav.section === 'ptal' ? 'semibold' : 'normal'}>Please Take a Look</Text>
            {ptalItems.length > 0 && (
              <CounterLabel scheme="primary">{ptalItems.length}</CounterLabel>
            )}
          </span>
        </TreeView.Item>

        {/* Add Repository button */}
        <TreeView.Item
          id="add-repo"
          onSelect={() => openChooser()}
        >
          <TreeView.LeadingVisual>
            <PlusCircleIcon />
          </TreeView.LeadingVisual>
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Add Repository</Text>
        </TreeView.Item>

        {/* Repositories */}
        {repos.map(repo => {
          const data = repoData[repo]
          const issueCount = data?.issues?.length ?? 0
          const prCount = data?.prs?.length ?? 0
          const repoPtalCount = ptalItems.filter(i => i.repo === repo).length
          const isExpanded = expandedRepos.has(repo)

          return (
            <TreeView.Item
              key={repo}
              id={repo}
              expanded={isExpanded}
              onExpandedChange={() => toggleRepo(repo)}
            >
              <TreeView.LeadingVisual>
                <RepoIcon />
              </TreeView.LeadingVisual>
              <span className="sidebar-item-row">
                <Text weight="semibold" size="small">{repoShortName(repo)}</Text>
                {repoPtalCount > 0 && (
                  <CounterLabel scheme="primary">{repoPtalCount}</CounterLabel>
                )}
                <span
                  className="sidebar-refresh-btn"
                  title="Open in GitHub"
                  onClick={(e) => { e.stopPropagation(); window.repoAssist.openExternal(`https://github.com/${repo}`) }}
                >
                  <LinkExternalIcon size={14} />
                </span>
                {onRefreshRepo && (
                  <span
                    className="sidebar-refresh-btn"
                    title="Refresh repo data"
                    onClick={(e) => { e.stopPropagation(); onRefreshRepo(repo) }}
                  >
                    {data?.loading ? <Spinner size="small" /> : <SyncIcon size={14} />}
                  </span>
                )}
                {onRemoveRepo && (
                  <span
                    className="sidebar-remove-btn"
                    title="Remove repo"
                    onClick={(e) => { e.stopPropagation(); onRemoveRepo(repo) }}
                  >
                    <XIcon size={14} />
                  </span>
                )}
              </span>

              <TreeView.SubTree>
                {/* Repo Recap */}
                <TreeView.Item
                  id={`${repo}/repo-recap`}
                  current={nav.repo === repo && nav.repoSection === 'repo-recap'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'repo-recap', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <SparkleIcon />
                  </TreeView.LeadingVisual>
                  <Text>Recap</Text>
                </TreeView.Item>

                {/* Repo PTAL */}
                <TreeView.Item
                  id={`${repo}/repo-ptal`}
                  current={nav.repo === repo && nav.repoSection === 'repo-ptal'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'repo-ptal', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <EyeIcon />
                  </TreeView.LeadingVisual>
                  <span className="sidebar-item-row">
                    <Text>Please Take a Look</Text>
                    {repoPtalCount > 0 && (
                      <CounterLabel scheme="primary">{repoPtalCount}</CounterLabel>
                    )}
                  </span>
                </TreeView.Item>

                {/* Automations */}
                <TreeView.Item
                  id={`${repo}/automations`}
                  current={nav.repo === repo && nav.repoSection === 'automations'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'automations', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <WorkflowIcon className="gh-icon-accent" />
                  </TreeView.LeadingVisual>
                  <Text>Automations</Text>
                </TreeView.Item>

                {/* Issues */}
                <TreeView.Item
                  id={`${repo}/issues`}
                  current={nav.repo === repo && nav.repoSection === 'issues'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'issues', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <IssueOpenedIcon className="gh-icon-open" />
                  </TreeView.LeadingVisual>
                  <span className="sidebar-item-row">
                    <Text>Issues</Text>
                    <CounterLabel>{issueCount}</CounterLabel>
                  </span>
                </TreeView.Item>

                {/* PRs */}
                <TreeView.Item
                  id={`${repo}/prs`}
                  current={nav.repo === repo && nav.repoSection === 'prs'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'prs', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <GitPullRequestIcon className="gh-icon-open" />
                  </TreeView.LeadingVisual>
                  <span className="sidebar-item-row">
                    <Text>Pull Requests</Text>
                    <CounterLabel>{prCount}</CounterLabel>
                  </span>
                </TreeView.Item>
              </TreeView.SubTree>
            </TreeView.Item>
          )
        })}

        {/* Command Log */}
        <TreeView.Item
          id="commands"
          current={nav.section === 'commands'}
          onSelect={() => onNavigate({ section: 'commands', repo: null, repoSection: null, selectedItem: null })}
        >
          <TreeView.LeadingVisual>
            <TerminalIcon />
          </TreeView.LeadingVisual>
          <Text>Command Log</Text>
        </TreeView.Item>
      </TreeView>

      {/* Repo chooser dialog */}
      {showRepoChooser && (
        <div className="repo-chooser" ref={chooserRef}>
          <div className="repo-chooser-header">
            <Text weight="semibold">Add Repository</Text>
            <Button size="small" variant="invisible" onClick={closeChooser}>
              <XIcon size={14} />
            </Button>
          </div>

          {/* Recent repos */}
          {(loadingRecent || recentRepos.length > 0) && (
            <div className="repo-chooser-section">
              <Text size="small" style={{ color: 'var(--fgColor-muted)', padding: '4px 8px', display: 'block' }}>Recent</Text>
              {loadingRecent && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                  <Spinner size="small" />
                  <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Loading recent repos…</Text>
                </div>
              )}
              {recentRepos.map(r => (
                <button
                  key={r.fullName}
                  className="repo-chooser-result"
                  onClick={() => handleAddRepo(r.fullName)}
                >
                  <Text weight="semibold" size="small">{r.fullName}</Text>
                  {r.description && <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>{r.description}</Text>}
                </button>
              ))}
            </div>
          )}

          <div className="repo-chooser-search">
            <input
              className="repo-chooser-input"
              placeholder="Search repositories (e.g. owner/repo)"
              value={repoSearch}
              onChange={e => setRepoSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRepoSearch()
                if (e.key === 'Escape') closeChooser()
              }}
              autoFocus
            />
            <Button size="small" onClick={handleRepoSearch} disabled={searching}>
              <SearchIcon size={14} />
            </Button>
          </div>
          {searching && <Text size="small" style={{ padding: 8, color: 'var(--fgColor-muted)' }}>Searching…</Text>}
          <div className="repo-chooser-results">
            {searchResults.map(r => (
              <button
                key={r.fullName}
                className="repo-chooser-result"
                onClick={() => handleAddRepo(r.fullName)}
                disabled={repos.includes(r.fullName)}
              >
                <Text weight="semibold" size="small">{r.fullName}</Text>
                {r.description && <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>{r.description}</Text>}
                {repos.includes(r.fullName) && <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Already added</Text>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
