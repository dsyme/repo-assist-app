import { useState, useEffect, useCallback, useMemo } from 'react'
import { Text, ActionList, Button, Spinner, RelativeTime } from '@primer/react'
import {
  IssueOpenedIcon,
  GitPullRequestIcon,
  CheckCircleIcon,
  SyncIcon,
  CommentIcon,
  GitCommitIcon,
  EyeIcon,
} from '@primer/octicons-react'
import { PTALItem, NavState } from '@shared/types'

interface PTALPanelProps {
  repos: string[]
  /** Optional: restrict to a single repo (for repo-specific view) */
  filterRepo?: string
  onNavigate: (nav: NavState) => void
}

/**
 * Build a human-friendly action title for a PTAL item
 * e.g. "Check comment on #136 — Fix lazy series" or "Review #187 — Add property tests"
 */
function ptalActionTitle(item: PTALItem): { verb: string; number: string; title: string } {
  const cleanTitle = item.title.replace(/^\[Repo Assist\]\s*/, '')
  const number = `#${item.number}`
  if (item.lastActivity.type === 'comment') {
    return { verb: 'Check comment on', number, title: cleanTitle }
  }
  if (item.lastActivity.type === 'commit') {
    return { verb: 'Review update on', number, title: cleanTitle }
  }
  // 'created' — the bot opened the issue/PR
  if (item.type === 'pr') {
    return { verb: 'Review', number, title: cleanTitle }
  }
  return { verb: 'Review', number, title: cleanTitle }
}

export function PTALPanel({ repos, filterRepo, onNavigate }: PTALPanelProps) {
  const [items, setItems] = useState<PTALItem[]>([])
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [clearing, setClearing] = useState<Set<string>>(new Set())

  // Load cached items on mount, then trigger background refresh
  useEffect(() => {
    let cancelled = false
    async function init() {
      // Show cached data immediately
      const cached = await window.repoAssist.getPTALCache() as PTALItem[]
      if (!cancelled && cached.length > 0) {
        setItems(cached)
        setInitialized(true)
      }
      // Then refresh in background
      if (!cancelled && repos.length > 0) {
        setLoading(true)
        try {
          const fresh = await window.repoAssist.scanPTAL(repos)
          if (!cancelled) setItems(fresh)
        } catch {
          // Keep cached data on error
        } finally {
          if (!cancelled) {
            setLoading(false)
            setInitialized(true)
          }
        }
      } else {
        setInitialized(true)
      }
    }
    init()
    return () => { cancelled = true }
  }, [repos])

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const fresh = await window.repoAssist.scanPTAL(repos)
      setItems(fresh)
    } catch {
      // Keep current items
    } finally {
      setLoading(false)
    }
  }, [repos])

  const handleClear = useCallback(async (item: PTALItem) => {
    // Animate out
    setClearing(prev => new Set(prev).add(item.key))
    await window.repoAssist.clearPTALItem(item.key, item.lastActivity.id)
    // Remove after animation
    setTimeout(() => {
      setItems(prev => prev.filter(i => i.key !== item.key))
      setClearing(prev => {
        const next = new Set(prev)
        next.delete(item.key)
        return next
      })
    }, 350)
  }, [])

  const handleItemClick = useCallback((item: PTALItem) => {
    onNavigate({
      section: null,
      repo: item.repo,
      repoSection: item.type === 'pr' ? 'prs' : 'issues',
      selectedItem: item.number,
    })
  }, [onNavigate])

  // Filter and group items
  const filteredItems = useMemo(() => {
    if (filterRepo) return items.filter(i => i.repo === filterRepo)
    return items
  }, [items, filterRepo])

  const groupedByRepo = useMemo(() => {
    const groups: { repo: string; items: PTALItem[] }[] = []
    const map = new Map<string, PTALItem[]>()
    for (const item of filteredItems) {
      const arr = map.get(item.repo) ?? []
      arr.push(item)
      map.set(item.repo, arr)
    }
    for (const [repo, repoItems] of map) {
      groups.push({ repo, items: repoItems })
    }
    return groups
  }, [filteredItems])

  const shortRepo = (repo: string) => repo.split('/').pop() || repo
  const showGroupHeaders = !filterRepo && groupedByRepo.length > 1

  return (
    <div>
      <div className="header-with-action">
        <div className="panel-header">
          <h2>Please Take a Look</h2>
          <span className="subtitle">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} needing attention
            {filterRepo
              ? <> in {shortRepo(filterRepo)}</>
              : <> across {repos.length} repo{repos.length !== 1 ? 's' : ''}</>
            }
          </span>
        </div>
        {!filterRepo && (
          <Button
            leadingVisual={loading ? Spinner : SyncIcon}
            onClick={handleRefresh}
            disabled={loading}
            size="small"
          >
            {loading ? 'Scanning…' : 'Refresh'}
          </Button>
        )}
      </div>

      {!initialized && (
        <div className="loading-center" style={{ height: 200 }}>
          <Spinner size="medium" />
          <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>Scanning repositories…</Text>
        </div>
      )}

      {initialized && filteredItems.length === 0 && (
        <div className="empty-state">
          <CheckCircleIcon size={48} />
          <p>All caught up! No automation activity needs your attention.</p>
        </div>
      )}

      {initialized && filteredItems.length > 0 && (
        <div>
          {groupedByRepo.map(group => (
            <div key={group.repo}>
              {showGroupHeaders && (
                <div className="ptal-repo-header">
                  <Text weight="semibold" size="small">{shortRepo(group.repo)}</Text>
                </div>
              )}
              <ActionList>
                {group.items.map((item, idx) => {
                  const isClearing = clearing.has(item.key)
                  const action = ptalActionTitle(item)
                  return (
                    <ActionList.Item
                      key={item.key}
                      onClick={() => handleItemClick(item)}
                      className={`ptal-item fade-in ${isClearing ? 'ptal-clearing' : ''}`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <ActionList.LeadingVisual>
                        {item.type === 'pr'
                          ? <GitPullRequestIcon size={16} className="gh-icon-open" />
                          : <IssueOpenedIcon size={16} className="gh-icon-open" />
                        }
                      </ActionList.LeadingVisual>
                      <div className="ptal-item-content">
                        <div className="ptal-item-header">
                          <Text style={{ color: 'var(--fgColor-muted)' }}>{action.verb} </Text>
                          <Text weight="semibold">{action.number}</Text>
                          <Text style={{ color: 'var(--fgColor-muted)' }}> — </Text>
                          <Text>{action.title}</Text>
                        </div>
                        <div className="ptal-item-meta">
                          <PTALActivityBadge activity={item.lastActivity} />
                          <RelativeTime date={new Date(item.lastActivity.when)} style={{ fontSize: 12 }} />
                        </div>
                      </div>
                      <ActionList.TrailingVisual>
                        <Button
                          size="small"
                          variant="invisible"
                          onClick={(e) => { e.stopPropagation(); handleClear(item) }}
                          aria-label="Clear item"
                          title="I've seen this — clear it"
                        >
                          <EyeIcon size={16} />
                        </Button>
                      </ActionList.TrailingVisual>
                    </ActionList.Item>
                  )
                })}
              </ActionList>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PTALActivityBadge({ activity }: { activity: PTALItem['lastActivity'] }) {
  const name = activity.automationName ?? activity.actor
  const icon = activity.type === 'comment'
    ? <CommentIcon size={12} />
    : activity.type === 'commit'
      ? <GitCommitIcon size={12} />
      : <IssueOpenedIcon size={12} />

  return (
    <span className="ptal-activity-badge">
      {icon}
      <Text size="small" style={{ color: '#da70d6' }}>{name}</Text>
      <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
        {activity.type === 'comment' ? 'commented' : activity.type === 'commit' ? 'pushed' : 'created'}
      </Text>
    </span>
  )
}
