import type { FastifyInstance } from 'fastify'
import { eq, sql as drizzleSql } from 'drizzle-orm'
import { db, sqlite } from '../db/index.js'
import { messages, memoryItems } from '../db/schema.js'

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const { q, scope } = request.query as { q?: string; scope?: string }
    if (!q || q.trim().length === 0) return { results: [] }

    const query = q.trim()
    const results: Array<{ type: string; id: string; content: string; createdAt: string }> = []

    if (!scope || scope === 'messages' || scope === 'all') {
      try {
        const ftsQuery = query.replace(/"/g, '""')
        const rows = sqlite.prepare(`
          SELECT m.id, m.content, m.created_at
          FROM messages_fts f
          JOIN messages m ON m.rowid = f.rowid
          WHERE messages_fts MATCH ? AND f.user_id = ?
          ORDER BY rank
          LIMIT 50
        `).all(`"${ftsQuery}"`, request.user.userId)

        for (const row of rows as Array<{ id: string; content: string | null; created_at: string }>) {
          results.push({ type: 'message', id: row.id, content: row.content ?? '', createdAt: row.created_at })
        }
      } catch {
        // Fallback to LIKE search
        const msgs = db.select({ id: messages.id, content: messages.content, createdAt: messages.createdAt })
          .from(messages).where(eq(messages.userId, request.user.userId)).all()
          .filter(m => m.content?.toLowerCase().includes(query.toLowerCase()))
        for (const m of msgs.slice(0, 50)) {
          results.push({ type: 'message', id: m.id, content: m.content ?? '', createdAt: m.createdAt })
        }
      }
    }

    if (!scope || scope === 'memory' || scope === 'all') {
      const mems = db.select({ id: memoryItems.id, content: memoryItems.content, type: memoryItems.type, createdAt: memoryItems.createdAt })
        .from(memoryItems).where(eq(memoryItems.userId, request.user.userId)).all()
        .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
      for (const m of mems.slice(0, 20)) {
        results.push({ type: `memory:${m.type}`, id: m.id, content: m.content, createdAt: m.createdAt })
      }
    }

    return { query, results }
  })
}
