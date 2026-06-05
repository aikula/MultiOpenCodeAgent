import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users, workspaces, sessions } from '../db/schema.js'
import { decidePermissionForTest, isWithinWorkspaceForTest, resolveContextForTest } from '../services/permission-gate.js'

const ctx = (workspacePath: string | null) => ({
  userId: 'u1',
  userEmail: 'a@b.com',
  userRole: 'user',
  workspacePath,
})

describe('isWithinWorkspace', () => {
  it('returns true for exact path', () => {
    expect(isWithinWorkspaceForTest('/ws/u1', '/ws/u1')).toBe(true)
  })
  it('returns true for subpath', () => {
    expect(isWithinWorkspaceForTest('/ws/u1', '/ws/u1/files/x.md')).toBe(true)
  })
  it('returns false for sibling', () => {
    expect(isWithinWorkspaceForTest('/ws/u1', '/ws/u2')).toBe(false)
  })
  it('returns false for partial prefix match', () => {
    expect(isWithinWorkspaceForTest('/ws/u1', '/ws/u10/x')).toBe(false)
  })
  it('handles trailing slashes', () => {
    expect(isWithinWorkspaceForTest('/ws/u1/', '/ws/u1/x')).toBe(true)
  })
  it('matches same workspace across container paths via UUID', () => {
    expect(isWithinWorkspaceForTest(
      '/app/data/workspaces/u_76bdb7bc414d44cdb8cbfd4b2cd0187b',
      '/workspaces/u_76bdb7bc414d44cdb8cbfd4b2cd0187b/AGENTS.md',
    )).toBe(true)
  })
  it('rejects different workspace UUIDs', () => {
    expect(isWithinWorkspaceForTest(
      '/app/data/workspaces/u_aaaabbbbccccddddeeeeffffgggghhhh',
      '/workspaces/u_11112222333344445555666677778888/x',
    )).toBe(false)
  })
})

describe('decidePermission external_directory', () => {
  it('allows own workspace file', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'external_directory', [], { filepath: '/ws/u1/files/x.md' })
    expect(r.response).toBe('once')
  })
  it('rejects other user workspace', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'external_directory', [], { filepath: '/ws/u2/files/x.md' })
    expect(r.response).toBe('reject')
  })
  it('rejects /etc', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'external_directory', [], { filepath: '/etc/passwd' })
    expect(r.response).toBe('reject')
  })
  it('allows when only parent dir is within workspace', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'external_directory', [], { parentDir: '/ws/u1' })
    expect(r.response).toBe('once')
  })
  it('rejects when no filepath or parent dir', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'external_directory', [], {})
    expect(r.response).toBe('reject')
  })
  it('rejects when no workspace', () => {
    const r = decidePermissionForTest(ctx(null), 'external_directory', [], { filepath: '/ws/u1/x' })
    expect(r.response).toBe('reject')
  })
})

describe('decidePermission bash', () => {
  it('allows command that references user workspace', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'bash', [], { command: 'ls /ws/u1/files/' })
    expect(r.response).toBe('once')
  })
  it('allows safe read-only command not touching other paths', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'bash', [], { command: 'ls' })
    expect(r.response).toBe('once')
  })
  it('rejects command touching other user workspace', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'bash', [], { command: 'cat /ws/u2/files/x' })
    expect(r.response).toBe('reject')
  })
  it('rejects rm /', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'bash', [], { command: 'rm -rf / ' })
    expect(r.response).toBe('reject')
  })
  it('rejects reading /etc', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'bash', [], { command: 'cat /etc/passwd' })
    expect(r.response).toBe('reject')
  })
})

describe('decidePermission other tools', () => {
  it('allows read', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'read', [], {})
    expect(r.response).toBe('once')
  })
  it('rejects webfetch', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'webfetch', [], {})
    expect(r.response).toBe('reject')
  })
  it('rejects websearch', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'websearch', [], {})
    expect(r.response).toBe('reject')
  })
  it('rejects unknown permission type', () => {
    const r = decidePermissionForTest(ctx('/ws/u1'), 'mystery', [], {})
    expect(r.response).toBe('reject')
  })
})

describe('resolveContext', () => {
  it('looks up by OpenCode session id, not internal session id', async () => {
    const email = `ctx-${uuid()}@test.com`
    const userId = uuid()
    const now = new Date().toISOString()
    const passwordHash = await bcrypt.hash('test', 4)
    db.insert(users).values({
      id: userId, email, passwordHash, displayName: 'Ctx',
      role: 'user', status: 'active', language: 'ru', responseStyle: 'concise',
      dailyQuotaLimit: 20, welcomeQuotaGranted: 30,
      createdAt: now, updatedAt: now,
    }).run()

    const wsPath = `/tmp/ctx-ws-${userId}`
    const wsId = uuid()
    db.insert(workspaces).values({
      id: wsId, userId, path: wsPath, createdAt: now, status: 'active',
    }).run()

    const opencodeSessionId = `ses_test_${uuid()}`
    const internalSessionId = uuid()
    db.insert(sessions).values({
      id: internalSessionId,
      userId,
      workspaceId: wsId,
      opencodeSessionId,
      title: 'test',
      isMain: true,
      source: 'web',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    const ctx = resolveContextForTest(opencodeSessionId)
    expect(ctx).not.toBeNull()
    expect(ctx!.userId).toBe(userId)
    expect(ctx!.workspacePath).toBe(wsPath)

    const ctxMissing = resolveContextForTest('ses_nonexistent')
    expect(ctxMissing).toBeNull()
  })
})
