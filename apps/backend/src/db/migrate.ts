import { sql } from 'drizzle-orm'
import { db, sqlite } from './index.js'

export async function runMigrations() {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      role TEXT CHECK(role IN ('user', 'admin')) DEFAULT 'user',
      status TEXT CHECK(status IN ('active', 'blocked', 'pending')) DEFAULT 'active',
      default_agent TEXT DEFAULT NULL,
      default_model TEXT DEFAULT NULL,
      language TEXT DEFAULT 'ru',
      response_style TEXT DEFAULT 'concise',
      daily_quota_limit INTEGER DEFAULT 20,
      welcome_quota_granted INTEGER DEFAULT 30,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS telegram_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      telegram_user_id TEXT UNIQUE NOT NULL,
      telegram_username TEXT,
      linked_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      opencode_session_id TEXT NOT NULL,
      title TEXT,
      is_main INTEGER DEFAULT 0,
      source TEXT CHECK(source IN ('web', 'telegram', 'system')) DEFAULT 'web',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT,
      channel TEXT CHECK(channel IN ('web', 'telegram', 'system')),
      opencode_message_id TEXT,
      created_at TEXT NOT NULL
    )
  `)

  // FTS5 virtual table — use raw sqlite since drizzle doesn't handle VIRTUAL TABLE
  const ftsExists = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'"
  ).get()
  if (!ftsExists) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE messages_fts
      USING fts5(content, user_id, session_id, content='messages', content_rowid='rowid')
    `)
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT CHECK(type IN ('fact', 'preference', 'task_context', 'decision')),
      content TEXT NOT NULL,
      source_session_id TEXT,
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS quota_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      delta INTEGER NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      remind_at TEXT NOT NULL,
      timezone TEXT DEFAULT 'Europe/Vilnius',
      channel TEXT CHECK(channel IN ('telegram', 'web', 'both')) DEFAULT 'telegram',
      status TEXT CHECK(status IN ('scheduled', 'sent', 'cancelled')) DEFAULT 'scheduled',
      created_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      external_id TEXT,
      title TEXT NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      location TEXT,
      description TEXT,
      source TEXT DEFAULT 'local',
      created_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS skill_catalogs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT CHECK(source_type IN ('git', 'json', 'zip')),
      source_url TEXT,
      status TEXT CHECK(status IN ('active', 'disabled')) DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS marketplace_skills (
      id TEXT PRIMARY KEY,
      catalog_id TEXT REFERENCES skill_catalogs(id),
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      author TEXT,
      license TEXT,
      source_url TEXT,
      sha256 TEXT,
      status TEXT CHECK(status IN ('approved', 'rejected', 'needs_review')) DEFAULT 'needs_review',
      scan_report_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS user_installed_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      marketplace_skill_id TEXT REFERENCES marketplace_skills(id),
      installed_slug TEXT NOT NULL,
      installed_path TEXT NOT NULL,
      version TEXT,
      sha256 TEXT,
      installed_at TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    )
  `)

  console.log('Database migrations complete.')
}
