import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_DIR = path.join(os.homedir(), '.repo-assist')
const READ_STATE_FILE = path.join(STATE_DIR, 'read-state.json')
const RECAP_CACHE_FILE = path.join(STATE_DIR, 'recap-cache.json')
const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json')
const PTAL_CLEARED_FILE = path.join(STATE_DIR, 'ptal-cleared.json')
const PTAL_CACHE_FILE = path.join(STATE_DIR, 'ptal-cache.json')

function ensureDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  }
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
}

export class LocalState {
  constructor() {
    ensureDir()
  }

  // Read state: tracks which issues/PRs the user has viewed
  getReadState(): Record<string, string> {
    return readJson(READ_STATE_FILE) as Record<string, string>
  }

  markRead(key: string): void {
    const state = this.getReadState()
    state[key] = new Date().toISOString()
    writeJson(READ_STATE_FILE, state)
  }

  isUnread(key: string, updatedAt: string): boolean {
    const state = this.getReadState()
    const lastRead = state[key]
    if (!lastRead) return true
    return new Date(updatedAt) > new Date(lastRead)
  }

  // Recap cache (keyed: '__all__' for global, repo name for per-repo)
  getRecapCache(key: string): unknown | null {
    const data = readJson(RECAP_CACHE_FILE)
    const entry = data[key] as Record<string, unknown> | undefined
    if (entry?.markdown) return entry
    return null
  }

  setRecapCache(key: string, value: unknown): void {
    const data = readJson(RECAP_CACHE_FILE)
    data[key] = value
    writeJson(RECAP_CACHE_FILE, data)
  }

  clearRecap(key?: string): void {
    if (key) {
      const data = readJson(RECAP_CACHE_FILE)
      delete data[key]
      writeJson(RECAP_CACHE_FILE, data)
    } else {
      writeJson(RECAP_CACHE_FILE, {})
    }
  }

  // Write mode
  getWriteMode(): boolean {
    const settings = readJson(SETTINGS_FILE)
    return settings.writeMode === true
  }

  setWriteMode(enabled: boolean): void {
    const settings = readJson(SETTINGS_FILE)
    settings.writeMode = enabled
    writeJson(SETTINGS_FILE, settings)
  }

  // Generic settings access
  getSettings(): Record<string, unknown> {
    return readJson(SETTINGS_FILE)
  }

  setSetting(key: string, value: unknown): void {
    const settings = readJson(SETTINGS_FILE)
    settings[key] = value
    writeJson(SETTINGS_FILE, settings)
  }

  // Custom repos
  getCustomRepos(): string[] {
    const settings = readJson(SETTINGS_FILE)
    return Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
  }

  addRepo(repo: string): void {
    const settings = readJson(SETTINGS_FILE)
    const repos = Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
    if (!repos.includes(repo)) {
      repos.push(repo)
      settings.customRepos = repos
      writeJson(SETTINGS_FILE, settings)
    }
  }

  removeRepo(repo: string): void {
    const settings = readJson(SETTINGS_FILE)
    const repos = Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
    settings.customRepos = repos.filter(r => r !== repo)
    writeJson(SETTINGS_FILE, settings)
  }

  // PTAL cleared state: { "owner/repo#123": "IC_abc123" }
  getPTALCleared(): Record<string, string> {
    return readJson(PTAL_CLEARED_FILE) as Record<string, string>
  }

  clearPTALItem(key: string, activityId: string): void {
    const state = this.getPTALCleared()
    state[key] = activityId
    writeJson(PTAL_CLEARED_FILE, state)
  }

  // PTAL cache: cached scan results for fast startup
  getPTALCache(): unknown[] {
    const data = readJson(PTAL_CACHE_FILE)
    return Array.isArray(data.items) ? data.items : []
  }

  setPTALCache(items: unknown[]): void {
    writeJson(PTAL_CACHE_FILE, { items, cachedAt: new Date().toISOString() })
  }
}
