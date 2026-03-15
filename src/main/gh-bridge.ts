import { execFile } from 'child_process'
import { promisify } from 'util'

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
    const result = await this.exec(
      `api user/repos --jq '[.[] | {fullName: .full_name, description: .description, updatedAt: .updated_at}] | sort_by(.updatedAt) | reverse | .[:10]'`
    )
    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout)
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

  getCommandLog(): CommandLogEntry[] {
    return [...this.commandLog]
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
