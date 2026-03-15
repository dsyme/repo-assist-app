// Shared types between main and renderer

export interface RepoIssue {
  number: number
  title: string
  state: string
  labels: { name: string; color: string }[]
  author: { login: string }
  createdAt: string
  updatedAt: string
  comments: { totalCount: number }[]
}

export interface RepoPR {
  number: number
  title: string
  state: string
  isDraft: boolean
  author: { login: string }
  labels: { name: string; color: string }[]
  reviewDecision: string
  statusCheckRollup: { state: string }[]
  createdAt: string
  updatedAt: string
  headRefName: string
}

export interface RepoRun {
  databaseId: number
  displayTitle: string
  status: string
  conclusion: string
  event: string
  workflowName: string
  createdAt: string
  updatedAt: string
}

export interface RepoWorkflow {
  id: number
  name: string
  path: string
  state: string
}

export interface IssueDetail {
  number: number
  title: string
  body: string
  state: string
  labels: { name: string; color: string }[]
  author: { login: string }
  comments: { author: { login: string }; body: string; createdAt: string }[]
  createdAt: string
  updatedAt: string
}

export interface PRCommit {
  oid: string
  messageHeadline: string
  committedDate: string
  authors: { login: string; name: string }[]
}

export interface PRCheck {
  __typename: string
  name: string
  status: string
  conclusion: string
  workflowName: string
  detailsUrl: string
  startedAt: string
  completedAt: string
}

export interface PRTimelineEvent {
  event: string
  created_at: string | null
  actor?: { login: string }
  message?: string
  sha?: string
  body?: string
}

export interface PRDetail {
  number: number
  title: string
  body: string
  state: string
  isDraft: boolean
  labels: { name: string; color: string }[]
  author: { login: string }
  reviewDecision: string
  headRefName: string
  additions: number
  deletions: number
  files: { path: string; additions: number; deletions: number }[]
  comments: { author: { login: string }; body: string; createdAt: string }[]
  reviews: { author: { login: string }; body: string; state: string; createdAt: string }[]
  statusCheckRollup: PRCheck[]
  commits: PRCommit[]
  createdAt: string
  updatedAt: string
}

export interface RecapItem {
  id: string
  type: 'REVIEW_PR' | 'CHECK_COMMENT' | 'MERGE_PR' | 'CLOSE_ISSUE' | 'FIX_CI' | 'TRIAGE_ISSUE'
  repo: string
  number: number
  title: string
  summary: string
  priority: number
  done: boolean
}

export type NavSection = 'recap' | 'commands' | 'settings'
export type RepoSection = 'issues' | 'prs' | 'runs' | 'automations'

/** Detail view state — which item is expanded inline */
export interface DetailState {
  type: 'issue' | 'pr'
  repo: string
  number: number
}

export interface NavState {
  section: NavSection | null
  repo: string | null
  repoSection: RepoSection | null
  selectedItem: number | null
}

export interface RepoAssistAPI {
  getRepos: () => Promise<string[]>
  getIssues: (repo: string) => Promise<RepoIssue[]>
  getPRs: (repo: string) => Promise<RepoPR[]>
  getRuns: (repo: string) => Promise<RepoRun[]>
  getWorkflows: (repo: string) => Promise<RepoWorkflow[]>
  getIssueDetail: (repo: string, number: number) => Promise<IssueDetail | null>
  getPRDetail: (repo: string, number: number) => Promise<PRDetail | null>
  getPRDiff: (repo: string, number: number) => Promise<string>
  getPRChecks: (repo: string, number: number) => Promise<PRCheck[]>
  getPRTimeline: (repo: string, number: number) => Promise<PRTimelineEvent[]>
  markPRReady: (repo: string, number: number) => Promise<unknown>
  getFileContent: (repo: string, path: string) => Promise<string | null>
  closeIssue: (repo: string, number: number, reason: string) => Promise<unknown>
  searchRepos: (query: string) => Promise<{ fullName: string; description: string }[]>
  getRecentRepos: () => Promise<{ fullName: string; description: string }[]>
  addRepo: (repo: string) => Promise<string[]>
  removeRepo: (repo: string) => Promise<string[]>
  getMonthlyActivity: (repo: string) => Promise<unknown>
  getEvents: (repo: string) => Promise<unknown[]>
  getCommandLog: () => Promise<unknown[]>
  exec: (command: string) => Promise<unknown>
  getWriteMode: () => Promise<boolean>
  setWriteMode: (enabled: boolean) => Promise<void>
  addComment: (repo: string, number: number, body: string) => Promise<unknown>
  mergePR: (repo: string, number: number) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
  getReadState: () => Promise<Record<string, string>>
  markRead: (key: string) => Promise<void>
  getRecapCache: () => Promise<unknown>
  setRecapCache: (data: unknown) => Promise<void>
}

declare global {
  interface Window {
    repoAssist: RepoAssistAPI
  }
}
