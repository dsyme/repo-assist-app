import { describe, expect, it } from 'vitest'
import { parsePatchInstructions } from './parse-patch-instructions'

// Additional edge-case coverage for parsePatchInstructions. The "happy path" /
// real-world recovery formats (legacy `git am` patches and GH-AW bundle
// recovery instructions) are covered in ../components/DetailPanel.test.tsx —
// these tests focus on falsy/empty inputs and the individual required-line
// validations that gate a successful parse.

describe('parsePatchInstructions edge cases', () => {
  it('returns null for an empty body', () => {
    expect(parsePatchInstructions('')).toBeNull()
  })

  it('returns null for a body with no recognized command lines', () => {
    expect(parsePatchInstructions('just some regular issue text\nwith no commands')).toBeNull()
  })

  const validLines = {
    download: "gh run download '123' -n agent -D '/tmp/agent-123'",
    checkout: "git checkout 'repo-assist/fix-1'",
    am: "git am --3way /tmp/agent-123/changes.patch",
    push: 'git push origin repo-assist/fix-1',
    prCreate: "gh pr create --title 'Fix bug' --base main --head repo-assist/fix-1 --repo owner/repo",
  }

  function buildBody(overrides: Partial<typeof validLines> = {}, omit: (keyof typeof validLines)[] = []) {
    const lines = { ...validLines, ...overrides }
    return Object.keys(lines)
      .filter(key => !omit.includes(key as keyof typeof validLines))
      .map(key => lines[key as keyof typeof validLines])
      .join('\n')
  }

  it('parses a complete valid body with git am', () => {
    const result = parsePatchInstructions(buildBody())
    expect(result).toEqual({
      targetRepo: 'owner/repo',
      prTitle: 'Fix bug',
      branch: 'repo-assist/fix-1',
      commands: [validLines.download, validLines.checkout, validLines.am, validLines.push, validLines.prCreate],
    })
  })

  it('returns null when the download line is missing', () => {
    expect(parsePatchInstructions(buildBody({}, ['download']))).toBeNull()
  })

  it('returns null when the checkout line is missing', () => {
    expect(parsePatchInstructions(buildBody({}, ['checkout']))).toBeNull()
  })

  it('returns null when both am and bundle_path are missing', () => {
    expect(parsePatchInstructions(buildBody({}, ['am']))).toBeNull()
  })

  it('returns null when the push line is missing', () => {
    expect(parsePatchInstructions(buildBody({}, ['push']))).toBeNull()
  })

  it('returns null when the pr create line is missing', () => {
    expect(parsePatchInstructions(buildBody({}, ['prCreate']))).toBeNull()
  })

  it('returns null when pr create has no --repo flag', () => {
    const body = buildBody({ prCreate: "gh pr create --title 'Fix bug' --base main --head repo-assist/fix-1" })
    expect(parsePatchInstructions(body)).toBeNull()
  })

  it('defaults the title to "Patch PR" when --title is absent', () => {
    const body = buildBody({ prCreate: 'gh pr create --base main --head repo-assist/fix-1 --repo owner/repo' })
    expect(parsePatchInstructions(body)?.prTitle).toBe('Patch PR')
  })

  it('parses a double-quoted title', () => {
    const body = buildBody({
      prCreate: 'gh pr create --title "Fix bug" --base main --head repo-assist/fix-1 --repo owner/repo',
    })
    expect(parsePatchInstructions(body)?.prTitle).toBe('Fix bug')
  })

  it('parses an unquoted checkout branch name', () => {
    const body = buildBody({ checkout: 'git checkout repo-assist/fix-1' })
    expect(parsePatchInstructions(body)?.branch).toBe('repo-assist/fix-1')
  })

  it('accepts bundle_path in place of git am', () => {
    const bundleLine = "bundle_path='/tmp/agent-123/changes.bundle'"
    const body = `${buildBody({}, ['am'])}\n${bundleLine}`
    const result = parsePatchInstructions(body)
    expect(result).not.toBeNull()
    expect(result?.commands).toContain(bundleLine)
  })
})
