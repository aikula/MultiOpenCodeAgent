export interface User {
  id: string
  email: string
  displayName: string | null
  role: 'user' | 'admin'
  status: 'active' | 'blocked' | 'pending'
  defaultAgent: string | null
  defaultModel: string | null
  language: string
  responseStyle: string
  dailyQuotaLimit: number
  createdAt: string
}

export interface Workspace {
  id: string
  userId: string
  path: string
  status: string
  createdAt: string
}

export interface Session {
  id: string
  userId: string
  workspaceId: string
  opencodeSessionId: string
  title: string | null
  isMain: boolean
  source: 'web' | 'telegram' | 'system'
  status: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  userId: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  channel: 'web' | 'telegram' | 'system'
  opencodeMessageId: string | null
  createdAt: string
}

export interface Reminder {
  id: string
  userId: string
  title: string
  description: string | null
  remindAt: string
  timezone: string
  channel: 'telegram' | 'web' | 'both'
  status: 'scheduled' | 'sent' | 'cancelled'
  createdAt: string
}

export interface CalendarEvent {
  id: string
  userId: string
  title: string
  startsAt: string | null
  endsAt: string | null
  location: string | null
  description: string | null
  source: string
  createdAt: string
}
