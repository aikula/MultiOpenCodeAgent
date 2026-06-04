---
name: voice-action-summary
description: Extract action items, reminders, and notes from a voice transcript. Use when a manager sends voice-to-text or uses /voice with a transcript.
---

# Voice Action Summary

Use this skill when a manager sends a voice message that has been transcribed to text. The orchestrator has pre-detected candidate actions using keyword triggers and will pass them to you.

## Input

- **Transcript** — full text from STT.
- **Pre-extracted candidates** — list of {kind, text} where kind is reminder, task, or note.

## Output format

1. **Detected actions** — numbered list with kind, suggested destination (reminder / calendar / memory), and the original text.
2. **Context summary** — one paragraph summarising what the voice message was about.
3. **Suggested follow-ups** — explicit reminders to create or calendar events to add, e.g. `Suggest: /remind in 30m call back`.

## Guidelines

- Be conservative: only mark an action as `reminder` if the transcript contains an explicit time reference or trigger phrase.
- If no time reference is present, prefer `task` or `note`.
- Do not invent actions that are not in the transcript.
- Reply in the user's configured language (default Russian).
- Keep the output short — under 300 words.
