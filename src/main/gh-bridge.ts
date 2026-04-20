import { execFile } from 'child_process'
import { promisify } from 'util'
import type { PTALItem } from '../shared/types'

const execFileAsync = promisify(execFile)

interface CommandLogEntry {
  command: string
  startedAt: string
  durationMs: number
  exitCode: number
  mode: 'read' | 'write' | 'dry-run'
  stdout?: string
  stderr?: string
}

interface GhExecResult {
  stdout: string
  stderr: string
  exitCode: number
  command: string
  durationMs: number
}

export class GhBridge {
  private commandLog: CommandLogEntry[] = []
  private maxLogEntries = 500
  private cachedUsername: string | null = null
  private cachedExtensionList: string | null = null

  /** Get the authenticated GitHub username (cached) */
  async getUsername(): Promise<string> {
    if (this.cachedUsername) return this.cachedUsername
    try {
      const { stdout } = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], { timeout: 10000 })
      this.cachedUsername = stdout.trim() || 'unknown'
    } catch {
      this.cachedUsername = 'unknown'
    }
    return this.cachedUsername
  }

  async exec(command: string, mode: 'read' | 'write' | 'dry-run' = 'read'): Promise<GhExecResult> {
    const startedAt = new Date().toISOString()
    const start = Date.now()

    try {
      // Parse the gh command — we use execFile with 'gh' as the command
      // and the rest as args for safety (no shell injection)
      const args = parseGhArgs(command)
      const { stdout, stderr } = await execFileAsync('gh', args, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      })

      const durationMs = Date.now() - start
      const entry: CommandLogEntry = {
        command: `gh ${args.join(' ')}`,
        startedAt,
        durationMs,
        exitCode: 0,
        mode
      }
      this.addToLog(entry)

      return { stdout, stderr, exitCode: 0, command: entry.command, durationMs }
    } catch (err: unknown) {
      const durationMs = Date.now() - start
      const error = err as { stdout?: string; stderr?: string; code?: number }
      const entry: CommandLogEntry = {
        command: `gh ${command}`,
        startedAt,
        durationMs,
        exitCode: error.code ?? 1,
        mode,
        stderr: error.stderr
      }
      this.addToLog(entry)

      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? String(err),
        exitCode: error.code ?? 1,
        command: entry.command,
        durationMs
      }
    }
  }

  async getConfiguredRepos(): Promise<string[]> {
    // Fetch repo list from user's .repo-assist-app repo
    try {
      const username = await this.getUsername()
      if (username === 'unknown') return []
      const result = await this.exec(
        `api repos/${username}/.repo-assist-app/contents/config.json --jq .content`
      )
      if (result.exitCode === 0 && result.stdout.trim()) {
        const decoded = Buffer.from(result.stdout.trim(), 'base64').toString('utf-8')
        const config = JSON.parse(decoded)
        if (Array.isArray(config.repositories)) {
          return config.repositories
        }
      }
    } catch {
      // Fall through
    }
    return []
  }

  /** Check if .repo-assist-app repo exists for the authenticated user */
  async checkRepoAssistAppExists(): Promise<boolean> {
    const username = await this.getUsername()
    if (username === 'unknown') return false
    const result = await this.exec(`api repos/${username}/.repo-assist-app --jq .full_name`)
    return result.exitCode === 0 && result.stdout.trim().length > 0
  }

  /** Create a private .repo-assist-app repo for the authenticated user */
  async createRepoAssistApp(): Promise<boolean> {
    const result = await this.exec(
      `api user/repos -X POST -f name=.repo-assist-app -f private=true -f description="Repo Assist App configuration"`,
      'write'
    )
    return result.exitCode === 0
  }

  /** Save repo list to the .repo-assist-app remote repo */
  async saveRemoteRepoList(repos: string[]): Promise<boolean> {
    const username = await this.getUsername()
    if (username === 'unknown') return false
    const content = JSON.stringify({ repositories: repos }, null, 2)
    const encoded = Buffer.from(content).toString('base64')

    // Check if file exists to get its SHA (needed for updates)
    const existing = await this.exec(
      `api repos/${username}/.repo-assist-app/contents/config.json --jq .sha`
    )
    const sha = existing.exitCode === 0 ? existing.stdout.trim() : ''

    const shaFlag = sha ? ` -f sha=${sha}` : ''
    const result = await this.exec(
      `api repos/${username}/.repo-assist-app/contents/config.json -X PUT -f message="Update repo list" -f content=${encoded}${shaFlag}`,
      'write'
    )
    return result.exitCode === 0
  }

  async getIssues(repo: string): Promise<unknown[]> {
    const result = await this.exec(
      `issue list -R ${repo} --json number,title,labels,author,createdAt,updatedAt,comments,state --limit 200 --state open`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
    } catch {
      return []
    }
  }

  async getPRs(repo: string): Promise<unknown[]> {
    const result = await this.exec(
      `pr list -R ${repo} --json number,title,author,state,isDraft,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,latestReviews,createdAt,updatedAt,labels,headRefName,baseRefName --limit 50 --state open`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
    } catch {
      return []
    }
  }

  async getRuns(repo: string): Promise<unknown[]> {
    // Fetch up to 500 non-cancelled, non-skipped runs via GitHub API
    // gh run list doesn't support excluding by conclusion, so we fetch more and filter
    const result = await this.exec(
      `run list -R ${repo} --json databaseId,displayTitle,status,conclusion,event,createdAt,updatedAt,workflowName,headBranch --limit 200`
    )
    if (result.exitCode !== 0) return []
    try {
      const all = JSON.parse(result.stdout) as { conclusion: string; status: string }[]
      return all.filter(r =>
        r.conclusion !== 'cancelled' && r.conclusion !== 'skipped' &&
        r.status !== 'cancelled' && r.status !== 'skipped'
      )
    } catch {
      return []
    }
  }

  async getIssueDetail(repo: string, number: number): Promise<unknown | null> {
    const result = await this.exec(
      `issue view ${number} -R ${repo} --json number,title,body,comments,labels,author,createdAt,updatedAt,state`
    )
    if (result.exitCode !== 0) return null
    try {
      return JSON.parse(result.stdout)
    } catch {
      return null
    }
  }

  async getPRDetail(repo: string, number: number): Promise<unknown | null> {
    const result = await this.exec(
      `pr view ${number} -R ${repo} --json number,title,body,comments,reviews,files,additions,deletions,statusCheckRollup,state,isDraft,reviewDecision,mergeable,mergeStateStatus,labels,author,createdAt,updatedAt,headRefName,commits`
    )
    if (result.exitCode !== 0) return null
    try {
      return JSON.parse(result.stdout)
    } catch {
      return null
    }
  }

  async getPRChecks(repo: string, number: number): Promise<unknown[]> {
    const result = await this.exec(
      `pr view ${number} -R ${repo} --json statusCheckRollup`
    )
    if (result.exitCode !== 0) return []
    try {
      const data = JSON.parse(result.stdout)
      return data.statusCheckRollup ?? []
    } catch {
      return []
    }
  }

  async getPRTimeline(repo: string, number: number): Promise<unknown[]> {
    const result = await this.exec(
      `api repos/${repo}/issues/${number}/timeline --paginate`
    )
    if (result.exitCode !== 0) return []
    try {
      const events = JSON.parse(result.stdout)
      // Filter to timeline-relevant events
      return events.filter((e: { event?: string }) =>
        ['committed', 'commented', 'head_ref_force_pushed', 'ready_for_review',
         'closed', 'merged', 'reopened', 'convert_to_draft', 'review_requested',
         'reviewed', 'labeled'].includes(e.event ?? '')
      )
    } catch {
      return []
    }
  }

  async markPRReady(repo: string, number: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `pr ready ${number} -R ${repo}`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] PR would be marked as ready')
  }

  /** Check if a PR branch is behind its base branch */
  async getPRBranchStatus(repo: string, number: number): Promise<{ behindBy: number; status: string }> {
    // Get the PR's head and base refs
    const prResult = await this.exec(
      `pr view ${number} -R ${repo} --json headRefName,baseRefName`
    )
    if (prResult.exitCode !== 0) return { behindBy: 0, status: 'unknown' }
    try {
      const pr = JSON.parse(prResult.stdout) as { headRefName: string; baseRefName: string }
      // Compare base...head to find how far behind the PR branch is
      const compareResult = await this.exec(
        `api repos/${repo}/compare/${pr.baseRefName}...${pr.headRefName} --jq .behind_by`
      )
      if (compareResult.exitCode !== 0) return { behindBy: 0, status: 'unknown' }
      const behindBy = parseInt(compareResult.stdout.trim(), 10)
      if (isNaN(behindBy)) return { behindBy: 0, status: 'unknown' }
      return { behindBy, status: behindBy > 0 ? 'behind' : 'up_to_date' }
    } catch {
      return { behindBy: 0, status: 'unknown' }
    }
  }

  /** Update a PR branch by merging the base branch into the head */
  async updatePRBranch(repo: string, number: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `api repos/${repo}/pulls/${number}/update-branch -X PUT`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] PR branch would be updated')
  }


  /** Approve a PR by submitting an APPROVE review */
  async approvePR(repo: string, number: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `pr review ${number} -R ${repo} --approve`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] PR would be approved')
  }

  async getPRDiff(repo: string, number: number): Promise<string> {
    const result = await this.exec(
      `pr diff ${number} -R ${repo}`
    )
    if (result.exitCode !== 0) return ''
    return result.stdout
  }

  async getMonthlyActivity(repo: string): Promise<unknown | null> {
    // Find the most recent Repo Assist Monthly Activity issue
    const result = await this.exec(
      `issue list -R ${repo} --json number,title,body,updatedAt --label repo-assist --search "[Repo Assist] Monthly Activity" --limit 1 --state open`
    )
    if (result.exitCode !== 0) return null
    try {
      const issues = JSON.parse(result.stdout)
      return issues.length > 0 ? issues[0] : null
    } catch {
      return null
    }
  }

  async getWorkflows(repo: string): Promise<unknown[]> {
    const result = await this.exec(
      `api repos/${repo}/actions/workflows --jq '.workflows[] | {id, name, path, state}' --paginate`
    )
    if (result.exitCode !== 0) return []
    try {
      const lines = result.stdout.trim().split('\n').filter(Boolean)
      return lines.map(line => JSON.parse(line))
    } catch {
      return []
    }
  }

  async enableWorkflow(repo: string, workflowId: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `workflow enable ${workflowId} -R ${repo}`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] Workflow would be enabled')
  }

  async disableWorkflow(repo: string, workflowId: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `workflow disable ${workflowId} -R ${repo}`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] Workflow would be disabled')
  }

  async getFileContent(repo: string, path: string): Promise<string | null> {
    const result = await this.exec(
      `api repos/${repo}/contents/${path} --jq .content`
    )
    if (result.exitCode !== 0 || !result.stdout.trim()) return null
    try {
      return Buffer.from(result.stdout.trim(), 'base64').toString('utf-8')
    } catch {
      return null
    }
  }

  async closeIssue(repo: string, number: number, reason: string, writeMode: boolean): Promise<GhExecResult> {
    const reasonFlag = reason === 'not_planned' ? '--reason "not planned"' : ''
    const command = `issue close ${number} -R ${repo} ${reasonFlag}`.trim()
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] Issue would be closed')
  }

  async cancelRun(repo: string, runId: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `run cancel ${runId} -R ${repo}`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] Run would be cancelled')
  }

  async rerunFailedJobs(repo: string, runId: number, writeMode: boolean): Promise<GhExecResult> {
    const command = `run rerun ${runId} -R ${repo} --failed`
    return this.execWriteOrDryRun(command, writeMode, '[DRY RUN] Failed jobs would be re-run')
  }

  async searchRepos(query: string): Promise<unknown[]> {
    // If the query looks like "owner/repo", try fetching it directly first (handles forks
    // which are excluded from GitHub search results)
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(query.trim())) {
      const direct = await this.exec(
        `api repos/${query.trim()} --jq '{fullName: .full_name, description: .description}'`
      )
      if (direct.exitCode === 0 && direct.stdout.trim()) {
        try {
          const repo = JSON.parse(direct.stdout) as { fullName: string; description: string }
          // Also run a search to supplement with related results
          const searchResult = await this.exec(
            `search repos "${query}" --json fullName,description,updatedAt --limit 9`
          )
          const searchRepos: { fullName: string; description: string }[] = searchResult.exitCode === 0
            ? JSON.parse(searchResult.stdout).map((r: { fullName: string; description: string }) => ({ fullName: r.fullName, description: r.description }))
            : []
          // Prepend exact match, deduplicating
          const rest = searchRepos.filter(r => r.fullName.toLowerCase() !== repo.fullName.toLowerCase())
          return [repo, ...rest]
        } catch { /* fall through to plain search */ }
      }
    }
    const result = await this.exec(
      `search repos "${query}" --json fullName,description,updatedAt --limit 10`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
    } catch {
      return []
    }
  }

  async getRecentRepos(): Promise<unknown[]> {
    // Use the user's events to find repos they've actually been active in
    // Don't use --paginate as it outputs multiple JSON arrays that can't be parsed
    const result = await this.exec(
      `api users/{owner}/events --jq '.[].repo.name'`
    )
    if (result.exitCode !== 0) return []
    try {
      // Deduplicate repo names from line-separated output
      const names = result.stdout.trim().split('\n').filter(Boolean)
      const unique = [...new Set(names)].slice(0, 15)
      // Fetch descriptions in parallel
      const repos = await Promise.all(
        unique.map(async fullName => {
          const info = await this.exec(`api repos/${fullName} --jq '{fullName: .full_name, description: .description}'`)
          if (info.exitCode !== 0) return { fullName, description: '' }
          try {
            return JSON.parse(info.stdout) as { fullName: string; description: string }
          } catch {
            return { fullName, description: '' }
          }
        })
      )
      return repos
    } catch {
      return []
    }
  }

  async getEvents(repo: string): Promise<unknown[]> {
    const result = await this.exec(
      `api repos/${repo}/events --jq '[.[] | {type, created_at, actor: .actor.login, payload_action: .payload.action}]'`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
    } catch {
      return []
    }
  }

  async addComment(repo: string, number: number, body: string, writeMode: boolean): Promise<GhExecResult> {
    if (!writeMode) {
      const command = `issue comment ${number} -R ${repo} --body "${body.substring(0, 50)}..."`
      return this.execWriteOrDryRun(command, false, '[DRY RUN] Comment would be added')
    }
    return this.exec(`issue comment ${number} -R ${repo} --body "${body}"`, 'write')
  }

  async mergePR(repo: string, number: number, writeMode: boolean, bypass: boolean = false): Promise<GhExecResult> {
    const adminFlag = bypass ? ' --admin' : ''
    const command = `pr merge ${number} -R ${repo}${adminFlag}`
    if (!writeMode) {
      return this.execWriteOrDryRun(command, false, '[DRY RUN] PR would be merged')
    }
    // Try merge without specifying strategy — gh will use the repo's default allowed method
    // If that fails (interactive prompt), try each strategy explicitly
    let result = await this.exec(command, 'write')
    if (result.exitCode !== 0) {
      for (const strategy of ['--merge', '--squash', '--rebase']) {
        result = await this.exec(`pr merge ${number} -R ${repo} ${strategy}${adminFlag}`, 'write')
        if (result.exitCode === 0) break
      }
    }
    return result
  }

  /** Get the authenticated user's permission level for a repo (admin, write, read, none) */
  async getRepoPermission(repo: string): Promise<string> {
    const result = await this.exec(
      `api repos/${repo} --jq '.permissions | if .admin then "admin" elif .maintain then "maintain" elif .push then "write" elif .triage then "triage" elif .pull then "read" else "none" end'`
    )
    if (result.exitCode !== 0) return 'unknown'
    return result.stdout.trim() || 'unknown'
  }

  /** Check if the gh-models extension is installed */
  async checkModelsExtension(): Promise<boolean> {
    return (await this.listExtensions()).includes('gh-models')
  }

  /** Install the gh-models extension */
  async installModelsExtension(): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('gh', ['extension', 'install', 'github/gh-models'], { timeout: 60000 })
      this.cachedExtensionList = null // invalidate cache after install
      return { success: true }
    } catch (err: unknown) {
      const error = err as { stderr?: string }
      return { success: false, error: error.stderr || String(err) }
    }
  }

  /** Check if the gh-aw extension is installed */
  async checkAwExtension(): Promise<boolean> {
    return (await this.listExtensions()).includes('gh-aw')
  }

  /** Install or upgrade the gh-aw extension */
  async ensureAwExtension(): Promise<{ success: boolean; error?: string }> {
    const installed = await this.checkAwExtension()
    if (installed) {
      try {
        await execFileAsync('gh', ['extension', 'upgrade', 'gh-aw'], { timeout: 60000 })
      } catch { /* ignore upgrade failures */ }
      this.cachedExtensionList = null // invalidate cache after upgrade
      return { success: true }
    }
    try {
      await execFileAsync('gh', ['extension', 'install', 'github/gh-aw'], { timeout: 60000 })
      this.cachedExtensionList = null // invalidate cache after install
      return { success: true }
    } catch (err: unknown) {
      const error = err as { stderr?: string }
      return { success: false, error: error.stderr || String(err) }
    }
  }

  /** Check if repo has repo-assist workflow files */
  async hasRepoAssistWorkflow(repo: string): Promise<boolean> {
    const md = await this.getFileContent(repo, '.github/workflows/repo-assist.md')
    if (md !== null) return true
    const lock = await this.getFileContent(repo, '.github/workflows/repo-assist.lock.yml')
    return lock !== null
  }

  // === AI Model ===

  /** Run an AI model via `gh models run`. Returns output text or throws. */
  async runAIModel(prompt: string): Promise<string> {
    const startedAt = new Date().toISOString()
    const start = Date.now()
    try {
      const { stdout, stderr } = await execFileAsync('gh', ['models', 'run', 'openai/gpt-4o-mini', prompt], {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      })
      const durationMs = Date.now() - start
      this.addToLog({
        command: 'gh models run openai/gpt-4o-mini <prompt>',
        startedAt,
        durationMs,
        exitCode: 0,
        mode: 'read',
      })
      // gh models run may output to stderr as well on some versions
      return (stdout || stderr || '').trim()
    } catch (err: unknown) {
      const durationMs = Date.now() - start
      const error = err as { stdout?: string; stderr?: string; code?: number }
      this.addToLog({
        command: 'gh models run openai/gpt-4o-mini <prompt>',
        startedAt,
        durationMs,
        exitCode: error.code ?? 1,
        mode: 'read',
        stderr: error.stderr,
      })
      // Extract meaningful error message
      const msg = error.stderr || String(err)
      if (msg.includes('rate limit') || msg.includes('429')) {
        throw new Error('Rate limit exceeded for GitHub Models. Please try again later.')
      }
      if (msg.includes('auth') || msg.includes('401') || msg.includes('403') || msg.includes('not found')) {
        throw new Error('GitHub Models authentication failed. Run `gh auth refresh` and ensure you have access to GitHub Models.')
      }
      throw new Error(`AI model error: ${msg.substring(0, 300)}`)
    }
  }

  /** Generate AI recap summary from recent activity across repos */
  async generateRecap(repos: string[], clearedState: Record<string, string>, sinceDate?: string): Promise<{ markdown: string }> {
    // Use sinceDate (from last clear) or default to 2 weeks ago
    const cutoff = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    // Phase 1: Gather automation items (single scan, filter locally for PTAL)
    const allAutomationItems = await this.scanPTAL(repos, {})
    const ptalItems = allAutomationItems.filter(item =>
      !clearedState[item.key] || clearedState[item.key] !== item.lastActivity.id
    )

    // Phase 2: Gather supplementary data in parallel across repos
    const supplementary = await Promise.all(repos.map(async repo => {
      const [merged, closed, newIssues] = await Promise.all([
        this.getRecentMergedPRs(repo, cutoff),
        this.getRecentClosedIssues(repo, cutoff),
        this.getRecentNewIssues(repo, cutoff),
      ])
      return { repo, merged, closed, newIssues }
    }))

    // Build categorised data for the prompt
    const sections: string[] = []

    // Filter automation items by cutoff date
    const cutoffAutomation = allAutomationItems.filter(item => new Date(item.lastActivity.when) >= cutoff)

    // Helper to make a GitHub link for an issue/PR number
    const ghLink = (repo: string, type: 'issue' | 'pr', num: number) => {
      const path = type === 'pr' ? 'pull' : 'issues'
      return `[#${num}](https://github.com/${repo}/${path}/${num})`
    }

    // Build reference map for post-processing enrichment
    const refMap = new Map<string, RefInfo>()
    for (const item of cutoffAutomation) {
      const pathType = item.type === 'pr' ? 'pull' : 'issues'
      refMap.set(`${item.repo}/${pathType}/${item.number}`, { title: item.title, state: 'open', type: item.type })
    }
    for (const { repo, merged, closed, newIssues } of supplementary) {
      for (const pr of merged) {
        refMap.set(`${repo}/pull/${pr.number}`, { title: pr.title, state: 'merged', type: 'pr' })
      }
      for (const issue of closed) {
        refMap.set(`${repo}/issues/${issue.number}`, { title: issue.title, state: 'closed', type: 'issue' })
      }
      for (const issue of newIssues) {
        refMap.set(`${repo}/issues/${issue.number}`, { title: issue.title, state: 'open', type: 'issue' })
      }
    }

    // Automation items (open, with attention status) — filtered by cutoff
    const automationLines: string[] = []
    for (const item of cutoffAutomation.slice(0, 25)) {
      const shortRepo = item.repo.split('/').pop() || item.repo
      const actName = item.lastActivity.automationName || item.lastActivity.actor
      const bodySnippet = item.lastActivity.body ? ` — ${item.lastActivity.body.substring(0, 120).replace(/\n/g, ' ')}` : ''
      const needsAttention = ptalItems.some(p => p.key === item.key) ? ' [NEEDS ATTENTION]' : ''
      automationLines.push(`- ${shortRepo} ${item.type} ${ghLink(item.repo, item.type, item.number)}: "${item.title}" (${item.lastActivity.type} by ${actName}${bodySnippet})${needsAttention}`)
    }
    if (automationLines.length > 0) {
      sections.push(`=== AUTOMATION ACTIVITY (open items with bot/agent involvement) ===\n${automationLines.join('\n')}`)
    }

    // Merged PRs
    const mergedLines: string[] = []
    for (const { repo, merged } of supplementary) {
      const shortRepo = repo.split('/').pop() || repo
      for (const pr of merged) {
        const bot = isAutomationActor(pr.author) ? ' [BOT]' : ''
        mergedLines.push(`- ${shortRepo} pr ${ghLink(repo, 'pr', pr.number)}: "${pr.title}" by ${pr.author}${bot}, merged ${pr.mergedAt.substring(0, 10)}`)
      }
    }
    if (mergedLines.length > 0) {
      sections.push(`=== RECENTLY MERGED PRs ===\n${mergedLines.join('\n')}`)
    }

    // Closed issues
    const closedLines: string[] = []
    for (const { repo, closed } of supplementary) {
      const shortRepo = repo.split('/').pop() || repo
      for (const issue of closed) {
        closedLines.push(`- ${shortRepo} issue ${ghLink(repo, 'issue', issue.number)}: "${issue.title}" by ${issue.author}, closed ${issue.closedAt.substring(0, 10)}`)
      }
    }
    if (closedLines.length > 0) {
      sections.push(`=== RECENTLY CLOSED ISSUES ===\n${closedLines.join('\n')}`)
    }

    // New issues by humans
    const newLines: string[] = []
    for (const { repo, newIssues } of supplementary) {
      const shortRepo = repo.split('/').pop() || repo
      for (const issue of newIssues) {
        newLines.push(`- ${shortRepo} issue ${ghLink(repo, 'issue', issue.number)}: "${issue.title}" by ${issue.author}, opened ${issue.createdAt.substring(0, 10)}`)
      }
    }
    if (newLines.length > 0) {
      sections.push(`=== NEW ISSUES (opened by humans) ===\n${newLines.join('\n')}`)
    }

    if (sections.length === 0) {
      const today = new Date().toISOString().substring(0, 10)
      const sinceLabel = cutoff.toISOString().substring(0, 10)
      const singleRepo = repos.length === 1
      const repoLabel = singleRepo
        ? (repos[0].split('/').pop() || repos[0])
        : 'your repositories'
      const quietMessages = [
        `🌊 All quiet across ${repoLabel} — nothing new to report since ${sinceLabel}. Enjoy the calm!`,
        `☀️ Clear skies over ${repoLabel} — no new activity since ${sinceLabel}. A peaceful stretch!`,
        `🍃 Nothing stirring in ${repoLabel} since ${sinceLabel}. A well-earned breather.`,
        `🧘 ${repoLabel.charAt(0).toUpperCase() + repoLabel.slice(1)} ${singleRepo ? 'is' : 'are'} resting easy — zero new activity since ${sinceLabel}.`,
        `🌙 Quiet times for ${repoLabel} since ${sinceLabel}. Nothing needs your attention right now.`,
      ]
      const msg = quietMessages[Math.floor(Math.random() * quietMessages.length)]
      return { markdown: `## Recap: ${sinceLabel} – ${today}\n\n${msg}` }
    }

    const repoNames = repos.map(r => r.split('/').pop()).join(', ')
    const singleRepo = repos.length === 1
    const today = new Date().toISOString().substring(0, 10)
    const sinceLabel = cutoff.toISOString().substring(0, 10)
    const username = await this.getUsername()

    const prompt = `You are writing a brief chronicle of what's been happening ${singleRepo ? 'in the GitHub repository' : 'across these GitHub repositories'}: ${repoNames}. This is for the maintainer @${username}. Today is ${today}. This recap covers roughly ${sinceLabel} to ${today}.

Write in markdown (do NOT wrap in code fences). Use ## headings to break the recap into natural sections. Write in a narrative voice — concise but with texture, like a weekly digest or changelog. Use the occasional emoji sparingly. Reference repos by their short name (e.g. "Deedle" not "fslaborg/Deedle").

IMPORTANT RULES:
- The data below contains markdown links like [#310](https://github.com/...). PRESERVE these links exactly as given — do not strip or rewrite them. Use them in your output.
- If a category has NO data, SKIP IT ENTIRELY. Do not write a section for it.
- If very little happened overall, just say so in one or two lines after the date heading. Don't pad it out.
- Only write sections for categories that actually have items in the data below.
- Items marked [NEEDS ATTENTION] haven't been acknowledged by the maintainer — call these out clearly.

Possible sections (only include if data exists):
- PRs merged — celebrate progress
- Issues closed or resolved
- New issues from contributors
- Automation activity (bots, Repo Assist, CI)
- Items awaiting the maintainer's attention

At the very top, state the period: e.g. "Recap: Mar 1 – Mar 15, 2026" in a ## heading.
Keep the whole thing concise — aim for brevity, not a wall of text.

Activity data:
${sections.join('\n\n')}`

    let output = await this.runAIModel(prompt)
    output = stripCodeFences(output)
    output = enrichIssueRefs(output, refMap)
    return { markdown: output }
  }

  /** Get recently merged PRs since cutoff */
  private async getRecentMergedPRs(repo: string, cutoff: Date): Promise<{ number: number; title: string; author: string; mergedAt: string }[]> {
    const result = await this.exec(
      `pr list -R ${repo} --state merged --json number,title,author,mergedAt --limit 15`
    )
    if (result.exitCode !== 0) return []
    try {
      const prs = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; mergedAt: string }[]
      return prs
        .filter(pr => pr.mergedAt && new Date(pr.mergedAt) > cutoff)
        .map(pr => ({ number: pr.number, title: pr.title, author: pr.author?.login ?? 'unknown', mergedAt: pr.mergedAt }))
    } catch {
      return []
    }
  }

  /** Get recently closed issues since cutoff */
  private async getRecentClosedIssues(repo: string, cutoff: Date): Promise<{ number: number; title: string; author: string; closedAt: string }[]> {
    const result = await this.exec(
      `issue list -R ${repo} --state closed --json number,title,author,closedAt --limit 15 --sort updated`
    )
    if (result.exitCode !== 0) return []
    try {
      const issues = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; closedAt: string }[]
      return issues
        .filter(i => i.closedAt && new Date(i.closedAt) > cutoff)
        .map(i => ({ number: i.number, title: i.title, author: i.author?.login ?? 'unknown', closedAt: i.closedAt }))
    } catch {
      return []
    }
  }

  /** Get recently opened issues by non-bot authors since cutoff */
  private async getRecentNewIssues(repo: string, cutoff: Date): Promise<{ number: number; title: string; author: string; createdAt: string }[]> {
    const result = await this.exec(
      `issue list -R ${repo} --state open --json number,title,author,createdAt --limit 30`
    )
    if (result.exitCode !== 0) return []
    try {
      const issues = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; createdAt: string }[]
      return issues
        .filter(i => new Date(i.createdAt) > cutoff && !isAutomationActor(i.author?.login ?? ''))
        .map(i => ({ number: i.number, title: i.title, author: i.author?.login ?? 'unknown', createdAt: i.createdAt }))
    } catch {
      return []
    }
  }

  /** Execute a write command or log it as a dry-run when writeMode is false. */
  private execWriteOrDryRun(command: string, writeMode: boolean, dryRunMessage: string): Promise<GhExecResult> {
    if (!writeMode) {
      this.addToLog({
        command: `gh ${command}`,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: 0,
        mode: 'dry-run'
      })
      return Promise.resolve({ stdout: dryRunMessage, stderr: '', exitCode: 0, command: `gh ${command}`, durationMs: 0 })
    }
    return this.exec(command, 'write')
  }

  /** Return the cached output of `gh extension list`, fetching it once per session. */
  private async listExtensions(): Promise<string> {
    if (this.cachedExtensionList !== null) return this.cachedExtensionList
    try {
      const { stdout } = await execFileAsync('gh', ['extension', 'list'], { timeout: 10000 })
      this.cachedExtensionList = stdout
    } catch {
      this.cachedExtensionList = ''
    }
    return this.cachedExtensionList
  }

  getCommandLog(): CommandLogEntry[] {
    return [...this.commandLog]
  }

  // === GraphQL ===

  /** Execute a GraphQL query via `gh api graphql` */
  async graphqlExec(query: string, variables: Record<string, string>): Promise<{ data: unknown; errors?: unknown[] }> {
    const args = ['api', 'graphql', '-f', `query=${query}`]
    for (const [key, val] of Object.entries(variables)) {
      args.push('-F', `${key}=${val}`)
    }
    const startedAt = new Date().toISOString()
    const start = Date.now()
    try {
      const { stdout } = await execFileAsync('gh', args, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      })
      const durationMs = Date.now() - start
      this.addToLog({
        command: `gh api graphql (${Object.values(variables).join(', ')})`,
        startedAt,
        durationMs,
        exitCode: 0,
        mode: 'read',
      })
      return JSON.parse(stdout)
    } catch (err: unknown) {
      const durationMs = Date.now() - start
      const error = err as { stdout?: string; stderr?: string; code?: number }
      this.addToLog({
        command: `gh api graphql (${Object.values(variables).join(', ')})`,
        startedAt,
        durationMs,
        exitCode: error.code ?? 1,
        mode: 'read',
        stderr: error.stderr,
      })
      throw err
    }
  }

  // === PTAL (Please Take a Look) ===

  /** Scan repos for open issues/PRs where the last activity was by an automation */
  async scanPTAL(repos: string[], clearedState: Record<string, string>): Promise<PTALItem[]> {
    const allItems: PTALItem[] = []
    for (const repo of repos) {
      try {
        const items = await this.scanRepoPTAL(repo, clearedState)
        allItems.push(...items)
      } catch {
        // Skip repos that fail (permissions, etc)
      }
    }
    // Sort by most recent activity first
    allItems.sort((a, b) => new Date(b.lastActivity.when).getTime() - new Date(a.lastActivity.when).getTime())
    return allItems
  }

  private async scanRepoPTAL(repo: string, clearedState: Record<string, string>): Promise<PTALItem[]> {
    const [owner, name] = repo.split('/')
    if (!owner || !name) return []

    const items: PTALItem[] = []

    // Fetch issues (paginated, up to 500 to be practical)
    let issueCursor: string | null = null
    for (let page = 0; page < 5; page++) {
      const result = await this.graphqlExec(PTAL_ISSUES_QUERY, {
        owner,
        name,
        ...(issueCursor ? { cursor: issueCursor } : {}),
      })
      const data = result.data as { repository?: { issues?: GraphQLConnection<GraphQLIssueNode> } }
      const issues = data?.repository?.issues
      if (!issues?.nodes) break

      for (const issue of issues.nodes) {
        const item = this.evaluateIssuePTAL(repo, issue, clearedState)
        if (item) items.push(item)
      }

      if (!issues.pageInfo.hasNextPage) break
      issueCursor = issues.pageInfo.endCursor
    }

    // Fetch PRs (single page, < 50 expected)
    const prResult = await this.graphqlExec(PTAL_PRS_QUERY, { owner, name })
    const prData = prResult.data as { repository?: { pullRequests?: GraphQLConnection<GraphQLPRNode> } }
    const prs = prData?.repository?.pullRequests
    if (prs?.nodes) {
      for (const pr of prs.nodes) {
        const item = this.evaluatePRPTAL(repo, pr, clearedState)
        if (item) items.push(item)
      }
    }

    return items
  }

  private evaluateIssuePTAL(repo: string, issue: GraphQLIssueNode, clearedState: Record<string, string>): PTALItem | null {
    const lastComment = issue.comments.nodes[0] ?? null
    // Determine last activity
    let activity: PTALItem['lastActivity']
    if (lastComment) {
      const actor = lastComment.author?.login ?? ''
      if (!isAutomationActor(actor)) return null
      activity = {
        id: lastComment.id,
        actor,
        automationName: extractAutomationName(lastComment.body ?? ''),
        type: 'comment',
        when: lastComment.createdAt,
        body: (lastComment.body ?? '').substring(0, 200),
      }
    } else {
      // No comments — only PTAL if the issue was created by automation
      const actor = issue.author?.login ?? ''
      if (!isAutomationActor(actor)) return null
      activity = {
        id: `created:${issue.createdAt}`,
        actor,
        automationName: extractAutomationName(issue.body ?? ''),
        type: 'created',
        when: issue.createdAt,
        body: (issue.body ?? '').substring(0, 200),
      }
    }

    const key = `${repo}#${issue.number}`
    // Check if cleared for this specific activity
    if (clearedState[key] === activity.id) return null

    return {
      key,
      repo,
      type: 'issue',
      number: issue.number,
      title: issue.title,
      author: issue.author?.login ?? 'unknown',
      lastActivity: activity,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }
  }

  private evaluatePRPTAL(repo: string, pr: GraphQLPRNode, clearedState: Record<string, string>): PTALItem | null {
    const lastComment = pr.comments.nodes[0] ?? null
    const lastCommit = pr.commits.nodes[0]?.commit ?? null

    // Find the most recent bot activity among: creation, last comment, last commit
    const candidates: PTALItem['lastActivity'][] = []

    // Check creation
    const creationActor = pr.author?.login ?? ''
    if (isAutomationActor(creationActor)) {
      candidates.push({
        id: `created:${pr.createdAt}`,
        actor: creationActor,
        automationName: extractAutomationName(pr.body ?? ''),
        type: 'created',
        when: pr.createdAt,
        body: (pr.body ?? '').substring(0, 200),
      })
    }

    // Check last comment
    if (lastComment) {
      const actor = lastComment.author?.login ?? ''
      if (isAutomationActor(actor)) {
        candidates.push({
          id: lastComment.id,
          actor,
          automationName: extractAutomationName(lastComment.body ?? ''),
          type: 'comment',
          when: lastComment.createdAt,
          body: (lastComment.body ?? '').substring(0, 200),
        })
      }
    }

    // Check last commit
    if (lastCommit) {
      const actor = lastCommit.author?.user?.login ?? ''
      if (isAutomationActor(actor)) {
        candidates.push({
          id: lastCommit.oid,
          actor,
          automationName: null,
          type: 'commit',
          when: lastCommit.committedDate,
          body: lastCommit.message.substring(0, 200),
        })
      }
    }

    if (candidates.length === 0) return null

    // Find the latest activity across all sources
    const latestBotActivity = candidates.reduce((a, b) =>
      new Date(a.when).getTime() >= new Date(b.when).getTime() ? a : b
    )

    // But check: was there a NON-bot activity more recent?
    // If last comment was by a human (after latest bot activity), skip
    if (lastComment && !isAutomationActor(lastComment.author?.login ?? '')) {
      if (new Date(lastComment.createdAt).getTime() > new Date(latestBotActivity.when).getTime()) {
        return null
      }
    }
    // Same for commit: human commit after bot activity
    if (lastCommit && !isAutomationActor(lastCommit.author?.user?.login ?? '')) {
      if (new Date(lastCommit.committedDate).getTime() > new Date(latestBotActivity.when).getTime()) {
        return null
      }
    }

    const key = `${repo}#${pr.number}`
    if (clearedState[key] === latestBotActivity.id) return null

    return {
      key,
      repo,
      type: 'pr',
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? 'unknown',
      lastActivity: latestBotActivity,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    }
  }

  private addToLog(entry: CommandLogEntry): void {
    this.commandLog.push(entry)
    if (this.commandLog.length > this.maxLogEntries) {
      this.commandLog = this.commandLog.slice(-this.maxLogEntries)
    }
  }
}

/** Parse a gh subcommand string into args array. Does NOT use a shell. */
export function parseGhArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuote: string | null = null

  for (const ch of command) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    } else if (ch === ' ') {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}

// === PTAL helpers ===

/** Check if a login looks like an automation / bot */
export function isAutomationActor(login: string): boolean {
  if (!login) return false
  return login === 'github-actions' || login === 'github-actions[bot]' ||
    login === 'app/github-actions' || login.endsWith('[bot]')
}

/** Strip wrapping code fences (```markdown ... ```) from AI output */
export function stripCodeFences(text: string): string {
  let s = text.trim()
  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n')
    if (firstNewline !== -1) s = s.substring(firstNewline + 1)
  }
  if (s.endsWith('```')) {
    s = s.substring(0, s.length - 3)
  }
  return s.trim()
}

/** Inline SVG icons for issue/PR references (GitHub octicons, 16px) */
const GH_REF_ICONS: Record<string, string> = {
  'issue-open': '<svg class="gh-ref-icon" viewBox="0 0 16 16" width="16" height="16"><path fill="#3fb950" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="#3fb950" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>',
  'issue-closed': '<svg class="gh-ref-icon" viewBox="0 0 16 16" width="16" height="16"><path fill="#a371f7" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/><path fill="#a371f7" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"/></svg>',
  'pr-open': '<svg class="gh-ref-icon" viewBox="0 0 16 16" width="16" height="16"><path fill="#3fb950" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>',
  'pr-merged': '<svg class="gh-ref-icon" viewBox="0 0 16 16" width="16" height="16"><path fill="#a371f7" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>',
  'pr-closed': '<svg class="gh-ref-icon" viewBox="0 0 16 16" width="16" height="16"><path fill="#f85149" d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type RefInfo = { title: string; state: 'open' | 'closed' | 'merged'; type: 'issue' | 'pr' }

/** Replace markdown issue/PR links with enriched HTML containing status icons and titles */
function enrichIssueRefs(
  markdown: string,
  refMap: Map<string, RefInfo>
): string {
  return markdown.replace(
    /\[#(\d+)\]\(https:\/\/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)\)/g,
    (match, _num: string, ownerRepo: string, pathType: string, numStr: string) => {
      const key = `${ownerRepo}/${pathType}/${numStr}`
      const info = refMap.get(key)
      if (!info) return match // No data — keep original link

      const url = `https://github.com/${ownerRepo}/${pathType}/${numStr}`
      const cssClass = info.type === 'issue'
        ? (info.state === 'closed' ? 'issue-closed' : 'issue-open')
        : (info.state === 'merged' ? 'pr-merged' : info.state === 'closed' ? 'pr-closed' : 'pr-open')
      const icon = GH_REF_ICONS[cssClass] || ''
      const title = escapeHtml(info.title.length > 60 ? info.title.substring(0, 57) + '…' : info.title)

      return `<a href="${url}" class="gh-ref ${cssClass}">${icon} #${numStr} — ${title}</a>`
    }
  )
}

/** Extract automation name from "Generated by [Name](url)" pattern */
export function extractAutomationName(text: string): string | null {
  if (!text) return null
  const match = text.match(/Generated by \[([^\]]+)\]\(([^)]+)\)/)
  if (match) return match[1]
  const commentMatch = text.match(/gh-aw-agentic-workflow:\s*([^,]+),/)
  if (commentMatch) return commentMatch[1].trim()
  return null
}

// GraphQL query types
interface GraphQLConnection<T> {
  nodes: T[]
  pageInfo: { hasNextPage: boolean; endCursor: string }
}

interface GraphQLIssueNode {
  number: number
  title: string
  body: string
  author: { login: string } | null
  createdAt: string
  updatedAt: string
  comments: { nodes: { id: string; author: { login: string } | null; body: string; createdAt: string }[] }
}

interface GraphQLPRNode extends GraphQLIssueNode {
  commits: { nodes: { commit: { oid: string; message: string; author: { user: { login: string } | null } | null; committedDate: string } }[] }
}

const PTAL_ISSUES_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        body
        author { login }
        createdAt
        updatedAt
        comments(last: 1) {
          nodes {
            id
            author { login }
            body
            createdAt
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const PTAL_PRS_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        body
        author { login }
        createdAt
        updatedAt
        comments(last: 1) {
          nodes {
            id
            author { login }
            body
            createdAt
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              oid
              message
              author { user { login } }
              committedDate
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`
