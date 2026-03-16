import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('repoAssist', {
  // GitHub data
  getRepos: () => ipcRenderer.invoke('gh:getRepos'),
  getIssues: (repo: string) => ipcRenderer.invoke('gh:getIssues', repo),
  getPRs: (repo: string) => ipcRenderer.invoke('gh:getPRs', repo),
  getRuns: (repo: string) => ipcRenderer.invoke('gh:getRuns', repo),
  getWorkflows: (repo: string) => ipcRenderer.invoke('gh:getWorkflows', repo),
  getFileContent: (repo: string, path: string) => ipcRenderer.invoke('gh:getFileContent', repo, path),
  closeIssue: (repo: string, number: number, reason: string) => ipcRenderer.invoke('gh:closeIssue', repo, number, reason),
  searchRepos: (query: string) => ipcRenderer.invoke('gh:searchRepos', query),
  getRecentRepos: () => ipcRenderer.invoke('gh:getRecentRepos'),
  addRepo: (repo: string) => ipcRenderer.invoke('app:addRepo', repo),
  removeRepo: (repo: string) => ipcRenderer.invoke('app:removeRepo', repo),
  getIssueDetail: (repo: string, number: number) => ipcRenderer.invoke('gh:getIssueDetail', repo, number),
  getPRDetail: (repo: string, number: number) => ipcRenderer.invoke('gh:getPRDetail', repo, number),
  getPRDiff: (repo: string, number: number) => ipcRenderer.invoke('gh:getPRDiff', repo, number),
  getPRChecks: (repo: string, number: number) => ipcRenderer.invoke('gh:getPRChecks', repo, number),
  getPRTimeline: (repo: string, number: number) => ipcRenderer.invoke('gh:getPRTimeline', repo, number),
  markPRReady: (repo: string, number: number) => ipcRenderer.invoke('gh:markPRReady', repo, number),
  getMonthlyActivity: (repo: string) => ipcRenderer.invoke('gh:getMonthlyActivity', repo),
  getEvents: (repo: string) => ipcRenderer.invoke('gh:getEvents', repo),
  getCommandLog: () => ipcRenderer.invoke('gh:getCommandLog'),
  exec: (command: string) => ipcRenderer.invoke('gh:exec', command),
  checkModelsExtension: () => ipcRenderer.invoke('gh:checkModelsExtension'),
  installModelsExtension: () => ipcRenderer.invoke('gh:installModelsExtension'),

  // Write operations
  getWriteMode: () => ipcRenderer.invoke('gh:writeMode'),
  setWriteMode: (enabled: boolean) => ipcRenderer.invoke('gh:setWriteMode', enabled),
  addComment: (repo: string, number: number, body: string) => ipcRenderer.invoke('gh:addComment', repo, number, body),
  mergePR: (repo: string, number: number) => ipcRenderer.invoke('gh:mergePR', repo, number),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),

  // Local state
  getReadState: () => ipcRenderer.invoke('state:getReadState'),
  markRead: (key: string) => ipcRenderer.invoke('state:markRead', key),
  getRecapCache: (key: string) => ipcRenderer.invoke('state:getRecapCache', key),
  generateRecap: (repos: string[]) => ipcRenderer.invoke('recap:generate', repos),
  clearRecap: (key?: string) => ipcRenderer.invoke('recap:clear', key),

  // PTAL
  scanPTAL: (repos: string[]) => ipcRenderer.invoke('ptal:scan', repos),
  getPTALCache: () => ipcRenderer.invoke('ptal:getCache'),
  clearPTALItem: (key: string, activityId: string) => ipcRenderer.invoke('ptal:clear', key, activityId),
  getPTALCleared: () => ipcRenderer.invoke('ptal:getCleared'),
})
