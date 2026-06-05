import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import type { FastifyInstance } from 'fastify'

export async function registerUser(
  email: string,
  password: string,
  displayName?: string,
) {
  const existing = db.select().from(users).where(eq(users.email, email)).get()
  if (existing) throw new Error('Email already registered')

  const id = uuid()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(password, 12)

  db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName: displayName || null,
    createdAt: now,
    updatedAt: now,
  }).run()

  return { id, email, displayName: displayName || null }
}

export async function loginUser(email: string, password: string) {
  const user = db.select().from(users).where(eq(users.email, email)).get()
  if (!user) throw new Error('Invalid credentials')
  if (user.status === 'blocked') throw new Error('Account blocked')

  const valid = await bcrypt.compare(password, user.passwordHash!)
  if (!valid) throw new Error('Invalid credentials')

  return {
    userId: user.id,
    email: user.email ?? '',
    role: (user.role ?? 'user') as 'user' | 'admin',
    displayName: user.displayName,
  }
}

export function generateToken(app: FastifyInstance, payload: { userId: string; email: string; role: 'user' | 'admin' }) {
  return app.jwt.sign(payload, { expiresIn: '7d' })
}
