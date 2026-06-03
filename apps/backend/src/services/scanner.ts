import type { SkillScanResult, SkillScanStatus } from './scanner.js'

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; severity: 'low' | 'medium' | 'high' | 'critical'; code: string; message: string }> = [
  { pattern: /curl\s+\|\s*sh|wget\s+\|\s*sh/, severity: 'critical', code: 'pipe_to_shell', message: 'Skill contains pipe-to-shell command.' },
  { pattern: /rm\s+-rf\s+\//, severity: 'critical', code: 'destructive_rm', message: 'Skill contains destructive rm command.' },
  { pattern: /chmod\s+\+x/, severity: 'high', code: 'chmod_exec', message: 'Skill attempts to make files executable.' },
  { pattern: /\.env|PRIVATE_KEY|SECRET_TOKEN|private.key/i, severity: 'high', code: 'references_secrets', message: 'Skill references secrets or private keys.' },
  { pattern: /disable.?permissions|bypass.?auth/, severity: 'high', code: 'disable_permissions', message: 'Skill tries to disable permissions.' },
  { pattern: /~\/\.config\/opencode/, severity: 'high', code: 'modify_global_config', message: 'Skill tries to modify global OpenCode config.' },
  { pattern: /edit\s+AGENTS\.md/i, severity: 'medium', code: 'edit_agents_md', message: 'Skill tries to edit AGENTS.md without explicit request.' },
  { pattern: /mcp_server|mcp\.config|configureMCP/i, severity: 'critical', code: 'configure_mcp', message: 'Skill tries to configure MCP servers.' },
  { pattern: /install\.sh|setup\.sh|postinstall/i, severity: 'high', code: 'install_script', message: 'Skill contains install/setup scripts.' },
  { pattern: /\.\.\//, severity: 'medium', code: 'path_traversal', message: 'Skill contains path traversal pattern.' },
]

export interface SkillScanFinding {
  severity: 'low' | 'medium' | 'high' | 'critical'
  code: string
  message: string
}

export type SkillScanStatus = 'approved' | 'needs_review' | 'rejected'

export interface SkillScanResult {
  status: SkillScanStatus
  score: number
  findings: SkillScanFinding[]
}

export function scanSkillPackage(input: {
  skillMd: string
  metadata?: Record<string, any>
  filenames?: string[]
}): SkillScanResult {
  const findings: SkillScanFinding[] = []
  let score = 100

  // Scan SKILL.md content
  for (const rule of UNSAFE_PATTERNS) {
    if (rule.pattern.test(input.skillMd)) {
      findings.push({ severity: rule.severity, code: rule.code, message: rule.message })
      const deduction = rule.severity === 'critical' ? 40 : rule.severity === 'high' ? 25 : 10
      score -= deduction
    }
  }

  // Check filenames for binary or hidden files
  if (input.filenames) {
    for (const name of input.filenames) {
      if (name.endsWith('.exe') || name.endsWith('.bin') || name.endsWith('.so')) {
        findings.push({ severity: 'critical', code: 'binary_file', message: `Binary file detected: ${name}` })
        score -= 40
      }
      if (name.startsWith('.') && name !== '.metadata.json') {
        findings.push({ severity: 'medium', code: 'hidden_file', message: `Hidden file detected: ${name}` })
        score -= 10
      }
    }
  }

  // Check metadata for MCP config
  if (input.metadata?.mcp || input.metadata?.mcpServers) {
    findings.push({ severity: 'critical', code: 'mcp_in_metadata', message: 'Metadata contains MCP configuration.' })
    score -= 40
  }

  score = Math.max(0, score)

  let status: SkillScanStatus
  if (score >= 80 && !findings.some(f => f.severity === 'critical')) {
    status = 'approved'
  } else if (score >= 40 && !findings.some(f => f.severity === 'critical')) {
    status = 'needs_review'
  } else {
    status = 'rejected'
  }

  return { status, score, findings }
}
