import { describe, it, expect } from 'vitest'
import {
  getTodayDate,
  buildMeetingBrief,
  buildVoiceActionSummary,
} from '../services/manager.js'

describe('manager service', () => {
  describe('getTodayDate', () => {
    it('returns YYYY-MM-DD string', () => {
      const d = getTodayDate('Europe/Vilnius')
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('falls back to UTC for unknown timezone', () => {
      const d = getTodayDate('Not/AReal_Zone')
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('buildMeetingBrief', () => {
    it('extracts English decisions', () => {
      const notes = 'We discussed the contract. Decided that Q3 launch is fixed. Agreed that Anna owns the rollout.'
      const r = buildMeetingBrief(notes)
      expect(r.decisions.length).toBeGreaterThan(0)
      expect(r.decisions.some(d => /Q3 launch/i.test(d))).toBe(true)
    })

    it('extracts Russian decisions', () => {
      const notes = 'Решили, что запуск в Q3. Договорились, что Анна отвечает за релиз.'
      const r = buildMeetingBrief(notes)
      expect(r.decisions.some(d => /Q3/.test(d))).toBe(true)
    })

    it('extracts action items with owner and deadline', () => {
      const notes = 'Anna will prepare the report by 2026-06-15. Bob should review the spec.'
      const r = buildMeetingBrief(notes)
      expect(r.actionItems.length).toBeGreaterThan(0)
      const anna = r.actionItems.find(a => a.owner === 'Anna')
      expect(anna).toBeDefined()
      expect(anna!.deadline).toBe('2026-06-15')
    })

    it('extracts risks and follow-ups', () => {
      const notes = 'Risk: vendor delay. Follow-up: clarify contract terms with legal.'
      const r = buildMeetingBrief(notes)
      expect(r.risks.some(x => /vendor delay/i.test(x))).toBe(true)
      expect(r.followUps.length).toBeGreaterThan(0)
    })

    it('returns empty arrays for blank input', () => {
      const r = buildMeetingBrief('')
      expect(r.decisions).toEqual([])
      expect(r.actionItems).toEqual([])
      expect(r.risks).toEqual([])
      expect(r.followUps).toEqual([])
    })

    it('returns a non-empty prompt containing raw notes', () => {
      const r = buildMeetingBrief('Some raw notes here')
      expect(r.prompt.length).toBeGreaterThan(0)
      expect(r.prompt).toContain('Some raw notes here')
    })
  })

  describe('buildVoiceActionSummary', () => {
    it('detects reminder triggers in English', () => {
      const r = buildVoiceActionSummary('Remind me to call John tomorrow at 10.')
      expect(r.actions.length).toBeGreaterThan(0)
      expect(r.actions[0].kind).toBe('reminder')
    })

    it('detects task triggers in English', () => {
      const r = buildVoiceActionSummary('I need to finish the report.')
      expect(r.actions.length).toBeGreaterThan(0)
      expect(r.actions[0].kind).toBe('task')
    })

    it('detects Russian triggers', () => {
      const r = buildVoiceActionSummary('Напомни мне позвонить Ивану завтра в 10.')
      expect(r.actions.length).toBeGreaterThan(0)
    })

    it('returns empty actions for plain prose', () => {
      const r = buildVoiceActionSummary('The weather is nice today.')
      expect(r.actions.length).toBe(0)
    })

    it('handles multiple sentences', () => {
      const r = buildVoiceActionSummary('I need to review the spec. Remind me to call Anna. The sky is blue.')
      expect(r.actions.length).toBeGreaterThanOrEqual(2)
    })
  })
})
