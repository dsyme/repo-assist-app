// Shared types between main and renderer

export interface RepoIssue {
  number: number
  title: string
  state: string
  labels: { name: string; color: string }[]
  author: { login: string }
  createdAt: string
  updatedAt: string
  comments: { author: { login: string }; body: string; createdAt: string }[]
}

export interface RepoPR {
  number: number
  title: string
  state: string
  isDraft: boolean
  author: { login: string }
  labels: { name: string; color: string }[]
  reviewDecision: string
  mergeable: string
  mergeStateStatus: string
  statusCheckRollup: { status: string; conclusion: string; name: string }[]
  latestReviews?: { author: { login: string }; state: string }[]
  createdAt: string
  updatedAt: string
  headRefName: string
  baseRefName: string
}

export interface PRBranchStatus {
  behindBy: number
  status: 'up_to_date' | 'behind' | 'unknown'
}

export interface RepoRun {
  databaseId: number
  displayTitle: string
  status: string
  conclusion: string
  event: string
  workflowName: string
  headBranch: string
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
  mergeable: string
  mergeStateStatus: string
  statusCheckRollup: PRCheck[]
  commits: PRCommit[]
  createdAt: string
  updatedAt: string
}

export interface RecapSummary {
  /** Markdown bullet list from AI */
  markdown: string
  /** When this recap was generated */
  generatedAt: string
  /** Error message if AI call failed */
  error?: string
}

export interface RepoStorageStatus {
  /** User's stored preference, null if never asked */
  preference: 'remote' | 'local' | null
  /** Whether .repo-assist-app repo exists on GitHub for the user */
  remoteExists: boolean
}

export type NavSection = 'recap' | 'ptal' | 'commands' | 'settings'
export type RepoSection = 'issues' | 'prs' | 'automations' | 'repo-recap' | 'repo-ptal'

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
  getRepoStorageStatus: () => Promise<RepoStorageStatus>
  setRepoStoragePreference: (pref: 'remote' | 'local') => Promise<string[]>
  getIssues: (repo: string) => Promise<RepoIssue[]>
  getPRs: (repo: string) => Promise<RepoPR[]>
  getRuns: (repo: string) => Promise<RepoRun[]>
  getWorkflows: (repo: string) => Promise<RepoWorkflow[]>
  enableWorkflow: (repo: string, workflowId: number) => Promise<unknown>
  disableWorkflow: (repo: string, workflowId: number) => Promise<unknown>
  getIssueDetail: (repo: string, number: number) => Promise<IssueDetail | null>
  getPRDetail: (repo: string, number: number) => Promise<PRDetail | null>
  getPRDiff: (repo: string, number: number) => Promise<string>
  getPRChecks: (repo: string, number: number) => Promise<PRCheck[]>
  getPRTimeline: (repo: string, number: number) => Promise<PRTimelineEvent[]>
  markPRReady: (repo: string, number: number) => Promise<unknown>
  getPRBranchStatus: (repo: string, number: number) => Promise<PRBranchStatus>
  updatePRBranch: (repo: string, number: number) => Promise<unknown>
  getFileContent: (repo: string, path: string) => Promise<string | null>
  closeIssue: (repo: string, number: number, reason: string) => Promise<unknown>
  reopenIssue: (repo: string, number: number) => Promise<unknown>
  closePR: (repo: string, number: number) => Promise<unknown>
  cancelRun: (repo: string, runId: number) => Promise<unknown>
  rerunFailedJobs: (repo: string, runId: number) => Promise<unknown>
  applyPatchPR: (issueRepo: string, targetRepo: string, commands: string[]) => Promise<void>
  getRepoPermission: (repo: string) => Promise<string>
  getViewerLogin: () => Promise<string>
  searchRepos: (query: string) => Promise<{ fullName: string; description: string }[]>
  getRecentRepos: () => Promise<{ fullName: string; description: string }[]>
  addRepo: (repo: string) => Promise<string[]>
  removeRepo: (repo: string) => Promise<string[]>
  getMonthlyActivity: (repo: string) => Promise<unknown>
  getEvents: (repo: string) => Promise<unknown[]>
  getCommandLog: () => Promise<unknown[]>
  exec: (command: string) => Promise<unknown>
  checkModelsExtension: () => Promise<boolean>
  installModelsExtension: () => Promise<{ success: boolean; error?: string }>
  checkAwExtension: () => Promise<boolean>
  ensureAwExtension: () => Promise<{ success: boolean; error?: string }>
  hasRepoAssistWorkflow: (repo: string) => Promise<boolean>
  awAddWizard: (repo: string) => Promise<void>
  awRun: (repo: string, specPath: string, repeat?: number) => Promise<void>
  showMessageBox: (options: { type?: string; message: string; detail?: string; buttons: string[]; defaultId?: number; cancelId?: number }) => Promise<{ response: number }>
  getWriteMode: () => Promise<boolean>
  setWriteMode: (enabled: boolean) => Promise<void>
  addComment: (repo: string, number: number, body: string) => Promise<unknown>
  mergePR: (repo: string, number: number, bypass?: boolean) => Promise<unknown>
  approvePR: (repo: string, number: number) => Promise<unknown>
  requestReview: (repo: string, number: number, reviewer: string) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
  getReadState: () => Promise<Record<string, string>>
  markRead: (key: string) => Promise<void>
  getRecapCache: (key: string) => Promise<RecapSummary | null>
  generateRecap: (repos: string[]) => Promise<RecapSummary>
  clearRecap: (key?: string) => Promise<void>
  // PTAL (Please Take a Look)
  scanPTAL: (repos: string[]) => Promise<PTALItem[]>
  getPTALCache: () => Promise<PTALItem[]>
  clearPTALItem: (key: string, activityId: string) => Promise<void>
  getPTALCleared: () => Promise<Record<string, string>>
}

/** Please Take a Look — items needing maintainer attention */
export interface PTALItem {
  /** Unique key: "owner/repo#123" */
  key: string
  repo: string
  type: 'issue' | 'pr'
  number: number
  title: string
  /** Author who created the item */
  author: string
  /** The last automation activity on this item */
  lastActivity: {
    id: string              // comment node ID (IC_...) or commit SHA or 'created:<createdAt>'
    actor: string           // login of the bot/automation
    automationName: string | null  // extracted from "Generated by [Name](...)"
    type: 'created' | 'comment' | 'commit'
    when: string            // ISO timestamp
    body?: string           // first ~200 chars of comment/commit message
  }
  /** Timestamp of the item itself */
  createdAt: string
  updatedAt: string
}

declare global {
  interface Window {
    repoAssist: RepoAssistAPI
  }
}
