import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { randomBytes } from 'crypto'
import { registerUser, loginUser, generateToken } from '../services/auth.js'
import { createWorkspace } from '../services/workspace.js'
import { grantWelcomeQuota } from '../services/quota.js'
import { db } from '../db/index.js'
import { sessions, workspaces, users } from '../db/schema.js'
import { registerSchema, loginSchema } from '@moca/shared/validation'
import { opencodeClient } from '../opencode/client.js'

const loginCodes = new Map<string, { userId: string; expiresAt: number }>()

export function getLoginCode(userId: string): string {
  // Remove old codes for this user
  for (const [code, data] of loginCodes) {
    if (data.userId === userId) loginCodes.delete(code)
  }
  const code = randomBytes(4).toString('hex')
  loginCodes.set(code, { userId, expiresAt: Date.now() + 10 * 60 * 1000 })
  return code
}

export function consumeLoginCode(code: string): string | null {
  const data = loginCodes.get(code)
  if (!data) return null
  if (Date.now() > data.expiresAt) {
    loginCodes.delete(code)
    return null
  }
  loginCodes.delete(code)
  return data.userId
}

async function createMainSession(userId: string, workspacePath: string) {
  const id = uuid()
  const now = new Date().toISOString()
  let ocSessionId: string

  try {
    const oc = await opencodeClient.createSession({
      workspacePath,
      title: 'Main session',
    })
    ocSessionId = oc.id
  } catch {
    ocSessionId = `local-${id}`
  }

  const ws = db.select().from(workspaces).where(eq(workspaces.userId, userId)).get()
  if (!ws) return

  db.insert(sessions).values({
    id,
    userId,
    workspaceId: ws.id,
    opencodeSessionId: ocSessionId,
    title: 'Main session',
    isMain: true,
    source: 'system',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).run()
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const user = await registerUser(body.email, body.password, body.displayName)

    const ws = await createWorkspace(user.id)
    grantWelcomeQuota(user.id)
    await createMainSession(user.id, ws.path)

    const token = generateToken(app, {
      userId: user.id,
      email: user.email,
      role: 'user',
    })

    return { token, user }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await loginUser(body.email, body.password)

    const token = generateToken(app, {
      userId: result.userId,
      email: result.email,
      role: result.role,
    })

    return {
      token,
      user: {
        id: result.userId,
        email: result.email,
        displayName: result.displayName,
        role: result.role,
      },
    }
  })

  app.post('/api/auth/logout', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    // JWT is stateless — client discards token. Mark for future token blacklisting.
    return { ok: true }
  })

  app.get('/api/me', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const user = db.select().from(users).where(eq(users.id, request.user.userId)).get()
    if (!user) return { error: 'Not found' }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      language: user.language,
    }
  })

  app.get('/api/me/login-code', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const code = getLoginCode(request.user.userId)
    return { code }
  })
}
