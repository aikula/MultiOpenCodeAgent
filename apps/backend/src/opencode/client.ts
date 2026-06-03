import { env } from '../env.js'

export interface OpenCodeConfig {
  baseUrl: string
  username: string
  password: string
}

export interface HealthResult {
  status: string
}

export interface AgentInfo {
  id: string
  title: string
  source: string
}

export interface SkillInfo {
  id: string
  name: string
  description?: string
  source: string
}

export interface CommandInfo {
  id: string
  name: string
  description?: string
}

export interface OpenCodeSession {
  id: string
  title?: string
}

export interface OpenCodeMessageResult {
  messageId: string
  content: string
  role: string
}

export class OpenCodeClient {
  private baseUrl: string
  private authHeader: string

  constructor(config?: Partial<OpenCodeConfig>) {
    this.baseUrl = config?.baseUrl ?? env.OPENCODE_BASE_URL
    const username = config?.username ?? env.OPENCODE_SERVER_USERNAME
    const password = config?.password ?? env.OPENCODE_SERVER_PASSWORD
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenCode error ${res.status}: ${body}`)
    }
    return res
  }

  async health(): Promise<HealthResult> {
    const res = await this.request('/global/health')
    return res.json()
  }

  async listAgents(): Promise<AgentInfo[]> {
    try {
      const res = await this.request('/agent')
      const data = await res.json()
      return Array.isArray(data) ? data : data.agents ?? []
    } catch {
      return []
    }
  }

  async listSkills(input?: { workspacePath?: string }): Promise<SkillInfo[]> {
    try {
      const params = new URLSearchParams()
      if (input?.workspacePath) params.set('workspace', input.workspacePath)
      const qs = params.toString()
      const res = await this.request(`/skill${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      return Array.isArray(data) ? data : data.skills ?? []
    } catch {
      return []
    }
  }

  async listCommands(input?: { workspacePath?: string }): Promise<CommandInfo[]> {
    try {
      const params = new URLSearchParams()
      if (input?.workspacePath) params.set('workspace', input.workspacePath)
      const qs = params.toString()
      const res = await this.request(`/command${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      return Array.isArray(data) ? data : data.commands ?? []
    } catch {
      return []
    }
  }

  async createSession(input: { workspacePath: string; title?: string }): Promise<OpenCodeSession> {
    const res = await this.request('/session', {
      method: 'POST',
      body: JSON.stringify({
        workspace: input.workspacePath,
        title: input.title,
      }),
    })
    return res.json()
  }

  async sendMessage(input: {
    workspacePath: string
    opencodeSessionId: string
    text: string
    agent?: string | null
    model?: string | null
  }): Promise<OpenCodeMessageResult> {
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: input.text }],
    }
    if (input.agent != null) body.agent = input.agent
    if (input.model != null) body.model = input.model

    const res = await this.request(`/session/${input.opencodeSessionId}/message`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return res.json()
  }

  async forkSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<OpenCodeSession> {
    const res = await this.request(`/session/${input.opencodeSessionId}/fork`, {
      method: 'POST',
      body: JSON.stringify({ workspace: input.workspacePath }),
    })
    return res.json()
  }

  async summarizeSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<string> {
    const res = await this.request(`/session/${input.opencodeSessionId}/summarize`, {
      method: 'POST',
      body: JSON.stringify({ workspace: input.workspacePath }),
    })
    const data = await res.json()
    return data.summary ?? ''
  }
}

export const opencodeClient = new OpenCodeClient()
