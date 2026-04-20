import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execSync, spawn, execFileSync } from 'child_process'
import { GhBridge } from './gh-bridge'
import { LocalState } from './local-state'

// Logging helper — writes to stdout so it shows up in the terminal for `npm run dev`
function log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const ts = new Date().toISOString().substring(11, 23)
  const prefix = `[${ts}] [${level.toUpperCase()}]`
  if (level === 'error') {
    console.error(prefix, ...args)
  } else if (level === 'warn') {
    console.warn(prefix, ...args)
  } else {
    console.log(prefix, ...args)
  }
}

// Catch uncaught exceptions and unhandled rejections in main process
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception:', err.message, '\n', err.stack)
})
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection:', reason)
})

// WSL2 compatibility: disable sandbox if running under WSLg
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null
const ghBridge = new GhBridge()
const localState = new LocalState()

/** Detect if running in WSL */
function isWSL(): boolean {
  try {
    const release = require('fs').readFileSync('/proc/version', 'utf8')
    return /microsoft|wsl/i.test(release)
  } catch {
    return false
  }
}

/** Open a URL in the host Windows browser when running in WSL */
function openExternalURL(url: string): void {
  if (isWSL()) {
    try {
      execSync(`cmd.exe /c start "" "${url.replace(/&/g, '^&')}"`, { stdio: 'ignore' })
      return
    } catch { /* fall through */ }
  }
  shell.openExternal(url)
}

/** Find an available terminal emulator on the system */
function findTerminal(): string | null {
  for (const term of ['x-terminal-emulator', 'xterm', 'gnome-terminal']) {
    try {
      execFileSync('which', [term], { stdio: 'pipe' })
      return term
    } catch { /* not found */ }
  }
  return null
}

/** Open a command in a new interactive terminal window */
function openInteractiveShell(command: string): void {
  const scriptPath = path.join(os.tmpdir(), `ra-shell-${Date.now()}.sh`)
  fs.writeFileSync(scriptPath, `#!/bin/bash\n${command}\necho\nread -p 'Press Enter to close...'\n`, { mode: 0o755 })

  if (isWSL()) {
    const distro = process.env.WSL_DISTRO_NAME
    const wslArgs = distro ? ['wsl', '-d', distro, 'bash', scriptPath] : ['wsl', 'bash', scriptPath]
    const child = spawn('wt.exe', ['-d', '.', '--', ...wslArgs], {
      detached: true,
      stdio: 'ignore',
    })
    child.on('error', () => {
      spawn('cmd.exe', ['/c', 'start', '', ...wslArgs], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    })
    child.unref()
    return
  }

  const term = findTerminal()
  if (!term) return
  if (term === 'gnome-terminal') {
    spawn(term, ['--', 'bash', scriptPath], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn(term, ['-e', 'bash', scriptPath], { detached: true, stdio: 'ignore' }).unref()
  }
}

function createWindow(): void {
  // Remove the menu bar entirely
  Menu.setApplicationMenu(null)

  // Load persisted zoom factor
  const savedZoom = (localState.getSettings().zoomFactor as number) || 1.1

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '🌈 Repo Assist',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: savedZoom
    }
  })

  // In dev, load from Vite dev server; in prod, load the built HTML
  if (process.env.NODE_ENV === 'development') {
    log('info', 'Loading dev server at http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173/src/renderer/index.html')
    // Open DevTools in dev for easier debugging
    mainWindow.webContents.openDevTools({ mode: 'bottom' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Log renderer crashes
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('error', 'Renderer process gone:', details.reason, details.exitCode)
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log('error', 'Page failed to load:', errorCode, errorDescription)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external links in the host Windows browser (WSL) or default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalURL(url)
    return { action: 'deny' }
  })

  // Keyboard shortcuts for zoom
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (!mainWindow) return
    const wc = mainWindow.webContents
    if ((input.control || input.meta) && input.type === 'keyDown') {
      if (input.key === '=' || input.key === '+') {
        const newZoom = Math.min(wc.getZoomFactor() + 0.1, 3.0)
        wc.setZoomFactor(newZoom)
        localState.setSetting('zoomFactor', newZoom)
      } else if (input.key === '-') {
        const newZoom = Math.max(wc.getZoomFactor() - 0.1, 0.5)
        wc.setZoomFactor(newZoom)
        localState.setSetting('zoomFactor', newZoom)
      } else if (input.key === '0') {
        wc.setZoomFactor(1.1)
        localState.setSetting('zoomFactor', 1.1)
      }
    }
  })
}

app.whenReady().then(() => {
  log('info', 'Repo Assist starting up')
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// === IPC Handlers === //
// Wrapper that logs IPC errors to the terminal
function ipcHandle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(...args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      log('error', `IPC ${channel} failed:`, msg)
      if (stack) log('error', stack)
      throw err  // Re-throw so the renderer sees the error
    }
  })
}

// gh CLI bridge
ipcHandle('gh:exec', async (command: unknown) => {
  return ghBridge.exec(command as string)
})

ipcHandle('gh:checkModelsExtension', async () => {
  return ghBridge.checkModelsExtension()
})

ipcHandle('gh:installModelsExtension', async () => {
  return ghBridge.installModelsExtension()
})

ipcHandle('gh:getRepos', async () => {
  const pref = localState.getRepoStoragePreference()
  if (pref === 'remote') {
    // Remote mode: fetch from .repo-assist-app, fall back to local
    const remoteRepos = await ghBridge.getConfiguredRepos()
    if (remoteRepos.length > 0) {
      // Keep local in sync so add/remove have a current baseline
      localState.setLocalRepos(remoteRepos)
      return remoteRepos
    }
  }
  // Local mode or remote returned nothing: use local repos
  // Seed defaults on first run if empty
  localState.seedDefaultReposIfEmpty()
  return localState.getCustomRepos()
})

ipcHandle('app:getRepoStorageStatus', async () => {
  const preference = localState.getRepoStoragePreference()
  if (preference !== null) {
    return { preference, remoteExists: preference === 'remote' }
  }
  // Never asked — check if .repo-assist-app already exists
  const remoteExists = await ghBridge.checkRepoAssistAppExists()
  if (remoteExists) {
    // Auto-set to remote since the repo already exists
    localState.setRepoStoragePreference('remote')
    return { preference: 'remote' as const, remoteExists: true }
  }
  return { preference: null, remoteExists: false }
})

ipcHandle('app:setRepoStoragePreference', async (pref: unknown) => {
  const preference = pref as 'remote' | 'local'
  if (preference === 'remote') {
    // Create the repo and upload current local repos
    const created = await ghBridge.createRepoAssistApp()
    if (!created) throw new Error('Failed to create .repo-assist-app repository')
    // Seed defaults if empty, then upload
    localState.seedDefaultReposIfEmpty()
    const localRepos = localState.getCustomRepos()
    await ghBridge.saveRemoteRepoList(localRepos)
  }
  localState.setRepoStoragePreference(preference)
  // Seed defaults if local and empty
  localState.seedDefaultReposIfEmpty()
  return localState.getCustomRepos()
})

ipcHandle('gh:getIssues', async (repo: unknown) => {
  return ghBridge.getIssues(repo as string)
})

ipcHandle('gh:getPRs', async (repo: unknown) => {
  return ghBridge.getPRs(repo as string)
})

ipcHandle('gh:getRuns', async (repo: unknown) => {
  return ghBridge.getRuns(repo as string)
})

ipcHandle('gh:getWorkflows', async (repo: unknown) => {
  return ghBridge.getWorkflows(repo as string)
})

ipcHandle('gh:enableWorkflow', async (repo: unknown, workflowId: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.enableWorkflow(repo as string, workflowId as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Enable workflow failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:disableWorkflow', async (repo: unknown, workflowId: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.disableWorkflow(repo as string, workflowId as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Disable workflow failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:getFileContent', async (repo: unknown, filePath: unknown) => {
  return ghBridge.getFileContent(repo as string, filePath as string)
})

ipcHandle('gh:closeIssue', async (repo: unknown, number: unknown, reason: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.closeIssue(repo as string, number as number, reason as string, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Close failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:cancelRun', async (repo: unknown, runId: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.cancelRun(repo as string, runId as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Cancel failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:rerunFailedJobs', async (repo: unknown, runId: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.rerunFailedJobs(repo as string, runId as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Rerun failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:getRepoPermission', async (repo: unknown) => {
  return ghBridge.getRepoPermission(repo as string)
})

ipcHandle('gh:getViewerLogin', async () => {
  return ghBridge.getUsername()
})

ipcMain.handle('gh:applyPatchPR', async (_event, issueRepo: string, targetRepo: string, commands: string[]) => {
  log('info', `applyPatchPR called: issueRepo=${issueRepo}, targetRepo=${targetRepo}, commands=${JSON.stringify(commands)}`)

  // Validate repo formats
  const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
  if (!repoPattern.test(issueRepo) || !repoPattern.test(targetRepo)) {
    log('warn', `applyPatchPR: repo format validation failed — issueRepo="${issueRepo}", targetRepo="${targetRepo}"`)
    return
  }
  if (!Array.isArray(commands) || commands.length === 0) {
    log('warn', 'applyPatchPR: commands is empty or not an array')
    return
  }

  // Validate each command is a known safe pattern
  for (const cmd of commands) {
    const stripped = cmd.replace(/'[^']*'/g, 'Q').replace(/"[^"]*"/g, 'Q')
    if (/[`$;|&<>\\(){}\n\r]/.test(stripped)) {
      const badChar = stripped.match(/[`$;|&<>\\(){}\n\r]/)
      log('warn', `applyPatchPR: unsafe char "${badChar?.[0]}" in command after quote-stripping: "${stripped}"`)
      return
    }
    if (
      !cmd.startsWith('gh run download ') &&
      !cmd.startsWith('git checkout -b ') &&
      !cmd.startsWith('git am ') &&
      !cmd.startsWith('git push origin ') &&
      !cmd.startsWith('gh pr create ')
    ) {
      log('warn', `applyPatchPR: unrecognized command prefix: "${cmd.substring(0, 60)}"`)
      return
    }
  }

  const salt = Date.now().toString(36)
  const repoDir = `/tmp/${targetRepo.replace('/', '-')}-patch-${salt}`

  // Separate commands by phase
  const preClone = commands
    .filter(c => c.startsWith('gh run download '))
    .map(c => c.includes(' -R ') ? c : `${c} -R ${issueRepo}`)
  const gitCommands = commands.filter(c => c.startsWith('git '))
  const prCreate = commands.filter(c => c.startsWith('gh pr create '))

  const script = [
    ...preClone,
    `gh repo clone ${targetRepo} ${repoDir}`,
    `cd ${repoDir}`,
    ...gitCommands,
    ...prCreate,
    `echo "Done! Cleaning up temp clone..."`,
    `cd /tmp`,
    `rm -rf ${repoDir}`,
  ].join(' && ')

  log('info', `applyPatchPR: launching interactive shell with script:\n${script}`)
  openInteractiveShell(script)
})

ipcHandle('gh:getPRChecks', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRChecks(repo as string, number as number)
})

ipcHandle('gh:getPRTimeline', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRTimeline(repo as string, number as number)
})

ipcHandle('gh:markPRReady', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.markPRReady(repo as string, number as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Mark ready failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:getPRBranchStatus', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRBranchStatus(repo as string, number as number)
})

ipcHandle('gh:updatePRBranch', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.updatePRBranch(repo as string, number as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Update branch failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:searchRepos', async (query: unknown) => {
  return ghBridge.searchRepos(query as string)
})

ipcHandle('gh:getRecentRepos', async () => {
  return ghBridge.getRecentRepos()
})

ipcHandle('app:addRepo', async (repo: unknown) => {
  const repoStr = repo as string
  const pref = localState.getRepoStoragePreference()
  if (pref === 'remote') {
    // Read current authoritative list from remote
    const remoteRepos = await ghBridge.getConfiguredRepos()
    const currentRepos = remoteRepos.length > 0 ? remoteRepos : localState.getCustomRepos()
    if (!currentRepos.includes(repoStr)) {
      currentRepos.push(repoStr)
    }
    localState.setLocalRepos(currentRepos)
    await ghBridge.saveRemoteRepoList(currentRepos)
    return currentRepos
  }
  localState.addRepo(repoStr)
  return localState.getCustomRepos()
})

ipcHandle('app:removeRepo', async (repo: unknown) => {
  const repoStr = repo as string
  const pref = localState.getRepoStoragePreference()
  if (pref === 'remote') {
    // Read current authoritative list from remote
    const remoteRepos = await ghBridge.getConfiguredRepos()
    const currentRepos = remoteRepos.length > 0 ? remoteRepos : localState.getCustomRepos()
    const updatedRepos = currentRepos.filter(r => r !== repoStr)
    localState.setLocalRepos(updatedRepos)
    await ghBridge.saveRemoteRepoList(updatedRepos)
    return updatedRepos
  }
  localState.removeRepo(repoStr)
  return localState.getCustomRepos()
})

ipcHandle('app:openExternal', async (url: unknown) => {
  // Validate the URL to prevent arbitrary command execution
  try {
    const parsed = new URL(url as string)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      openExternalURL(url as string)
    }
  } catch {
    // Invalid URL, ignore
  }
})

ipcHandle('gh:getIssueDetail', async (repo: unknown, number: unknown) => {
  return ghBridge.getIssueDetail(repo as string, number as number)
})

ipcHandle('gh:getPRDetail', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRDetail(repo as string, number as number)
})

ipcHandle('gh:getPRDiff', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRDiff(repo as string, number as number)
})

ipcHandle('gh:getMonthlyActivity', async (repo: unknown) => {
  return ghBridge.getMonthlyActivity(repo as string)
})

ipcHandle('gh:getEvents', async (repo: unknown) => {
  return ghBridge.getEvents(repo as string)
})

ipcHandle('gh:getCommandLog', async () => {
  return ghBridge.getCommandLog()
})

// Write operations (respects write mode)
ipcHandle('gh:writeMode', async () => {
  return localState.getWriteMode()
})

ipcHandle('gh:setWriteMode', async (enabled: unknown) => {
  localState.setWriteMode(enabled as boolean)
})

ipcHandle('gh:addComment', async (repo: unknown, number: unknown, body: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.addComment(repo as string, number as number, body as string, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Comment failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:mergePR', async (repo: unknown, number: unknown, bypass: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.mergePR(repo as string, number as number, writeMode, bypass === true)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Merge failed (exit code ${result.exitCode})`)
  }
  return result
})

ipcHandle('gh:approvePR', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  const result = await ghBridge.approvePR(repo as string, number as number, writeMode)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Approve failed (exit code ${result.exitCode})`)
  }
  return result
})

// Local state
ipcHandle('state:getReadState', async () => {
  return localState.getReadState()
})

ipcHandle('state:markRead', async (key: unknown) => {
  localState.markRead(key as string)
})

ipcHandle('state:getRecapCache', async (key: unknown) => {
  return localState.getRecapCache(key as string)
})

ipcHandle('recap:generate', async (repos: unknown) => {
  const repoList = repos as string[]
  const clearedState = localState.getPTALCleared()
  const cacheKey = repoList.length === 1 ? repoList[0] : '__all__'
  const sinceDate = localState.getRecapClearedAt(cacheKey) ?? undefined
  try {
    const result = await ghBridge.generateRecap(repoList, clearedState, sinceDate)
    const summary = { markdown: result.markdown, generatedAt: new Date().toISOString() }
    localState.setRecapCache(cacheKey, summary)
    return summary
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { markdown: '', generatedAt: new Date().toISOString(), error: msg }
  }
})

ipcHandle('recap:clear', async (key: unknown) => {
  localState.clearRecap(key as string | undefined)
})

// PTAL handlers
ipcHandle('ptal:scan', async (repos: unknown) => {
  const repoList = repos as string[]
  const clearedState = localState.getPTALCleared()
  const items = await ghBridge.scanPTAL(repoList, clearedState)
  localState.setPTALCache(items)
  return items
})

ipcHandle('ptal:getCache', async () => {
  return localState.getPTALCache()
})

ipcHandle('ptal:clear', async (key: unknown, activityId: unknown) => {
  localState.clearPTALItem(key as string, activityId as string)
})

ipcHandle('ptal:getCleared', async () => {
  return localState.getPTALCleared()
})

// gh-aw handlers
ipcMain.handle('gh:checkAwExtension', async () => {
  return ghBridge.checkAwExtension()
})

ipcMain.handle('gh:ensureAwExtension', async () => {
  return ghBridge.ensureAwExtension()
})

ipcMain.handle('gh:hasRepoAssistWorkflow', async (_event, repo: string) => {
  return ghBridge.hasRepoAssistWorkflow(repo)
})

ipcMain.handle('gh:awAddWizard', async (_event, repo: string) => {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return
  const salt = Date.now().toString(6)
  const repoDir = `/tmp/${repo.replace('/', '-')}-${salt}`
  const cmds = [
    `gh repo clone ${repo} ${repoDir}`,
    `cd ${repoDir}`,
    `gh aw add-wizard githubnext/agentics/repo-assist`,
    `cd /tmp`,
    `rm -rf ${repoDir}`,
  ].join(' && ')
  openInteractiveShell(cmds)
})

ipcMain.handle('gh:awRun', async (_event, repo: string, specPath: string, repeat?: number) => {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return
  if (!/^\.github\/workflows\/[a-zA-Z0-9_.-]+\.md$/.test(specPath)) return
  const cmd = repeat && repeat > 1
    ? `gh aw run ${specPath} --repo ${repo} --repeat ${repeat}`
    : `gh aw run ${specPath} --repo ${repo}`
  openInteractiveShell(cmd)
})

ipcMain.handle('app:showMessageBox', async (_event, options: { type?: string; message: string; detail?: string; buttons: string[]; defaultId?: number; cancelId?: number }) => {
  if (!mainWindow) return { response: options.cancelId ?? 2 }
  return dialog.showMessageBox(mainWindow, {
    type: (options.type as 'question' | 'info' | 'warning' | 'error') || 'question',
    message: options.message,
    detail: options.detail,
    buttons: options.buttons,
    defaultId: options.defaultId,
    cancelId: options.cancelId,
  })
})
