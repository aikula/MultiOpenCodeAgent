import { describe, it, expect } from 'vitest'
import { assertInsideWorkspace } from '../services/workspace.js'

describe('Workspace path assertion', () => {
  it('allows paths inside workspace', () => {
    expect(() => assertInsideWorkspace('/data/workspaces/u_abc', '/data/workspaces/u_abc/skills')).not.toThrow()
  })

  it('allows relative paths resolved inside workspace', () => {
    expect(() => assertInsideWorkspace('/data/workspaces/u_abc', 'skills/test')).not.toThrow()
  })

  it('rejects path traversal ../ attempts', () => {
    expect(() => assertInsideWorkspace('/data/workspaces/u_abc', '../etc/passwd')).toThrow('Path escapes workspace')
  })

  it('rejects absolute paths outside workspace', () => {
    expect(() => assertInsideWorkspace('/data/workspaces/u_abc', '/etc/passwd')).toThrow('Path escapes workspace')
  })

  it('rejects deep traversal', () => {
    expect(() => assertInsideWorkspace('/data/workspaces/u_abc', 'foo/../../etc/passwd')).toThrow('Path escapes workspace')
  })
})
