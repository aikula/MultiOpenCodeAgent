import type { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../env.js'

export interface JwtPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<JwtPayload>()
    request.user = decoded
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
