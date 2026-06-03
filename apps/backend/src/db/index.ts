import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { env } from '../env.js'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = env.DATABASE_URL.replace('file:', '')
const dir = dirname(dbPath)
if (dir && dir !== '.') {
  mkdirSync(dir, { recursive: true })
}

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
