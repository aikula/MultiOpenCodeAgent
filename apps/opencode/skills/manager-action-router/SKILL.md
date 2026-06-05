---
name: manager-action-router
description: Route a manager message to the appropriate action handler based on intent.
---

# Manager Action Router

Use this skill when the user message contains multiple intents or needs action routing.

Analyze the message for:

1. Reminder requests (напомни, remind)
2. Calendar requests (встреча, meeting, schedule)
3. Search requests (найди, find)
4. Planning requests (план, plan)
5. Summary requests (саммари, brief)
6. Decision requests (решение, decision)
7. Email requests (письмо, email)
8. Risk requests (риск, risk)

For each detected intent, execute or suggest the corresponding action.
For composite requests, handle each intent and combine results.

Do not tell the user to use slash commands or open other pages. Execute directly.
