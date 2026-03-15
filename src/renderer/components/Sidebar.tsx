import React, { useState } from 'react'
import { Text, TreeView, CounterLabel, Button } from '@primer/react'
import {
  ChecklistIcon,
  RepoIcon,
  IssueOpenedIcon,
  GitPullRequestIcon,
  PlayIcon,
  TerminalIcon,
  WorkflowIcon,
  PlusCircleIcon,
  XIcon,
  SearchIcon,
} from '@primer/octicons-react'
import { NavState, RepoIssue, RepoPR, RepoRun } from '@shared/types'

interface RepoData {
  issues: RepoIssue[]
  prs: RepoPR[]
  runs: RepoRun[]
  loading: boolean
}

interface SidebarProps {
  repos: string[]
  repoData: Record<string, RepoData>
  nav: NavState
  onNavigate: (nav: NavState) => void
  isUnread: (repo: string, number: number, updatedAt: string) => boolean
  getUnreadCount: (repo: string, items: { number: number; updatedAt: string }[]) => number
  onAddRepo?: (repo: string) => void
}

export function Sidebar({ repos, repoData, nav, onNavigate, getUnreadCount, onAddRepo }: SidebarProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [showRepoChooser, setShowRepoChooser] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ fullName: string; description: string }[]>([])
  const [searching, setSearching] = useState(false)

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
    setShowRepoChooser(false)
    setRepoSearch('')
    setSearchResults([])
  }

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
            <ChecklistIcon />
          </TreeView.LeadingVisual>
          <Text weight={nav.section === 'recap' ? 'semibold' : 'normal'}>Recap</Text>
        </TreeView.Item>

        {/* Add Repository button */}
        <TreeView.Item
          id="add-repo"
          onSelect={() => setShowRepoChooser(prev => !prev)}
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
          const unreadIssues = data ? getUnreadCount(repo, data.issues) : 0
          const unreadPRs = data ? getUnreadCount(repo, data.prs) : 0
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
                {(unreadIssues + unreadPRs) > 0 && (
                  <CounterLabel scheme="primary">{unreadIssues + unreadPRs}</CounterLabel>
                )}
              </span>

              <TreeView.SubTree>
                {/* Automations — first */}
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
                    {unreadIssues > 0 && (
                      <CounterLabel scheme="primary">{unreadIssues} new</CounterLabel>
                    )}
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
                    {unreadPRs > 0 && (
                      <CounterLabel scheme="primary">{unreadPRs} new</CounterLabel>
                    )}
                  </span>
                </TreeView.Item>

                {/* Automation Runs */}
                <TreeView.Item
                  id={`${repo}/runs`}
                  current={nav.repo === repo && nav.repoSection === 'runs'}
                  onSelect={() => onNavigate({ section: null, repo, repoSection: 'runs', selectedItem: null })}
                >
                  <TreeView.LeadingVisual>
                    <PlayIcon />
                  </TreeView.LeadingVisual>
                  <Text>Automation Runs</Text>
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
        <div className="repo-chooser">
          <div className="repo-chooser-header">
            <Text weight="semibold">Add Repository</Text>
            <Button size="small" variant="invisible" onClick={() => { setShowRepoChooser(false); setSearchResults([]); setRepoSearch('') }}>
              <XIcon size={14} />
            </Button>
          </div>
          <div className="repo-chooser-search">
            <input
              className="repo-chooser-input"
              placeholder="Search repositories (e.g. owner/repo)"
              value={repoSearch}
              onChange={e => setRepoSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRepoSearch()}
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
