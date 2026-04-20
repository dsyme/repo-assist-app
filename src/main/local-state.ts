import fs from 'fs'
import path from 'path'
import os from 'os'

export class LocalState {
  private readonly stateDir: string
  private readonly readStateFile: string
  private readonly recapCacheFile: string
  private readonly settingsFile: string
  private readonly ptalClearedFile: string
  private readonly ptalCacheFile: string

  constructor(stateDir?: string) {
    this.stateDir = stateDir ?? path.join(os.homedir(), '.repo-assist')
    this.readStateFile = path.join(this.stateDir, 'read-state.json')
    this.recapCacheFile = path.join(this.stateDir, 'recap-cache.json')
    this.settingsFile = path.join(this.stateDir, 'settings.json')
    this.ptalClearedFile = path.join(this.stateDir, 'ptal-cleared.json')
    this.ptalCacheFile = path.join(this.stateDir, 'ptal-cache.json')
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 })
    }
  }

  private readJson(filePath: string): Record<string, unknown> {
    try {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  private writeJson(filePath: string, data: unknown): void {
    this.ensureDir()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
  }

  // Read state: tracks which issues/PRs the user has viewed
  getReadState(): Record<string, string> {
    return this.readJson(this.readStateFile) as Record<string, string>
  }

  markRead(key: string): void {
    const state = this.getReadState()
    state[key] = new Date().toISOString()
    this.writeJson(this.readStateFile, state)
  }

  isUnread(key: string, updatedAt: string): boolean {
    const state = this.getReadState()
    const lastRead = state[key]
    if (!lastRead) return true
    return new Date(updatedAt) > new Date(lastRead)
  }

  // Recap cache (keyed: '__all__' for global, repo name for per-repo)
  getRecapCache(key: string): unknown | null {
    const data = this.readJson(this.recapCacheFile)
    const entry = data[key] as Record<string, unknown> | undefined
    if (entry?.markdown) return entry
    return null
  }

  setRecapCache(key: string, value: unknown): void {
    const data = this.readJson(this.recapCacheFile)
    data[key] = value
    this.writeJson(this.recapCacheFile, data)
  }

  clearRecap(key?: string): void {
    if (key) {
      const data = this.readJson(this.recapCacheFile)
      delete data[key]
      // Store the cleared-at timestamp for this key
      data[`${key}__clearedAt`] = new Date().toISOString()
      this.writeJson(this.recapCacheFile, data)
    } else {
      // Store a global cleared-at timestamp
      this.writeJson(this.recapCacheFile, { '__all____clearedAt': new Date().toISOString() })
    }
  }

  getRecapClearedAt(key: string): string | null {
    const data = this.readJson(this.recapCacheFile)
    const ts = data[`${key}__clearedAt`]
    return typeof ts === 'string' ? ts : null
  }

  // Write mode
  getWriteMode(): boolean {
    const settings = this.readJson(this.settingsFile)
    return settings.writeMode === true
  }

  setWriteMode(enabled: boolean): void {
    const settings = this.readJson(this.settingsFile)
    settings.writeMode = enabled
    this.writeJson(this.settingsFile, settings)
  }

  // Generic settings access
  getSettings(): Record<string, unknown> {
    return this.readJson(this.settingsFile)
  }

  setSetting(key: string, value: unknown): void {
    const settings = this.readJson(this.settingsFile)
    settings[key] = value
    this.writeJson(this.settingsFile, settings)
  }

  // Custom repos
  getCustomRepos(): string[] {
    const settings = this.readJson(this.settingsFile)
    return Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
  }

  addRepo(repo: string): void {
    const settings = this.readJson(this.settingsFile)
    const repos = Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
    if (!repos.includes(repo)) {
      repos.push(repo)
      settings.customRepos = repos
      this.writeJson(this.settingsFile, settings)
    }
  }

  removeRepo(repo: string): void {
    const settings = this.readJson(this.settingsFile)
    const repos = Array.isArray(settings.customRepos) ? settings.customRepos as string[] : []
    settings.customRepos = repos.filter(r => r !== repo)
    this.writeJson(this.settingsFile, settings)
  }

  // PTAL cleared state: { "owner/repo#123": "IC_abc123" }
  getPTALCleared(): Record<string, string> {
    return this.readJson(this.ptalClearedFile) as Record<string, string>
  }

  clearPTALItem(key: string, activityId: string): void {
    const state = this.getPTALCleared()
    state[key] = activityId
    this.writeJson(this.ptalClearedFile, state)
  }

  // PTAL cache: cached scan results for fast startup
  getPTALCache(): unknown[] {
    const data = this.readJson(this.ptalCacheFile)
    return Array.isArray(data.items) ? data.items : []
  }

  setPTALCache(items: unknown[]): void {
    this.writeJson(this.ptalCacheFile, { items, cachedAt: new Date().toISOString() })
  }

  // Repo storage preference: 'remote' | 'local' | null (never asked)
  getRepoStoragePreference(): 'remote' | 'local' | null {
    const settings = this.readJson(this.settingsFile)
    const pref = settings.repoStoragePreference
    if (pref === 'remote' || pref === 'local') return pref
    return null
  }

  setRepoStoragePreference(pref: 'remote' | 'local'): void {
    const settings = this.readJson(this.settingsFile)
    settings.repoStoragePreference = pref
    this.writeJson(this.settingsFile, settings)
  }

  /** Seed the local repo list with defaults if it's empty and has never been customized */
  seedDefaultReposIfEmpty(): void {
    const settings = this.readJson(this.settingsFile)
    if (!Array.isArray(settings.customRepos) || settings.customRepos.length === 0) {
      settings.customRepos = [
        'fslaborg/Deedle',
        'fsprojects/FSharp.Formatting',
        'fsprojects/FSharp.Data',
        'fsprojects/FSharp.Control.TaskSeq'
      ]
      this.writeJson(this.settingsFile, settings)
    }
  }

  /** Replace the full local repo list (used when syncing from remote) */
  setLocalRepos(repos: string[]): void {
    const settings = this.readJson(this.settingsFile)
    settings.customRepos = repos
    this.writeJson(this.settingsFile, settings)
  }
}
