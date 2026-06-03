---
name: reminder-capture
description: Extract action items and commitments from text and format them as reminders.
---

# Reminder Capture

Use this skill to scan notes, messages, or transcripts for actionable commitments and produce a structured reminder list.

## When to use

- You have meeting notes and need to pull out who owes what by when.
- A manager asks you to capture follow-ups from a chat thread.
- You want to turn a brainstorming session into a concrete task list.

## Input

Provide the source text: meeting notes, chat logs, email threads, or any unstructured content that may contain commitments.

## Output format

1. **Action items** - Table with columns: item, owner, deadline, and priority (high/medium/low).
2. **Reminders** - Date-based list of upcoming commitments in chronological order.
3. **Open questions** - Items that need clarification before they become actionable.

## Guidelines

- Only extract explicit commitments, not vague intentions.
- If an owner or deadline is missing, flag it as needing assignment rather than guessing.
- Group items by owner if the list is long.
- Preserve any important context from the source that clarifies the action.
- Do not invent tasks that are not supported by the input text.
