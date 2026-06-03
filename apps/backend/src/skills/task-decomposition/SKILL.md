---
name: task-decomposition
description: Break a complex task into manageable subtasks with clear dependencies and estimates.
---

# Task Decomposition

Use this skill to take a large or ambiguous task and split it into concrete, actionable subtasks that a team can execute.

## When to use

- A manager describes a high-level goal and needs an execution plan.
- A project feels overwhelming and needs to be broken into manageable pieces.
- You need to estimate effort and identify critical-path items.

## Input

Provide the task description, any known constraints (deadline, budget, team size), and the desired level of granularity.

## Output format

1. **Goal statement** - One-sentence rephrasing of the objective to confirm understanding.
2. **Subtask list** - Numbered items, each with a title, description (one to two sentences), estimated effort (small/medium/large), and owner if known.
3. **Dependency map** - Plain-text description of which subtasks block others.
4. **Critical path** - The sequence of subtasks that determines the minimum timeline.
5. **Quick wins** - Subtasks that can be completed immediately to build momentum.

## Guidelines

- Each subtask should be completable in one to two days of focused work.
- If a subtask is still ambiguous, decompose it further rather than leaving it vague.
- Distinguish between must-have and nice-to-have subtasks.
- Avoid creating more than 12 subtasks; group related work if necessary.
