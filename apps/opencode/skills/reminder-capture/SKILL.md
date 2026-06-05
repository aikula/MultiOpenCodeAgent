---
name: reminder-capture
description: Capture a reminder from natural language and confirm creation to the user.
---

# Reminder Capture

Use this skill when the user asks to be reminded of something.

The action router handles actual reminder creation. Your job is to:

1. Confirm the reminder was created (title, time)
2. Suggest any related actions (calendar event, follow-up)
3. Keep confirmation brief

Do not ask the user to use /remind. The reminder is already created.
