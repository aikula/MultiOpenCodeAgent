import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  role: text('role', { enum: ['user', 'admin'] }).default('user'),
  status: text('status', { enum: ['active', 'blocked', 'pending'] }).default('active'),
  defaultAgent: text('default_agent'),
  defaultModel: text('default_model'),
  language: text('language').default('ru'),
  responseStyle: text('response_style').default('concise'),
  dailyQuotaLimit: integer('daily_quota_limit').default(20),
  welcomeQuotaGranted: integer('welcome_quota_granted').default(30),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const telegramLinks = sqliteTable('telegram_links', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  telegramUserId: text('telegram_user_id').unique().notNull(),
  telegramUsername: text('telegram_username'),
  linkedAt: text('linked_at').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  path: text('path').notNull().unique(),
  createdAt: text('created_at').notNull(),
  status: text('status').default('active'),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  opencodeSessionId: text('opencode_session_id').notNull(),
  title: text('title'),
  isMain: integer('is_main', { mode: 'boolean' }).default(false),
  source: text('source', { enum: ['web', 'telegram', 'system'] }).default('web'),
  status: text('status').default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }),
  content: text('content'),
  channel: text('channel', { enum: ['web', 'telegram', 'system'] }),
  opencodeMessageId: text('opencode_message_id'),
  createdAt: text('created_at').notNull(),
})

export const memoryItems = sqliteTable('memory_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type', { enum: ['fact', 'preference', 'task_context', 'decision'] }),
  content: text('content').notNull(),
  sourceSessionId: text('source_session_id'),
  confidence: real('confidence').default(1.0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const quotaLedger = sqliteTable('quota_ledger', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  delta: integer('delta').notNull(),
  reason: text('reason'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull(),
})

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  remindAt: text('remind_at').notNull(),
  timezone: text('timezone').default('Europe/Vilnius'),
  channel: text('channel', { enum: ['telegram', 'web', 'both'] }).default('telegram'),
  status: text('status', { enum: ['scheduled', 'sent', 'cancelled'] }).default('scheduled'),
  createdAt: text('created_at').notNull(),
})

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  externalId: text('external_id'),
  title: text('title').notNull(),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  location: text('location'),
  description: text('description'),
  source: text('source').default('local'),
  createdAt: text('created_at').notNull(),
})

export const skillCatalogs = sqliteTable('skill_catalogs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type', { enum: ['git', 'json', 'zip'] }),
  sourceUrl: text('source_url'),
  status: text('status', { enum: ['active', 'disabled'] }).default('active'),
  createdAt: text('created_at').notNull(),
})

export const marketplaceSkills = sqliteTable('marketplace_skills', {
  id: text('id').primaryKey(),
  catalogId: text('catalog_id').references(() => skillCatalogs.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version'),
  author: text('author'),
  license: text('license'),
  sourceUrl: text('source_url'),
  sha256: text('sha256'),
  status: text('status', { enum: ['approved', 'rejected', 'needs_review'] }).default('needs_review'),
  scanReportJson: text('scan_report_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const userInstalledSkills = sqliteTable('user_installed_skills', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  marketplaceSkillId: text('marketplace_skill_id').references(() => marketplaceSkills.id),
  installedSlug: text('installed_slug').notNull(),
  installedPath: text('installed_path').notNull(),
  version: text('version'),
  sha256: text('sha256'),
  installedAt: text('installed_at').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
})
