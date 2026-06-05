import { env } from '../env.js'

export interface OpenCodeConfig {
  baseUrl: string
  username: string
  password: string
}

export interface HealthResult {
  healthy: boolean
  version: string
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
      const res = await this.request('/command')
      const data = await res.json()
      return Array.isArray(data) ? data : data.commands ?? []
    } catch {
      return []
    }
  }

  async listCommands(input?: { workspacePath?: string }): Promise<CommandInfo[]> {
    try {
      const res = await this.request('/command')
      const data = await res.json()
      return Array.isArray(data) ? data : data.commands ?? []
    } catch {
      return []
    }
  }

  async createSession(input: { workspacePath: string; title?: string }): Promise<OpenCodeSession> {
    // OpenCode API: POST /session with { title?, directory? }
    // `directory` scopes the session's bash tool to that path (built-in isolation,
    // no MCP required).
    const body: Record<string, unknown> = {}
    if (input.title) body.title = input.title
    if (input.workspacePath) body.directory = input.workspacePath

    const res = await this.request('/session', {
      method: 'POST',
      body: JSON.stringify(body),
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

    const data = await res.json() as {
      info: { id: string; role: string; error?: { data?: { message?: string } } }
      parts: Array<{ type: string; text?: string }>
    }

    // Check for error in response
    if (data.info?.error?.data?.message) {
      throw new Error(data.info.error.data.message)
    }

    const textParts = data.parts
      ?.filter((p: any) => p.type === 'text' && p.text)
      .map((p: any) => p.text)
      .join('\n') ?? ''

    return {
      messageId: data.info?.id ?? '',
      content: textParts,
      role: data.info?.role ?? 'assistant',
    }
  }

  async forkSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<OpenCodeSession> {
    const res = await this.request(`/session/${input.opencodeSessionId}/fork`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return res.json()
  }

  async summarizeSession(input: { workspacePath: string; opencodeSessionId: string }): Promise<string> {
    const res = await this.request(`/session/${input.opencodeSessionId}/summarize`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return data.summary ?? ''
  }
}

export const opencodeClient = new OpenCodeClient()
