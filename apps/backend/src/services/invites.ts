import { createHash, randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { inviteCodes, inviteCodeUses, auditLog } from '../db/schema.js'

function hashCode(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function generatePlainCode(): string {
  const bytes = randomBytes(6)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MOCA-'
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length]
    if (i === 3) code += '-'
  }
  return code
}

export function createInviteCode(input: {
  label?: string
  maxUses?: number
  expiresAt?: string
  createdByUserId: string
}): { id: string; plainCode: string } {
  const plainCode = generatePlainCode()
  const codeHash = hashCode(plainCode)
  const id = uuid()
  const now = new Date().toISOString()

  db.insert(inviteCodes).values({
    id,
    codeHash,
    label: input.label ?? null,
    status: 'active',
    maxUses: input.maxUses ?? 1,
    usedCount: 0,
    expiresAt: input.expiresAt ?? null,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  }).run()

  db.insert(auditLog).values({
    id: uuid(),
    actorUserId: input.createdByUserId,
    action: 'invite_code_created',
    targetType: 'invite_code',
    targetId: id,
    metadataJson: JSON.stringify({ label: input.label, maxUses: input.maxUses }),
    createdAt: now,
  }).run()

  return { id, plainCode }
}

export function validateInviteCode(plainCode: string): { valid: boolean; error?: string; inviteCodeId?: string } {
  const codeHash = hashCode(plainCode)
  const code = db.select().from(inviteCodes).where(eq(inviteCodes.codeHash, codeHash)).get()

  if (!code) return { valid: false, error: 'Invalid invite code.' }
  if (code.status === 'disabled') return { valid: false, error: 'Invite code has been disabled.' }
  if (code.status === 'expired') return { valid: false, error: 'Invite code has expired.' }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
    db.update(inviteCodes).set({ status: 'expired', updatedAt: new Date().toISOString() }).where(eq(inviteCodes.id, code.id)).run()
    return { valid: false, error: 'Invite code has expired.' }
  }
  if (code.maxUses !== null && (code.usedCount ?? 0) >= code.maxUses) {
    return { valid: false, error: 'Invite code usage limit reached.' }
  }

  return { valid: true, inviteCodeId: code.id }
}

export function consumeInviteCode(inviteCodeId: string, userId: string, email: string): void {
  const now = new Date().toISOString()

  db.insert(inviteCodeUses).values({
    id: uuid(),
    inviteCodeId,
    userId,
    email,
    usedAt: now,
  }).run()

  const code = db.select().from(inviteCodes).where(eq(inviteCodes.id, inviteCodeId)).get()
  const newCount = (code?.usedCount ?? 0) + 1
  const maxUses = code?.maxUses ?? 999999

  db.update(inviteCodes)
    .set({
      usedCount: newCount,
      status: newCount >= maxUses ? 'disabled' : 'active',
      updatedAt: now,
    })
    .where(eq(inviteCodes.id, inviteCodeId))
    .run()

  db.insert(auditLog).values({
    id: uuid(),
    actorUserId: userId,
    action: 'invite_code_used',
    targetType: 'invite_code',
    targetId: inviteCodeId,
    metadataJson: JSON.stringify({ email }),
    createdAt: now,
  }).run()
}
