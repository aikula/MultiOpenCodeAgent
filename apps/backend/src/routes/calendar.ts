import type { FastifyInstance } from 'fastify'
import { eq, and, sql as drizzleSql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { calendarEvents, sessions, workspaces } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { createCalendarEventSchema } from '@moca/shared/validation'

export async function calendarRoutes(app: FastifyInstance) {
  app.get('/api/calendar/events', {
    preHandler: [app.authenticate],
  }, async (request) => {
    return db.select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, request.user.userId))
      .all()
  })

  app.post('/api/calendar/events', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const body = createCalendarEventSchema.parse(request.body)
    const id = uuid()
    const now = new Date().toISOString()

    db.insert(calendarEvents).values({
      id,
      userId: request.user.userId,
      title: body.title,
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      location: body.location ?? null,
      description: body.description ?? null,
      source: 'local',
      createdAt: now,
    }).run()

    return { id, title: body.title }
  })

  app.patch('/api/calendar/events/:id', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { id } = request.params as { id: string }
    const body = request.body as Record<string, any>

    const existing = db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get()
    if (!existing || existing.userId !== request.user.userId) {
      return { error: 'Not found' }
    }

    db.update(calendarEvents)
      .set(body)
      .where(eq(calendarEvents.id, id))
      .run()

    return { ok: true }
  })

  app.delete('/api/calendar/events/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get()
    if (!existing || existing.userId !== request.user.userId) {
      return reply.status(404).send({ error: 'Not found' })
    }

    db.delete(calendarEvents).where(eq(calendarEvents.id, id)).run()
    return { ok: true }
  })

  app.post('/api/calendar/brief', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { date } = request.body as { date?: string }
    const targetDate = date ?? new Date().toISOString().split('T')[0]

    const events = db.select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, request.user.userId),
          drizzleSql`date(${calendarEvents.startsAt}) = ${targetDate}`,
        )
      )
      .all()

    const ws = getWorkspace(request.user.userId)
    let brief = `Calendar brief for ${targetDate}:\n\n`
    if (events.length === 0) {
      brief += 'No events scheduled.\n'
    } else {
      for (const ev of events) {
        brief += `- ${ev.startsAt ?? 'No time'}: ${ev.title}`
        if (ev.location) brief += ` @ ${ev.location}`
        brief += '\n'
      }
    }

    const conflictPairs: Array<{ a: string; b: string }> = []
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        if (events[i].startsAt && events[j].startsAt && events[i].endsAt && events[j].endsAt) {
          if (events[i].startsAt! < events[j].endsAt! && events[j].startsAt! < events[i].endsAt!) {
            conflictPairs.push({ a: events[i].title, b: events[j].title })
          }
        }
      }
    }

    if (conflictPairs.length > 0) {
      brief += '\nConflicts:\n'
      for (const c of conflictPairs) {
        brief += `  ${c.a} overlaps with ${c.b}\n`
      }
    }

    return { date: targetDate, events, conflictPairs, brief }
  })
}
