import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'

const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_SKILL_SIZE = 100 * 1024

export interface SkillFormatError {
  code: string
  message: string
  line?: number
}

export interface SkillFormatResult {
  valid: boolean
  name?: string
  description?: string
  errors: SkillFormatError[]
  normalizedContent?: string
}

export function validateSkillMd(content: string): SkillFormatResult {
  const errors: SkillFormatError[] = []

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: [{ code: 'empty', message: 'Skill content is empty' }] }
  }

  if (content.length > MAX_SKILL_SIZE) {
    return { valid: false, errors: [{ code: 'too_large', message: `Skill content exceeds ${MAX_SKILL_SIZE / 1024}KB limit` }] }
  }

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    return { valid: false, errors: [{ code: 'no_frontmatter', message: 'Missing YAML frontmatter (--- ... ---)', line: 1 }] }
  }

  const frontmatter = fmMatch[1]
  const body = content.slice(fmMatch[0].length).trim()

  let name: string | undefined
  let description: string | undefined

  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = nameMatch[1].trim()
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = descMatch[1].trim()
  }

  if (!name) {
    errors.push({ code: 'missing_name', message: 'Frontmatter must contain "name" field', line: 2 })
  } else if (!SKILL_NAME_RE.test(name)) {
    errors.push({ code: 'invalid_name', message: `Name "${name}" must match ${SKILL_NAME_RE.source}`, line: 2 })
  }

  if (!description) {
    errors.push({ code: 'missing_description', message: 'Frontmatter must contain "description" field', line: 3 })
  } else if (description.length === 0) {
    errors.push({ code: 'empty_description', message: 'Description must not be empty', line: 3 })
  } else if (description.length > 1024) {
    errors.push({ code: 'description_too_long', message: 'Description must be <= 1024 characters', line: 3 })
  }

  if (body.length === 0) {
    errors.push({ code: 'empty_body', message: 'Skill body (after frontmatter) must not be empty' })
  }

  if (errors.length > 0) {
    return { valid: false, name, description, errors }
  }

  return { valid: true, name, description, errors: [], normalizedContent: content }
}

export function formatPlainTextAsSkill(name: string, description: string, plainText: string): SkillFormatResult {
  const content = `---
name: ${name}
description: ${description}
---

# ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

${plainText.trim()}
`
  return validateSkillMd(content)
}
