import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenCodeClient } from '../opencode/client.js'

describe('OpenCodeClient', () => {
  let client: OpenCodeClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
    client = new OpenCodeClient({
      baseUrl: 'http://opencode:4096',
      username: 'test',
      password: 'testpass',
    })
  })

  it('health() calls GET /global/health', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    await client.health()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://opencode:4096/global/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
      })
    )
  })

  it('listAgents() calls GET /agent (singular)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'coder', title: 'Coder' }]),
    })

    const result = await client.listAgents()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://opencode:4096/agent',
      expect.any(Object)
    )
    expect(result).toEqual([{ id: 'coder', title: 'Coder' }])
  })

  it('listSkills() calls GET /skill (singular)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await client.listSkills({ workspacePath: '/ws' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/skill?'),
      expect.any(Object)
    )
  })

  it('listCommands() calls GET /command (singular)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await client.listCommands({ workspacePath: '/ws' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/command?'),
      expect.any(Object)
    )
  })

  it('createSession() calls POST /session (singular)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'sess-123' }),
    })

    const result = await client.createSession({
      workspacePath: '/ws',
      title: 'Test',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://opencode:4096/session',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result.id).toBe('sess-123')
  })

  it('sendMessage() calls POST /session/:id/message (singular) with parts format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'm1', content: 'hi', role: 'assistant' }),
    })

    await client.sendMessage({
      workspacePath: '/ws',
      opencodeSessionId: 'sess-123',
      text: 'hello',
    })

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://opencode:4096/session/sess-123/message')

    const body = JSON.parse(call[1].body)
    expect(body.parts).toEqual([{ type: 'text', text: 'hello' }])
    expect(body.text).toBeUndefined()
    expect(body.workspace).toBeUndefined()
    expect(body.session).toBeUndefined()
  })

  it('sendMessage() omits agent when null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'm1', content: '', role: 'assistant' }),
    })

    await client.sendMessage({
      workspacePath: '/ws',
      opencodeSessionId: 's1',
      text: 'hi',
      agent: null,
      model: null,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.agent).toBeUndefined()
    expect(body.model).toBeUndefined()
  })

  it('sendMessage() includes agent when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'm1', content: '', role: 'assistant' }),
    })

    await client.sendMessage({
      workspacePath: '/ws',
      opencodeSessionId: 's1',
      text: 'hi',
      agent: 'coder',
      model: 'gpt-4',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.agent).toBe('coder')
    expect(body.model).toBe('gpt-4')
  })

  it('never calls plural endpoints', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await client.listAgents()
    await client.listSkills()
    await client.listCommands()
    await client.createSession({ workspacePath: '/ws' })

    for (const call of mockFetch.mock.calls) {
      const url = call[0] as string
      expect(url).not.toMatch(/\/(agents|skills|commands|sessions)\b/)
    }
  })
})
