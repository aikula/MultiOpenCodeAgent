---
name: meeting-brief
description: Prepare a structured meeting brief from raw notes, agenda items, or a transcript. Use when a manager pastes meeting notes, /meeting, or asks for a summary of what was decided.
---

# Meeting Brief

Use this skill to turn scattered meeting notes or transcripts into a clear, structured brief that participants can review before or after the meeting.

## Input

The orchestrator may provide:

- **Pre-extracted decisions** — candidate strings starting with "decided/agreed/решили" etc.
- **Pre-extracted action items** — task, owner, deadline candidates from "will/should/должен" patterns.
- **Pre-extracted risks** — candidates from "risk/concern/риск" markers.
- **Pre-extracted follow-ups** — open questions and TODOs.
- **Raw notes** — original text.

Verify the pre-extracted list, fix misattributed owners, and add anything missing.

## Output format

1. **Meeting overview** — infer title, date, purpose, and key participants from the notes.
2. **Discussion points** — numbered list of major topics, one or two sentences each.
3. **Decisions made** — bullet list with owner when known.
4. **Action items** — markdown table with columns: task, owner, deadline.
5. **Risks** — list of explicit and implicit risks.
6. **Open items** — unresolved questions or topics tabled for follow-up.

## Guidelines

- Distinguish clearly between decisions and opinions.
- If an action item lacks an owner or deadline, flag it explicitly with `[owner: ?]` or `[deadline: ?]`.
- Do not invent information that is missing from the input.
- Use markdown tables for action items so they render in Telegram and Web UI.
- Reply in the user's configured language (default Russian).
