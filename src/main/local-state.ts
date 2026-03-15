import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_DIR = path.join(os.homedir(), '.repo-assist')
const READ_STATE_FILE = path.join(STATE_DIR, 'read-state.json')
const RECAP_CACHE_FILE = path.join(STATE_DIR, 'recap-cache.json')
const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json')

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

  // Recap cache
  getRecapCache(): unknown {
    return readJson(RECAP_CACHE_FILE)
  }

  setRecapCache(data: unknown): void {
    writeJson(RECAP_CACHE_FILE, data)
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
}
