import { describe, it, expect, beforeEach } from 'vitest'
import { validateSkillMd, formatPlainTextAsSkill } from '../services/skill-format.js'

describe('Skill format validation', () => {
  const validSkill = `---
name: my-skill
description: A test skill for validation
---

# My Skill

This is a valid skill body.
`

  it('accepts valid SKILL.md', () => {
    const result = validateSkillMd(validSkill)
    expect(result.valid).toBe(true)
    expect(result.name).toBe('my-skill')
    expect(result.description).toBe('A test skill for validation')
    expect(result.errors).toHaveLength(0)
  })

  it('rejects empty content', () => {
    const result = validateSkillMd('')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('empty')
  })

  it('rejects missing frontmatter', () => {
    const result = validateSkillMd('# Just a heading\nSome text.')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('no_frontmatter')
  })

  it('rejects missing name', () => {
    const content = `---
description: Has desc but no name
---

Body text.
`
    const result = validateSkillMd(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'missing_name')).toBe(true)
  })

  it('rejects invalid name format', () => {
    const content = `---
name: Invalid Name!
description: Test
---

Body.
`
    const result = validateSkillMd(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'invalid_name')).toBe(true)
  })

  it('rejects missing description', () => {
    const content = `---
name: test-skill
---

Body.
`
    const result = validateSkillMd(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'missing_description')).toBe(true)
  })

  it('rejects empty body', () => {
    const content = `---
name: test-skill
description: Test
---
`
    const result = validateSkillMd(content)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'empty_body')).toBe(true)
  })

  it('rejects content exceeding size limit', () => {
    const hugeBody = 'x'.repeat(101 * 1024)
    const content = `---
name: big-skill
description: Big
---

${hugeBody}
`
    const result = validateSkillMd(content)
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('too_large')
  })
})

describe('Text to skill formatting', () => {
  it('formats plain text into valid SKILL.md', () => {
    const result = formatPlainTextAsSkill('my-task', 'Does a thing', 'Step 1: Do something\nStep 2: Done')
    expect(result.valid).toBe(true)
    expect(result.name).toBe('my-task')
    expect(result.normalizedContent).toContain('name: my-task')
    expect(result.normalizedContent).toContain('description: Does a thing')
    expect(result.normalizedContent).toContain('Step 1: Do something')
  })

  it('rejects invalid name in format', () => {
    const result = formatPlainTextAsSkill('BAD NAME', 'desc', 'text')
    expect(result.valid).toBe(false)
  })
})
