import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'

export interface JwtPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<JwtPayload>()

    const user = db.select({
      id: users.id,
      role: users.role,
      status: users.status,
    })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .get()

    if (!user) {
      return reply.status(401).send({ error: 'User not found' })
    }

    if (user.status !== 'active') {
      return reply.status(403).send({ error: 'Account is blocked' })
    }

    request.user = {
      userId: user.id,
      email: decoded.email,
      role: user.role as 'user' | 'admin',
    }
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  await authMiddleware(request, reply)
  if (reply.sent) return
  if (request.user.role !== 'admin') {
    reply.status(403).send({ error: 'Forbidden' })
  }
}
