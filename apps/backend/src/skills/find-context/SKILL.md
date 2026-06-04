---
name: find-context
description: Search the user's prior messages and memory for context on a topic. Use when a manager asks /find, "what did we decide about X", or wants to recall prior discussion.
---

# Find Context

Use this skill when the manager asks to recall prior decisions, discussions, or context. The orchestrator has already searched the user's FTS5-indexed message history and memory table and will pass you the matches.

## Input

- **Query** — the search term the manager used.
- **Matching messages** — up to 20 prior user/assistant messages, ranked by FTS5 relevance, with date and session id.
- **Matching memory items** — saved facts, preferences, and decisions that contain the query.

## Output format

1. **Direct answer** — one or two sentences summarising the prior context.
2. **Relevant prior decisions** — bullet list with date and one-line summary.
3. **Open follow-ups** — items mentioned in prior context that are still unresolved.
4. **Source quotes** — verbatim short quotes (≤120 chars) with date and channel (web/telegram) for verification.
5. **No-match fallback** — if no matches exist, say so explicitly. Do not fabricate.

## Guidelines

- Quote the source message date and channel if quoting.
- Distinguish between something the manager said and something the agent said.
- If multiple sessions touched the topic, mention the date range.
- Reply in the user's configured language (default Russian).
- Never expose raw user IDs or internal session IDs in the reply.
