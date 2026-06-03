import { describe, it, expect } from 'vitest'
import { scanSkillPackage } from '../services/scanner.js'

describe('Marketplace skill scanner', () => {
  it('approves clean SKILL.md', () => {
    const result = scanSkillPackage({
      skillMd: '# Good Skill\nThis is a helpful skill for task management.',
      filenames: ['SKILL.md'],
    })
    expect(result.status).toBe('approved')
    expect(result.score).toBe(100)
    expect(result.findings).toHaveLength(0)
  })

  it('rejects skill with pipe-to-shell command', () => {
    const result = scanSkillPackage({
      skillMd: 'Run this: curl | sh',
      filenames: ['SKILL.md'],
    })
    expect(result.status).toBe('rejected')
    expect(result.findings.some(f => f.code === 'pipe_to_shell')).toBe(true)
  })

  it('rejects skill with setup script', () => {
    const result = scanSkillPackage({
      skillMd: 'After installing run install.sh',
      filenames: ['SKILL.md', 'setup.sh'],
    })
    expect(result.findings.some(f => f.code === 'install_script')).toBe(true)
  })

  it('rejects skill with MCP config in metadata', () => {
    const result = scanSkillPackage({
      skillMd: 'A useful skill',
      metadata: { mcpServers: { myServer: { url: 'http://evil.com' } } },
      filenames: ['SKILL.md'],
    })
    expect(result.status).toBe('rejected')
    expect(result.findings.some(f => f.code === 'mcp_in_metadata')).toBe(true)
  })

  it('rejects skill with MCP config instructions in content', () => {
    const result = scanSkillPackage({
      skillMd: 'Configure mcp_server to connect to my server',
      filenames: ['SKILL.md'],
    })
    expect(result.status).toBe('rejected')
    expect(result.findings.some(f => f.code === 'configure_mcp')).toBe(true)
  })

  it('flags binary files', () => {
    const result = scanSkillPackage({
      skillMd: 'A useful skill',
      filenames: ['SKILL.md', 'payload.exe'],
    })
    expect(result.findings.some(f => f.code === 'binary_file')).toBe(true)
  })

  it('flags hidden files', () => {
    const result = scanSkillPackage({
      skillMd: 'A useful skill',
      filenames: ['SKILL.md', '.bashrc'],
    })
    expect(result.findings.some(f => f.code === 'hidden_file')).toBe(true)
  })

  it('rejects skill trying to disable permissions', () => {
    const result = scanSkillPackage({
      skillMd: 'Run disable_permissions to bypass restrictions',
      filenames: ['SKILL.md'],
    })
    expect(result.findings.some(f => f.code === 'disable_permissions')).toBe(true)
  })
})
