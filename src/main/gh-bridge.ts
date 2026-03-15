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

// Default repo list — will be overridden by .repo-assist config
const DEFAULT_REPOS = [
  'fslaborg/Deedle',
  'fsprojects/FSharp.Formatting',
  'fsprojects/FSharp.Data',
  'fsprojects/FSharp.Control.TaskSeq'
]

export class GhBridge {
  private commandLog: CommandLogEntry[] = []
  private maxLogEntries = 500

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
    // Try to load from user's .repo-assist GitHub repo
    try {
      const result = await this.exec(
        'api repos/{owner}/.repo-assist/contents/config.json --jq .content'
      )
      if (result.exitCode === 0 && result.stdout.trim()) {
        const decoded = Buffer.from(result.stdout.trim(), 'base64').toString('utf-8')
        const config = JSON.parse(decoded)
        if (Array.isArray(config.repositories)) {
          return config.repositories
        }
      }
    } catch {
      // Fall through to defaults
    }
    return DEFAULT_REPOS
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
      `pr list -R ${repo} --json number,title,author,state,isDraft,reviewDecision,statusCheckRollup,createdAt,updatedAt,labels,headRefName --limit 50 --state open`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
    } catch {
      return []
    }
  }

  async getRuns(repo: string): Promise<unknown[]> {
    const result = await this.exec(
      `run list -R ${repo} --json databaseId,displayTitle,status,conclusion,event,createdAt,updatedAt,workflowName --limit 30`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
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
      `pr view ${number} -R ${repo} --json number,title,body,comments,reviews,files,additions,deletions,statusCheckRollup,state,isDraft,reviewDecision,labels,author,createdAt,updatedAt,headRefName,commits`
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
    if (!writeMode) {
      this.addToLog({
        command: `gh ${command}`,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: 0,
        mode: 'dry-run'
      })
      return { stdout: '[DRY RUN] PR would be marked as ready', stderr: '', exitCode: 0, command: `gh ${command}`, durationMs: 0 }
    }
    return this.exec(command, 'write')
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
    if (!writeMode) {
      this.addToLog({
        command: `gh ${command}`,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: 0,
        mode: 'dry-run'
      })
      return { stdout: '[DRY RUN] Issue would be closed', stderr: '', exitCode: 0, command: `gh ${command}`, durationMs: 0 }
    }
    return this.exec(command, 'write')
  }

  async searchRepos(query: string): Promise<unknown[]> {
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
      // Dry-run: log but don't execute
      const command = `issue comment ${number} -R ${repo} --body "${body.substring(0, 50)}..."`
      this.addToLog({
        command: `gh ${command}`,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: 0,
        mode: 'dry-run'
      })
      return { stdout: '[DRY RUN] Comment would be added', stderr: '', exitCode: 0, command: `gh ${command}`, durationMs: 0 }
    }
    return this.exec(`issue comment ${number} -R ${repo} --body "${body}"`, 'write')
  }

  async mergePR(repo: string, number: number, writeMode: boolean): Promise<GhExecResult> {
    if (!writeMode) {
      const command = `pr merge ${number} -R ${repo} --squash`
      this.addToLog({
        command: `gh ${command}`,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        exitCode: 0,
        mode: 'dry-run'
      })
      return { stdout: '[DRY RUN] PR would be merged', stderr: '', exitCode: 0, command: `gh ${command}`, durationMs: 0 }
    }
    return this.exec(`pr merge ${number} -R ${repo} --squash`, 'write')
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
  async generateRecap(repos: string[], clearedState: Record<string, string>): Promise<{ markdown: string }> {
    // Phase 1: Gather automation items (single scan, filter locally for PTAL)
    const allAutomationItems = await this.scanPTAL(repos, {})
    const ptalItems = allAutomationItems.filter(item =>
      !clearedState[item.key] || clearedState[item.key] !== item.lastActivity.id
    )

    // Phase 2: Gather supplementary data in parallel across repos
    const supplementary = await Promise.all(repos.map(async repo => {
      const [merged, closed, newIssues] = await Promise.all([
        this.getRecentMergedPRs(repo),
        this.getRecentClosedIssues(repo),
        this.getRecentNewIssues(repo),
      ])
      return { repo, merged, closed, newIssues }
    }))

    // Build categorised data for the prompt
    const sections: string[] = []

    // Helper to make a GitHub link for an issue/PR number
    const ghLink = (repo: string, type: 'issue' | 'pr', num: number) => {
      const path = type === 'pr' ? 'pull' : 'issues'
      return `[#${num}](https://github.com/${repo}/${path}/${num})`
    }

    // Automation items (open, with attention status)
    const automationLines: string[] = []
    for (const item of allAutomationItems.slice(0, 25)) {
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
      return { markdown: 'All quiet across your repositories — nothing to report. \u{1F30A}' }
    }

    const repoNames = repos.map(r => r.split('/').pop()).join(', ')
    const singleRepo = repos.length === 1
    const today = new Date().toISOString().substring(0, 10)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)

    const prompt = `You are writing a brief chronicle of what's been happening ${singleRepo ? 'in the GitHub repository' : 'across these GitHub repositories'}: ${repoNames}. This is for a busy open-source maintainer. Today is ${today}. This recap covers roughly ${twoWeeksAgo} to ${today}.

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
    return { markdown: output }
  }

  /** Get recently merged PRs (last 2 weeks) */
  private async getRecentMergedPRs(repo: string): Promise<{ number: number; title: string; author: string; mergedAt: string }[]> {
    const result = await this.exec(
      `pr list -R ${repo} --state merged --json number,title,author,mergedAt --limit 15`
    )
    if (result.exitCode !== 0) return []
    try {
      const prs = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; mergedAt: string }[]
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      return prs
        .filter(pr => pr.mergedAt && new Date(pr.mergedAt) > cutoff)
        .map(pr => ({ number: pr.number, title: pr.title, author: pr.author?.login ?? 'unknown', mergedAt: pr.mergedAt }))
    } catch {
      return []
    }
  }

  /** Get recently closed issues (last 2 weeks) */
  private async getRecentClosedIssues(repo: string): Promise<{ number: number; title: string; author: string; closedAt: string }[]> {
    const result = await this.exec(
      `issue list -R ${repo} --state closed --json number,title,author,closedAt --limit 15 --sort updated`
    )
    if (result.exitCode !== 0) return []
    try {
      const issues = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; closedAt: string }[]
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      return issues
        .filter(i => i.closedAt && new Date(i.closedAt) > cutoff)
        .map(i => ({ number: i.number, title: i.title, author: i.author?.login ?? 'unknown', closedAt: i.closedAt }))
    } catch {
      return []
    }
  }

  /** Get recently opened issues by non-bot authors (last 2 weeks) */
  private async getRecentNewIssues(repo: string): Promise<{ number: number; title: string; author: string; createdAt: string }[]> {
    const result = await this.exec(
      `issue list -R ${repo} --state open --json number,title,author,createdAt --limit 30`
    )
    if (result.exitCode !== 0) return []
    try {
      const issues = JSON.parse(result.stdout) as { number: number; title: string; author: { login: string }; createdAt: string }[]
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      return issues
        .filter(i => new Date(i.createdAt) > cutoff && !isAutomationActor(i.author?.login ?? ''))
        .map(i => ({ number: i.number, title: i.title, author: i.author?.login ?? 'unknown', createdAt: i.createdAt }))
    } catch {
      return []
    }
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
function parseGhArgs(command: string): string[] {
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
function isAutomationActor(login: string): boolean {
  if (!login) return false
  return login === 'github-actions' || login === 'github-actions[bot]' ||
    login === 'app/github-actions' || login.endsWith('[bot]')
}

/** Strip wrapping code fences (```markdown ... ```) from AI output */
function stripCodeFences(text: string): string {
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

/** Extract automation name from "Generated by [Name](url)" pattern */
function extractAutomationName(text: string): string | null {
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
