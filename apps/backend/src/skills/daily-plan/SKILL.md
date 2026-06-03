---
name: daily-plan
description: Generate a structured daily plan that prioritizes tasks and allocates time blocks.
---

# Daily Plan

Use this skill to organize a manager's day by turning a task list into a time-blocked plan with clear priorities.

## When to use

- A manager shares their to-do list and asks for a daily schedule.
- You need to organize competing priorities into a realistic plan.
- Someone wants help structuring their workday for maximum focus.

## Input

Provide the list of tasks, any fixed commitments (meetings, calls), preferred working hours, and energy-level preferences if known.

## Output format

1. **Top priorities** - Up to three tasks that must get done today.
2. **Time-blocked schedule** - Table with time slot, activity, and duration.
3. **Buffer slots** - Explicit gaps for unexpected requests or overflow.
4. **Carry-over items** - Tasks deferred to the next day with a brief reason.

## Guidelines

- Schedule demanding tasks during high-energy hours when possible.
- Protect at least one 60-minute deep-work block.
- Limit the plan to eight hours of working time.
- If the task list exceeds capacity, flag the conflict and suggest trade-offs.
- Do not double-book fixed commitments.
