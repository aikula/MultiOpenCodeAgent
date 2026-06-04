---
name: daily-plan
description: Generate a structured daily plan that prioritizes tasks and allocates time blocks. Use when a manager asks for a daily plan, /daily, or wants to organise their day from calendar, reminders, and memory.
---

# Daily Plan

Use this skill to organise a manager's day by turning their real context into a time-blocked plan with clear priorities.

## Input

The orchestrator will pass a context block with:

- **Calendar events for today** — title, start/end time, location
- **Pending reminders** — title, scheduled time
- **Memory items** — recent facts, preferences, and decisions
- **Recent messages** — last few user/assistant turns for continuity
- **Conflict detection** — pairs of overlapping events

If any section is empty, treat it as "no input here" rather than missing data.

## Output format

1. **Top priorities** — up to three tasks that must get done today.
2. **Time-blocked schedule** — table with time slot, activity, and duration. Build it around the existing calendar events.
3. **Buffer slots** — explicit gaps for unexpected requests or overflow.
4. **Carry-over items** — tasks deferred to the next day with a brief reason.
5. **Risks & trade-offs** — if capacity is exceeded, list the trade-offs the manager should choose between.

## Guidelines

- Protect at least one 60-minute deep-work block.
- Schedule demanding tasks during high-energy hours when possible.
- Limit the working plan to eight hours unless the manager explicitly asks for more.
- Never double-book an existing calendar event — surface the conflict instead.
- If a calendar conflict was pre-detected, suggest a concrete resolution (reorder, shorten, delegate).
- Prefer markdown tables for the schedule so it renders cleanly in Telegram and Web UI.
- Reply in the user's configured language (default Russian).
