process.env.JWT_SECRET = 'test-jwt-secret-for-tests'
process.env.OPENCODE_SERVER_PASSWORD = 'test-password'
process.env.OPENCODE_BASE_URL = 'http://localhost:4096'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.WORKSPACES_ROOT = '/tmp/moca-test-workspaces'
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('app.db')) {
  process.env.DATABASE_URL = 'file:./data/test.db'
}

import { runMigrations } from '../db/migrate.js'
import { rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const dbPath = process.env.DATABASE_URL.replace('file:', '')
if (existsSync(dbPath)) {
  try { rmSync(dbPath) } catch {}
  try { rmSync(dbPath + '-shm') } catch {}
  try { rmSync(dbPath + '-wal') } catch {}
}
mkdirSync(join(dbPath, '..'), { recursive: true })
mkdirSync(process.env.WORKSPACES_ROOT, { recursive: true })

runMigrations()
