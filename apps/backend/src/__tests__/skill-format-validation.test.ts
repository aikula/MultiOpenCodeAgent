import { describe, it, expect } from 'vitest'
import { validateSkillMd, formatPlainTextAsSkill } from '../services/skill-format.js'

describe('validateSkillMd', () => {
  const validSkill = `---
name: my-skill
description: A test skill
---

# My Skill

This is the skill body.
`

  it('accepts valid SKILL.md', () => {
    const result = validateSkillMd(validSkill)
    expect(result.valid).toBe(true)
    expect(result.name).toBe('my-skill')
    expect(result.description).toBe('A test skill')
    expect(result.errors).toEqual([])
  })

  it('rejects empty content', () => {
    const result = validateSkillMd('')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('empty')
  })

  it('rejects content without frontmatter', () => {
    const result = validateSkillMd('Just plain text')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('no_frontmatter')
  })

  it('rejects frontmatter without name', () => {
    const result = validateSkillMd(`---
description: has desc
---

Body text`)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'missing_name')).toBe(true)
  })

  it('rejects frontmatter without description', () => {
    const result = validateSkillMd(`---
name: my-skill
---

Body text`)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'missing_description')).toBe(true)
  })

  it('rejects invalid name format', () => {
    const result = validateSkillMd(`---
name: Invalid Name!
description: test
---

Body`)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'invalid_name')).toBe(true)
  })

  it('rejects empty body', () => {
    const result = validateSkillMd(`---
name: my-skill
description: test
---
`)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'empty_body')).toBe(true)
  })

  it('rejects content exceeding max size', () => {
    const big = `---
name: big
description: big
---

${'x'.repeat(101 * 1024)}`
    const result = validateSkillMd(big)
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('too_large')
  })

  it('rejects description over 1024 chars', () => {
    const result = validateSkillMd(`---
name: my-skill
description: ${'x'.repeat(1025)}
---

Body`)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'description_too_long')).toBe(true)
  })
})

describe('formatPlainTextAsSkill', () => {
  it('converts plain text to valid SKILL.md', () => {
    const result = formatPlainTextAsSkill('my-helper', 'Helps with tasks', 'Do the thing.')
    expect(result.valid).toBe(true)
    expect(result.normalizedContent).toContain('name: my-helper')
    expect(result.normalizedContent).toContain('Do the thing.')
  })

  it('title-cases the skill name in heading', () => {
    const result = formatPlainTextAsSkill('daily-plan', 'desc', 'text')
    expect(result.normalizedContent).toContain('# Daily Plan')
  })
})
