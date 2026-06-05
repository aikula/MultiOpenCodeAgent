---
name: voice-action-summary
description: Extract actions, reminders and tasks from a voice transcript.
---

# Voice Action Summary

Use this skill when processing a voice transcript.

Return:

1. List of detected actions with kind (reminder, task, note)
2. Suggested destination for each (reminder, calendar, memory)
3. Extracted dates and deadlines if present
4. Brief summary of the non-actionable content

For each action, suggest the right destination. If transcript contains a date or time, use it.
