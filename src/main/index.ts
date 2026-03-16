import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import { execSync } from 'child_process'
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
    title: 'Repo Assist',
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
    if (remoteRepos.length > 0) return remoteRepos
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

ipcHandle('gh:getFileContent', async (repo: unknown, filePath: unknown) => {
  return ghBridge.getFileContent(repo as string, filePath as string)
})

ipcHandle('gh:closeIssue', async (repo: unknown, number: unknown, reason: unknown) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.closeIssue(repo as string, number as number, reason as string, writeMode)
})

ipcHandle('gh:getPRChecks', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRChecks(repo as string, number as number)
})

ipcHandle('gh:getPRTimeline', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRTimeline(repo as string, number as number)
})

ipcHandle('gh:markPRReady', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.markPRReady(repo as string, number as number, writeMode)
})

ipcHandle('gh:getPRBranchStatus', async (repo: unknown, number: unknown) => {
  return ghBridge.getPRBranchStatus(repo as string, number as number)
})

ipcHandle('gh:updatePRBranch', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.updatePRBranch(repo as string, number as number, writeMode)
})

ipcHandle('gh:searchRepos', async (query: unknown) => {
  return ghBridge.searchRepos(query as string)
})

ipcHandle('gh:getRecentRepos', async () => {
  return ghBridge.getRecentRepos()
})

ipcHandle('app:addRepo', async (repo: unknown) => {
  const repoStr = repo as string
  localState.addRepo(repoStr)
  // If in remote mode, also save to remote
  const pref = localState.getRepoStoragePreference()
  if (pref === 'remote') {
    const allRepos = localState.getCustomRepos()
    await ghBridge.saveRemoteRepoList(allRepos)
  }
  return localState.getCustomRepos()
})

ipcHandle('app:removeRepo', async (repo: unknown) => {
  const repoStr = repo as string
  localState.removeRepo(repoStr)
  // If in remote mode, also save to remote
  const pref = localState.getRepoStoragePreference()
  if (pref === 'remote') {
    const allRepos = localState.getCustomRepos()
    await ghBridge.saveRemoteRepoList(allRepos)
  }
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
  return ghBridge.addComment(repo as string, number as number, body as string, writeMode)
})

ipcHandle('gh:mergePR', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.mergePR(repo as string, number as number, writeMode)
})

ipcHandle('gh:approvePR', async (repo: unknown, number: unknown) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.approvePR(repo as string, number as number, writeMode)
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
