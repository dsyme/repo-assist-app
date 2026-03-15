import React, { useState, useEffect, useMemo } from 'react'
import { Text, Button, Label, RelativeTime, Flash, Spinner } from '@primer/react'
import {
  IssueOpenedIcon,
  IssueClosedIcon,
  GitPullRequestIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  CommentIcon,
  LinkExternalIcon,
  XIcon,
  FileDiffIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@primer/octicons-react'
import { marked } from 'marked'
import { IssueDetail, PRDetail } from '@shared/types'

// Configure marked for GitHub-flavored markdown
marked.setOptions({
  gfm: true,
  breaks: true,
})

/** Sanitize HTML by stripping script tags and event handlers */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript:/gi, '')
}

/** Render markdown to sanitized HTML */
function renderMarkdown(md: string): string {
  try {
    const raw = marked.parse(md)
    if (typeof raw === 'string') return sanitizeHtml(raw)
    return sanitizeHtml(String(md))
  } catch {
    return sanitizeHtml(md)
  }
}

/** Truncate very long text and provide expand toggle */
function TruncatedMarkdown({ content, maxLen = 8000 }: { content: string; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false)
  const isTruncated = content.length > maxLen
  const display = !expanded && isTruncated ? content.slice(0, maxLen) + '\n\n…' : content
  const html = useMemo(() => renderMarkdown(display), [display])

  return (
    <div>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isTruncated && (
        <Button
          size="small"
          variant="invisible"
          onClick={() => setExpanded(e => !e)}
          leadingVisual={expanded ? ChevronUpIcon : ChevronDownIcon}
          style={{ marginTop: 4 }}
        >
          {expanded ? 'Show less' : `Show full content (${(content.length / 1024).toFixed(0)} KB)`}
        </Button>
      )}
    </div>
  )
}

const INITIAL_COMMENT_COUNT = 20

interface DetailPanelProps {
  type: 'issue' | 'pr'
  repo: string
  number: number
  writeMode: boolean
  onClose: () => void
}

export function DetailPanel({ type, repo, number, writeMode, onClose }: DetailPanelProps) {
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null)
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null)
  const [prDiff, setPrDiff] = useState<string | null>(null)
  const [diffExpanded, setDiffExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [visibleComments, setVisibleComments] = useState(INITIAL_COMMENT_COUNT)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setIssueDetail(null)
    setPrDetail(null)
    setPrDiff(null)
    setVisibleComments(INITIAL_COMMENT_COUNT)

    const load = async () => {
      try {
        if (type === 'issue') {
          const detail = await window.repoAssist.getIssueDetail(repo, number)
          setIssueDetail(detail)
        } else {
          const [detail, diff] = await Promise.all([
            window.repoAssist.getPRDetail(repo, number),
            window.repoAssist.getPRDiff(repo, number),
          ])
          setPrDetail(detail)
          setPrDiff(diff)
        }
      } catch (err) {
        setError(`Failed to load details: ${err}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [type, repo, number])

  const openInGitHub = () => {
    const ghPath = type === 'issue' ? 'issues' : 'pull'
    window.repoAssist.openExternal(`https://github.com/${repo}/${ghPath}/${number}`)
  }

  const handleAddComment = async () => {
    if (!commentText.trim()) return
    setActionStatus('Adding comment…')
    try {
      await window.repoAssist.addComment(repo, number, commentText)
      setCommentText('')
      setActionStatus(writeMode ? 'Comment added!' : 'Comment logged (dry-run, read-only mode)')
      if (type === 'issue') {
        const detail = await window.repoAssist.getIssueDetail(repo, number)
        setIssueDetail(detail)
      } else {
        const detail = await window.repoAssist.getPRDetail(repo, number)
        setPrDetail(detail)
      }
    } catch (err) {
      setActionStatus(`Failed: ${err}`)
    }
    setTimeout(() => setActionStatus(null), 3000)
  }

  const handleMergePR = async () => {
    setActionStatus('Merging PR…')
    try {
      await window.repoAssist.mergePR(repo, number)
      setActionStatus(writeMode ? 'PR merged!' : 'Merge logged (dry-run, read-only mode)')
    } catch (err) {
      setActionStatus(`Failed: ${err}`)
    }
    setTimeout(() => setActionStatus(null), 3000)
  }

  const handleClosePR = async () => {
    setActionStatus('Closing PR…')
    try {
      await window.repoAssist.exec(`pr close ${number} -R ${repo}`)
      setActionStatus(writeMode ? 'PR closed!' : 'Close logged (dry-run, read-only mode)')
    } catch (err) {
      setActionStatus(`Failed: ${err}`)
    }
    setTimeout(() => setActionStatus(null), 3000)
  }

  if (loading) {
    return (
      <div className="detail-panel fade-in">
        <div className="detail-header">
          <span />
          <Button size="small" variant="invisible" onClick={onClose} aria-label="Close detail">
            <XIcon size={16} />
          </Button>
        </div>
        <div className="loading-center" style={{ height: 200 }}>
          <Spinner size="medium" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="detail-panel fade-in">
        <div className="detail-header">
          <span />
          <Button size="small" variant="invisible" onClick={onClose} aria-label="Close detail">
            <XIcon size={16} />
          </Button>
        </div>
        <Flash variant="danger">{error}</Flash>
      </div>
    )
  }

  // Shared comment rendering
  const renderComments = (
    comments: { author: { login: string }; body: string; createdAt: string }[],
    label: string
  ) => {
    if (!Array.isArray(comments) || comments.length === 0) return null
    const shown = comments.slice(0, visibleComments)
    const remaining = comments.length - shown.length

    return (
      <div className="detail-comments">
        <h4 className="detail-section-title">
          <CommentIcon size={16} /> {comments.length} {label}
        </h4>
        {shown.map((c, i) => (
          <div key={i} className="detail-comment">
            <div className="detail-comment-header">
              <span className="comment-avatar">
                {(c.author?.login ?? '?')[0].toUpperCase()}
              </span>
              <Text weight="semibold" size="small">{c.author?.login ?? 'unknown'}</Text>
              <RelativeTime date={new Date(c.createdAt)} />
            </div>
            <TruncatedMarkdown content={c.body || ''} maxLen={4000} />
          </div>
        ))}
        {remaining > 0 && (
          <Button
            size="small"
            variant="invisible"
            onClick={() => setVisibleComments(v => v + 20)}
            style={{ marginTop: 4 }}
          >
            Show {Math.min(remaining, 20)} more comments ({remaining} remaining)
          </Button>
        )}
      </div>
    )
  }

  // Issue detail view
  if (type === 'issue' && issueDetail) {
    return (
      <div className="detail-panel fade-in">
        <div className="detail-header">
          <div className="detail-title-row">
            {issueDetail.state === 'closed' || issueDetail.state === 'CLOSED'
              ? <IssueClosedIcon size={20} className="gh-icon-closed-issue" />
              : <IssueOpenedIcon size={20} className="gh-icon-open" />
            }
            <div>
              <h3 className="detail-title">#{issueDetail.number} {issueDetail.title}</h3>
              <div className="detail-meta">
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                  by {issueDetail.author?.login ?? 'unknown'}
                </Text>
                <RelativeTime date={new Date(issueDetail.createdAt)} />
                {issueDetail.labels?.map(l => (
                  <Label key={l.name} size="small">{l.name}</Label>
                ))}
              </div>
            </div>
          </div>
          <Button size="small" variant="invisible" onClick={onClose} aria-label="Close detail">
            <XIcon size={16} />
          </Button>
        </div>

        {/* Body — rendered as markdown */}
        <div className="detail-body">
          {issueDetail.body ? (
            <TruncatedMarkdown content={issueDetail.body} />
          ) : (
            <Text size="small" style={{ color: 'var(--fgColor-muted)', fontStyle: 'italic' }}>No description provided.</Text>
          )}
        </div>

        {/* Comments — GitHub style */}
        {renderComments(issueDetail.comments, 'comments')}

        {/* Actions */}
        <div className="detail-actions">
          <Button size="small" leadingVisual={LinkExternalIcon} onClick={openInGitHub}>
            Open in GitHub
          </Button>
        </div>

        {/* Add Comment */}
        <div className="detail-comment-form">
          <textarea
            className="detail-textarea"
            placeholder="Add a comment…"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            rows={3}
          />
          <Button size="small" variant="primary" onClick={handleAddComment} disabled={!commentText.trim()}>
            Comment{!writeMode && ' (dry-run)'}
          </Button>
        </div>

        {actionStatus && <Flash variant="default" style={{ marginTop: 8 }}>{actionStatus}</Flash>}
      </div>
    )
  }

  // PR detail view
  if (type === 'pr' && prDetail) {
    const stateIcon = prDetail.isDraft
      ? <GitPullRequestDraftIcon size={20} className="gh-icon-draft" />
      : prDetail.state === 'MERGED'
        ? <GitMergeIcon size={20} className="gh-icon-merged" />
        : prDetail.state === 'CLOSED'
          ? <GitPullRequestClosedIcon size={20} className="gh-icon-closed" />
          : <GitPullRequestIcon size={20} className="gh-icon-open" />

    return (
      <div className="detail-panel fade-in">
        <div className="detail-header">
          <div className="detail-title-row">
            {stateIcon}
            <div>
              <h3 className="detail-title">#{prDetail.number} {prDetail.title}</h3>
              <div className="detail-meta">
                <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                  by {prDetail.author?.login ?? 'unknown'}
                </Text>
                <Label size="small">{prDetail.headRefName}</Label>
                <RelativeTime date={new Date(prDetail.createdAt)} />
                {prDetail.additions != null && (
                  <span className="diff-stat">
                    <span className="diff-add">+{prDetail.additions}</span>
                    <span className="diff-del">−{prDetail.deletions}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button size="small" variant="invisible" onClick={onClose} aria-label="Close detail">
            <XIcon size={16} />
          </Button>
        </div>

        {/* Body — rendered as markdown */}
        <div className="detail-body">
          {prDetail.body ? (
            <TruncatedMarkdown content={prDetail.body} />
          ) : (
            <Text size="small" style={{ color: 'var(--fgColor-muted)', fontStyle: 'italic' }}>No description provided.</Text>
          )}
        </div>

        {/* Files changed — summary + diff */}
        {Array.isArray(prDetail.files) && prDetail.files.length > 0 && (
          <div className="detail-files">
            <h4 className="detail-section-title">
              <FileDiffIcon size={16} /> {prDetail.files.length} files changed
              <Button
                size="small"
                variant="invisible"
                onClick={() => setDiffExpanded(e => !e)}
                leadingVisual={diffExpanded ? ChevronUpIcon : ChevronDownIcon}
                style={{ marginLeft: 'auto' }}
              >
                {diffExpanded ? 'Hide diff' : 'Show diff'}
              </Button>
            </h4>
            <div className="detail-file-list">
              {prDetail.files.map(f => (
                <div key={f.path} className="detail-file-row">
                  <Text size="small" style={{ fontFamily: 'var(--fontFamily-mono)' }}>{f.path}</Text>
                  <span className="diff-stat">
                    <span className="diff-add">+{f.additions}</span>
                    <span className="diff-del">−{f.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unified diff view */}
        {diffExpanded && prDiff && (
          <DiffView diff={prDiff} />
        )}

        {/* Reviews */}
        {Array.isArray(prDetail.reviews) && prDetail.reviews.length > 0 && (
          <div className="detail-comments">
            <h4 className="detail-section-title">Reviews</h4>
            {prDetail.reviews.map((r, i) => (
              <div key={i} className="detail-comment">
                <div className="detail-comment-header">
                  <span className="comment-avatar">
                    {(r.author?.login ?? '?')[0].toUpperCase()}
                  </span>
                  <Text weight="semibold" size="small">{r.author?.login ?? 'unknown'}</Text>
                  <Label size="small" variant={r.state === 'APPROVED' ? 'success' : r.state === 'CHANGES_REQUESTED' ? 'danger' : 'secondary'}>
                    {r.state}
                  </Label>
                  <RelativeTime date={new Date(r.createdAt)} />
                </div>
                {r.body && <TruncatedMarkdown content={r.body} maxLen={4000} />}
              </div>
            ))}
          </div>
        )}

        {/* Comments */}
        {renderComments(prDetail.comments, 'comments')}

        {/* Actions */}
        <div className="detail-actions">
          <Button size="small" variant="primary" onClick={handleMergePR} disabled={prDetail.isDraft}>
            {writeMode ? 'Merge PR' : 'Merge PR (dry-run)'}
          </Button>
          <Button size="small" variant="danger" onClick={handleClosePR}>
            {writeMode ? 'Close PR' : 'Close PR (dry-run)'}
          </Button>
          <Button size="small" leadingVisual={LinkExternalIcon} onClick={openInGitHub}>
            Open in GitHub
          </Button>
        </div>

        {/* Add Comment */}
        <div className="detail-comment-form">
          <textarea
            className="detail-textarea"
            placeholder="Add a comment…"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            rows={3}
          />
          <Button size="small" variant="primary" onClick={handleAddComment} disabled={!commentText.trim()}>
            Comment{!writeMode && ' (dry-run)'}
          </Button>
        </div>

        {actionStatus && <Flash variant="default" style={{ marginTop: 8 }}>{actionStatus}</Flash>}
      </div>
    )
  }

  return null
}

/** Render unified diff with colored lines */
function DiffView({ diff }: { diff: string }) {
  const MAX_DIFF_LINES = 2000
  const lines = diff.split('\n')
  const truncated = lines.length > MAX_DIFF_LINES
  const displayLines = truncated ? lines.slice(0, MAX_DIFF_LINES) : lines

  return (
    <div className="diff-view">
      {displayLines.map((line, i) => {
        let className = 'diff-line'
        if (line.startsWith('+++') || line.startsWith('---')) {
          className += ' diff-line-header'
        } else if (line.startsWith('@@')) {
          className += ' diff-line-hunk'
        } else if (line.startsWith('+')) {
          className += ' diff-line-add'
        } else if (line.startsWith('-')) {
          className += ' diff-line-del'
        }
        return (
          <div key={i} className={className}>
            {line}
          </div>
        )
      })}
      {truncated && (
        <div className="diff-line diff-line-hunk" style={{ textAlign: 'center', padding: 8 }}>
          … diff truncated ({lines.length - MAX_DIFF_LINES} more lines)
        </div>
      )}
    </div>
  )
}
