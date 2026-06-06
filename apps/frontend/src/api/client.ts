const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

export class ApiError extends Error {
  status: number
  details?: any
  constructor(message: string, status: number, details?: any) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`
    if (res.status === 401 && token) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    throw new ApiError(message, res.status, data?.details)
  }

  return data
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; displayName?: string; inviteCode: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/me'),

  // Sessions
  listSessions: () => request('/sessions'),
  createSession: (title?: string) =>
    request('/sessions', { method: 'POST', body: JSON.stringify({ title }) }),
  getMessages: (sessionId: string) => request(`/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, text: string) =>
    request(`/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  setMainSession: (sessionId: string) =>
    request(`/sessions/${sessionId}/main`, { method: 'POST' }),
  forkSession: (sessionId: string) =>
    request(`/sessions/${sessionId}/fork`, { method: 'POST' }),
  deleteSession: (sessionId: string) =>
    request(`/sessions/${sessionId}`, { method: 'DELETE' }),

  // Settings
  getLoginCode: () => request('/me/login-code'),
  getSettings: () => request('/me/settings'),
  updateSettings: (data: object) =>
    request('/me/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getAgentsMd: () => request('/me/agents-md'),
  updateAgentsMd: (content: string) =>
    request('/me/agents-md', { method: 'PUT', body: JSON.stringify({ content }) }),

  // Account
  deleteAccount: (password: string) =>
    request('/me', { method: 'DELETE', body: JSON.stringify({ password }) }),

  // Skills
  listSkills: () => request('/skills'),
  createSkill: (slug: string, content: string) =>
    request('/skills', { method: 'POST', body: JSON.stringify({ slug, content }) }),
  getSkill: (slug: string) => request(`/skills/${slug}`),
  updateSkill: (slug: string, content: string) =>
    request(`/skills/${slug}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteSkill: (slug: string) =>
    request(`/skills/${slug}`, { method: 'DELETE' }),
  formatSkill: (name: string, description: string, plainText: string) =>
    request('/skills/format', { method: 'POST', body: JSON.stringify({ name, description, plainText }) }),
  uploadSkillArchive: async (file: File) => {
    const token = getToken()
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/skills/upload-archive`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    })
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
    const data = await res.json()
    if (!res.ok) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status, data?.details)
    return data
  },
  adminUploadSkillArchive: async (file: File, scope: string = 'global', targetUserId?: string) => {
    const token = getToken()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('scope', scope)
    if (targetUserId) formData.append('targetUserId', targetUserId)
    const res = await fetch(`${BASE}/admin/skills/upload-archive`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    })
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
    const data = await res.json()
    if (!res.ok) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status, data?.details)
    return data
  },
  adminSkillStartupCheck: () => request('/admin/skills/startup-check'),

  // Reminders
  listReminders: () => request('/reminders'),
  createReminder: (data: { title: string; remindAt: string; timezone?: string; channel?: string }) =>
    request('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  cancelReminder: (id: string) =>
    request(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }),

  // Calendar
  listEvents: () => request('/calendar/events'),
  createEvent: (data: { title: string; startsAt?: string; endsAt?: string; location?: string; description?: string }) =>
    request('/calendar/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteEvent: (id: string) =>
    request(`/calendar/events/${id}`, { method: 'DELETE' }),
  calendarBrief: (date?: string) =>
    request('/calendar/brief', { method: 'POST', body: JSON.stringify({ date }) }),

  // Search
  search: (q: string, scope?: string) =>
    request(`/search?q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ''}`),

  // Memory
  listMemory: () => request('/memory'),
  createMemory: (type: string, content: string) =>
    request('/memory', { method: 'POST', body: JSON.stringify({ type, content }) }),
  deleteMemory: (id: string) =>
    request(`/memory/${id}`, { method: 'DELETE' }),

  // OpenCode
  listAgents: () => request('/opencode/agents'),
  listOpenCodeSkills: () => request('/opencode/skills'),
  listCentralSkills: () => request('/opencode/central-skills'),
  listCommands: () => request('/opencode/commands-list'),

  // Admin
  adminListUsers: () => request('/admin/users'),
  adminUpdateUser: (id: string, data: object) =>
    request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminGrantQuota: (id: string, amount: number, reason: string) =>
    request(`/admin/users/${id}/quota`, { method: 'POST', body: JSON.stringify({ amount, reason }) }),
  adminAddCatalog: (name: string, sourceType: string, sourceUrl?: string) =>
    request('/skill-catalogs', { method: 'POST', body: JSON.stringify({ name, sourceType, sourceUrl }) }),

  // Admin invites
  adminListInvites: () => request('/admin/invites'),
  adminCreateInvite: (data: { label?: string; maxUses?: number; expiresAt?: string }) =>
    request('/admin/invites', { method: 'POST', body: JSON.stringify(data) }),
  adminDisableInvite: (id: string) =>
    request(`/admin/invites/${id}/disable`, { method: 'POST' }),

  // MCP status
  getMcpStatus: () => request('/opencode/mcp-status'),

  // Diagnostics
  adminDiagnostics: () => request('/admin/diagnostics'),

  // Marketplace
  listMarketplaceSkills: () => request('/marketplace/skills'),
  listInstalledSkills: () => request('/marketplace/installed'),
  installMarketplaceSkill: (catalogId: string, skillId: string) =>
    request(`/skill-catalogs/${catalogId}/skills/${skillId}/install`, { method: 'POST' }),

  // Files
  listFiles: (path: string = '') =>
    request(`/files?path=${encodeURIComponent(path)}`),

  uploadFiles: async (files: File[], destPath: string = '') => {
    const token = getToken()
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    formData.append('path', destPath)
    const res = await fetch(`${BASE}/files/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    })
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
    const data = await res.json()
    if (!res.ok) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status, data?.details)
    return data
  },

  downloadFile: async (filePath: string) => {
    const token = getToken()
    const res = await fetch(`${BASE}/files/download?path=${encodeURIComponent(filePath)}&mode=download`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    })
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
    if (!res.ok) throw new ApiError(`Download failed: ${res.status}`, res.status)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() || 'file'
    a.click()
    URL.revokeObjectURL(url)
  },

  viewFile: async (filePath: string): Promise<string> => {
    const token = getToken()
    const res = await fetch(`${BASE}/files/download?path=${encodeURIComponent(filePath)}&mode=view`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    })
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
    if (!res.ok) throw new ApiError(`View failed: ${res.status}`, res.status)
    return res.text()
  },

  deleteFile: (filePath: string) =>
    request(`/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' }),

  createDirectory: (path: string) =>
    request('/files/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),

  moveFile: (from: string, to: string) =>
    request('/files/move', { method: 'POST', body: JSON.stringify({ from, to }) }),
}
