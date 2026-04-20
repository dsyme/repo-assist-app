import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// LocalState uses os.homedir() at module-load time to set STATE_DIR.
// We override HOME env var and use vi.resetModules() to force re-evaluation.

let tmpHome: string
let origHome: string | undefined

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-assist-test-'))
  origHome = process.env.HOME
  process.env.HOME = tmpHome
})

afterEach(() => {
  process.env.HOME = origHome
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function loadLocalState() {
  const mod = await import('./local-state')
  return new mod.LocalState(path.join(tmpHome, '.repo-assist'))
}

describe('LocalState', () => {
  describe('custom repos', () => {
    it('returns empty array when no repos configured', async () => {
      const ls = await loadLocalState()
      expect(ls.getCustomRepos()).toEqual([])
    })

    it('addRepo adds a repo', async () => {
      const ls = await loadLocalState()
      ls.addRepo('owner/repo1')
      expect(ls.getCustomRepos()).toEqual(['owner/repo1'])
    })

    it('addRepo is idempotent', async () => {
      const ls = await loadLocalState()
      ls.addRepo('owner/repo1')
      ls.addRepo('owner/repo1')
      expect(ls.getCustomRepos()).toEqual(['owner/repo1'])
    })

    it('removeRepo removes a repo', async () => {
      const ls = await loadLocalState()
      ls.addRepo('owner/repo1')
      ls.addRepo('owner/repo2')
      ls.removeRepo('owner/repo1')
      expect(ls.getCustomRepos()).toEqual(['owner/repo2'])
    })

    it('removeRepo is safe when repo not present', async () => {
      const ls = await loadLocalState()
      ls.addRepo('owner/repo1')
      ls.removeRepo('owner/nonexistent')
      expect(ls.getCustomRepos()).toEqual(['owner/repo1'])
    })

    it('setLocalRepos replaces the full repo list', async () => {
      const ls = await loadLocalState()
      ls.addRepo('owner/old')
      ls.setLocalRepos(['a/b', 'c/d'])
      expect(ls.getCustomRepos()).toEqual(['a/b', 'c/d'])
    })
  })

  describe('seedDefaultReposIfEmpty', () => {
    it('seeds defaults when no repos exist', async () => {
      const ls = await loadLocalState()
      ls.seedDefaultReposIfEmpty()
      const repos = ls.getCustomRepos()
      expect(repos.length).toBeGreaterThan(0)
      expect(repos).toContain('fslaborg/Deedle')
    })

    it('does not overwrite existing repos', async () => {
      const ls = await loadLocalState()
      ls.addRepo('my/repo')
      ls.seedDefaultReposIfEmpty()
      expect(ls.getCustomRepos()).toEqual(['my/repo'])
    })
  })

  describe('write mode', () => {
    it('defaults to false', async () => {
      const ls = await loadLocalState()
      expect(ls.getWriteMode()).toBe(false)
    })

    it('can be toggled on and off', async () => {
      const ls = await loadLocalState()
      ls.setWriteMode(true)
      expect(ls.getWriteMode()).toBe(true)
      ls.setWriteMode(false)
      expect(ls.getWriteMode()).toBe(false)
    })
  })

  describe('repo storage preference', () => {
    it('defaults to null', async () => {
      const ls = await loadLocalState()
      expect(ls.getRepoStoragePreference()).toBeNull()
    })

    it('can be set to remote', async () => {
      const ls = await loadLocalState()
      ls.setRepoStoragePreference('remote')
      expect(ls.getRepoStoragePreference()).toBe('remote')
    })

    it('can be set to local', async () => {
      const ls = await loadLocalState()
      ls.setRepoStoragePreference('local')
      expect(ls.getRepoStoragePreference()).toBe('local')
    })
  })

  describe('read state', () => {
    it('returns empty object initially', async () => {
      const ls = await loadLocalState()
      expect(ls.getReadState()).toEqual({})
    })

    it('markRead stores timestamp', async () => {
      const ls = await loadLocalState()
      ls.markRead('owner/repo#1')
      const state = ls.getReadState()
      expect(state['owner/repo#1']).toBeDefined()
      expect(new Date(state['owner/repo#1']).getTime()).toBeGreaterThan(0)
    })

    it('isUnread returns true for never-read items', async () => {
      const ls = await loadLocalState()
      expect(ls.isUnread('owner/repo#1', new Date().toISOString())).toBe(true)
    })

    it('isUnread returns false for items read after update', async () => {
      const ls = await loadLocalState()
      const past = new Date(Date.now() - 60000).toISOString()
      ls.markRead('owner/repo#1')
      expect(ls.isUnread('owner/repo#1', past)).toBe(false)
    })

    it('isUnread returns true when updated after last read', async () => {
      const ls = await loadLocalState()
      ls.markRead('owner/repo#1')
      // Wait a tiny bit so the updatedAt is after the read timestamp
      const future = new Date(Date.now() + 60000).toISOString()
      expect(ls.isUnread('owner/repo#1', future)).toBe(true)
    })
  })

  describe('generic settings', () => {
    it('setSetting and getSettings work', async () => {
      const ls = await loadLocalState()
      ls.setSetting('zoomFactor', 1.5)
      const settings = ls.getSettings()
      expect(settings.zoomFactor).toBe(1.5)
    })

    it('settings persist across multiple calls', async () => {
      const ls = await loadLocalState()
      ls.setSetting('a', 1)
      ls.setSetting('b', 2)
      const settings = ls.getSettings()
      expect(settings.a).toBe(1)
      expect(settings.b).toBe(2)
    })
  })

  describe('PTAL cleared state', () => {
    it('returns empty object initially', async () => {
      const ls = await loadLocalState()
      expect(ls.getPTALCleared()).toEqual({})
    })

    it('clearPTALItem stores activity ID', async () => {
      const ls = await loadLocalState()
      ls.clearPTALItem('owner/repo#1', 'IC_abc123')
      expect(ls.getPTALCleared()['owner/repo#1']).toBe('IC_abc123')
    })
  })

  describe('PTAL cache', () => {
    it('returns empty array initially', async () => {
      const ls = await loadLocalState()
      expect(ls.getPTALCache()).toEqual([])
    })

    it('setPTALCache and getPTALCache round-trip', async () => {
      const ls = await loadLocalState()
      const items = [{ key: 'test#1', repo: 'test' }]
      ls.setPTALCache(items)
      expect(ls.getPTALCache()).toEqual(items)
    })
  })

  describe('recap cache', () => {
    it('returns null for missing key', async () => {
      const ls = await loadLocalState()
      expect(ls.getRecapCache('test')).toBeNull()
    })

    it('setRecapCache and getRecapCache round-trip', async () => {
      const ls = await loadLocalState()
      ls.setRecapCache('test', { markdown: '# Hello', generatedAt: '2024-01-01' })
      const cached = ls.getRecapCache('test') as Record<string, unknown>
      expect(cached.markdown).toBe('# Hello')
    })

    it('clearRecap removes specific key and sets clearedAt', async () => {
      const ls = await loadLocalState()
      ls.setRecapCache('test', { markdown: '# Hello', generatedAt: '2024-01-01' })
      ls.clearRecap('test')
      expect(ls.getRecapCache('test')).toBeNull()
      expect(ls.getRecapClearedAt('test')).toBeDefined()
    })

    it('clearRecap with no key clears all', async () => {
      const ls = await loadLocalState()
      ls.setRecapCache('a', { markdown: '1', generatedAt: '2024-01-01' })
      ls.setRecapCache('b', { markdown: '2', generatedAt: '2024-01-01' })
      ls.clearRecap()
      expect(ls.getRecapCache('a')).toBeNull()
      expect(ls.getRecapCache('b')).toBeNull()
    })
  })

  describe('file permissions', () => {
    it('creates state directory with mode 0700', async () => {
      await loadLocalState()
      const stateDir = path.join(tmpHome, '.repo-assist')
      const stat = fs.statSync(stateDir)
      // On Linux, check directory permissions
      if (process.platform !== 'win32') {
        expect(stat.mode & 0o777).toBe(0o700)
      }
    })

    it('creates settings file with mode 0600', async () => {
      const ls = await loadLocalState()
      ls.setSetting('test', true)
      const settingsFile = path.join(tmpHome, '.repo-assist', 'settings.json')
      const stat = fs.statSync(settingsFile)
      if (process.platform !== 'win32') {
        expect(stat.mode & 0o777).toBe(0o600)
      }
    })
  })
})
