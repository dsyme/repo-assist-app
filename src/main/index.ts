import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'path'
import { execSync } from 'child_process'
import { GhBridge } from './gh-bridge'
import { LocalState } from './local-state'

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
    mainWindow.loadURL('http://localhost:5173/src/renderer/index.html')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// === IPC Handlers === //

// gh CLI bridge
ipcMain.handle('gh:exec', async (_event, command: string) => {
  return ghBridge.exec(command)
})

ipcMain.handle('gh:getRepos', async () => {
  const defaultRepos = await ghBridge.getConfiguredRepos()
  const customRepos = localState.getCustomRepos()
  // Merge, deduplicate, preserve order
  const all = [...defaultRepos]
  for (const r of customRepos) {
    if (!all.includes(r)) all.push(r)
  }
  return all
})

ipcMain.handle('gh:getIssues', async (_event, repo: string) => {
  return ghBridge.getIssues(repo)
})

ipcMain.handle('gh:getPRs', async (_event, repo: string) => {
  return ghBridge.getPRs(repo)
})

ipcMain.handle('gh:getRuns', async (_event, repo: string) => {
  return ghBridge.getRuns(repo)
})

ipcMain.handle('gh:getWorkflows', async (_event, repo: string) => {
  return ghBridge.getWorkflows(repo)
})

ipcMain.handle('gh:getFileContent', async (_event, repo: string, path: string) => {
  return ghBridge.getFileContent(repo, path)
})

ipcMain.handle('gh:closeIssue', async (_event, repo: string, number: number, reason: string) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.closeIssue(repo, number, reason, writeMode)
})

ipcMain.handle('gh:getPRChecks', async (_event, repo: string, number: number) => {
  return ghBridge.getPRChecks(repo, number)
})

ipcMain.handle('gh:getPRTimeline', async (_event, repo: string, number: number) => {
  return ghBridge.getPRTimeline(repo, number)
})

ipcMain.handle('gh:markPRReady', async (_event, repo: string, number: number) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.markPRReady(repo, number, writeMode)
})

ipcMain.handle('gh:searchRepos', async (_event, query: string) => {
  return ghBridge.searchRepos(query)
})

ipcMain.handle('gh:getRecentRepos', async () => {
  return ghBridge.getRecentRepos()
})

ipcMain.handle('app:addRepo', async (_event, repo: string) => {
  localState.addRepo(repo)
  return localState.getCustomRepos()
})

ipcMain.handle('app:removeRepo', async (_event, repo: string) => {
  localState.removeRepo(repo)
  return localState.getCustomRepos()
})

ipcMain.handle('app:openExternal', async (_event, url: string) => {
  // Validate the URL to prevent arbitrary command execution
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      openExternalURL(url)
    }
  } catch {
    // Invalid URL, ignore
  }
})

ipcMain.handle('gh:getIssueDetail', async (_event, repo: string, number: number) => {
  return ghBridge.getIssueDetail(repo, number)
})

ipcMain.handle('gh:getPRDetail', async (_event, repo: string, number: number) => {
  return ghBridge.getPRDetail(repo, number)
})

ipcMain.handle('gh:getPRDiff', async (_event, repo: string, number: number) => {
  return ghBridge.getPRDiff(repo, number)
})

ipcMain.handle('gh:getMonthlyActivity', async (_event, repo: string) => {
  return ghBridge.getMonthlyActivity(repo)
})

ipcMain.handle('gh:getEvents', async (_event, repo: string) => {
  return ghBridge.getEvents(repo)
})

ipcMain.handle('gh:getCommandLog', async () => {
  return ghBridge.getCommandLog()
})

// Write operations (respects write mode)
ipcMain.handle('gh:writeMode', async () => {
  return localState.getWriteMode()
})

ipcMain.handle('gh:setWriteMode', async (_event, enabled: boolean) => {
  localState.setWriteMode(enabled)
})

ipcMain.handle('gh:addComment', async (_event, repo: string, number: number, body: string) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.addComment(repo, number, body, writeMode)
})

ipcMain.handle('gh:mergePR', async (_event, repo: string, number: number) => {
  const writeMode = localState.getWriteMode()
  return ghBridge.mergePR(repo, number, writeMode)
})

// Local state
ipcMain.handle('state:getReadState', async () => {
  return localState.getReadState()
})

ipcMain.handle('state:markRead', async (_event, key: string) => {
  localState.markRead(key)
})

ipcMain.handle('state:getRecapCache', async (_event, key: string) => {
  return localState.getRecapCache(key)
})

ipcMain.handle('recap:generate', async (_event, repos: string[]) => {
  const clearedState = localState.getPTALCleared()
  const cacheKey = repos.length === 1 ? repos[0] : '__all__'
  try {
    const result = await ghBridge.generateRecap(repos, clearedState)
    const summary = { markdown: result.markdown, generatedAt: new Date().toISOString() }
    localState.setRecapCache(cacheKey, summary)
    return summary
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { markdown: '', generatedAt: new Date().toISOString(), error: msg }
  }
})

ipcMain.handle('recap:clear', async (_event, key?: string) => {
  localState.clearRecap(key)
})

// PTAL handlers
ipcMain.handle('ptal:scan', async (_event, repos: string[]) => {
  const clearedState = localState.getPTALCleared()
  const items = await ghBridge.scanPTAL(repos, clearedState)
  localState.setPTALCache(items)
  return items
})

ipcMain.handle('ptal:getCache', async () => {
  return localState.getPTALCache()
})

ipcMain.handle('ptal:clear', async (_event, key: string, activityId: string) => {
  localState.clearPTALItem(key, activityId)
})

ipcMain.handle('ptal:getCleared', async () => {
  return localState.getPTALCleared()
})
