import { FastifyInstance } from 'fastify'
import { createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { join, basename, resolve } from 'path'
import { getWorkspace } from '../services/workspace.js'
import { assertInsideWorkspace } from '../services/workspace.js'
import { statAsync, renameAsync, getDirectorySize, mkdirAsync, rmAsync, readdirAsync, commitToWorkspace } from '../lib/async-fs.js'
import { getMimeType } from '../lib/mime-types.js'
import { env } from '../env.js'

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.dll', '.so', '.sh',
  '.php', '.py', '.pl', '.rb', '.jar', '.class',
])

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
  return basename(cleaned)
}

function isBlockedExtension(filename: string): boolean {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0) return false
  const ext = filename.slice(dotIndex).toLowerCase()
  return BLOCKED_EXTENSIONS.has(ext)
}

function filesDir(wsPath: string): string {
  return join(wsPath, 'files')
}

export async function fileRoutes(app: FastifyInstance) {

  // GET /api/files?path=
  app.get('/api/files', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return { path: '', entries: [] }

    const relPath = (request.query as { path?: string }).path ?? ''
    const dir = filesDir(ws.path)
    const resolved = resolve(dir, relPath)
    assertInsideWorkspace(ws.path, resolved)

    try {
      const s = await statAsync(resolved)
      if (!s.isDirectory()) {
        return {
          path: relPath,
          entries: [{ name: basename(resolved), type: 'file', size: s.size, modifiedAt: s.mtime.toISOString() }],
        }
      }
    } catch {
      return { path: relPath, entries: [] }
    }

    const entries = await readdirAsync(resolved, { withFileTypes: true })
    const result = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      try {
        const full = join(resolved, entry.name)
        const st = await statAsync(full)
        result.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? st.size : 0,
          modifiedAt: st.mtime.toISOString(),
        })
      } catch { /* skip broken entries */ }
    }
    return { path: relPath, entries: result }
  })

  // POST /api/files/upload
  app.post('/api/files/upload', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const dir = filesDir(ws.path)
    await mkdirAsync(dir, { recursive: true })

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'No file provided' })

    const destRelPath = (data.fields as any)?.path?.value ?? ''
    const destDir = resolve(dir, destRelPath)
    assertInsideWorkspace(ws.path, destDir)
    await mkdirAsync(destDir, { recursive: true })

    const filename = sanitizeFilename(data.filename)
    if (isBlockedExtension(filename)) {
      return reply.status(400).send({ error: `File type not allowed: ${filename}` })
    }

    const destPath = join(destDir, filename)
    assertInsideWorkspace(ws.path, destPath)

    const currentSize = await getDirectorySize(dir)
    if (currentSize + (data.fields as any)?.size?.value > env.MAX_USER_STORAGE_BYTES) {
      return reply.status(413).send({ error: 'Storage quota exceeded' })
    }

    await pipeline(data.file, createWriteStream(destPath))
    await commitToWorkspace(ws.path, `Upload file: ${join(destRelPath, filename)}`)

    const st = await statAsync(destPath)
    return { uploaded: [{ name: filename, size: st.size, path: join(destRelPath, filename) }] }
  })

  // GET /api/files/download?path=&mode=
  app.get('/api/files/download', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const { path: relPath, mode } = request.query as { path?: string; mode?: string }
    if (!relPath) return reply.status(400).send({ error: 'path is required' })

    const resolved = resolve(filesDir(ws.path), relPath)
    assertInsideWorkspace(ws.path, resolved)

    let st
    try {
      st = await statAsync(resolved)
      if (!st.isFile()) return reply.status(400).send({ error: 'Not a file' })
    } catch {
      return reply.status(404).send({ error: 'File not found' })
    }

    const mime = getMimeType(relPath)
    const filename = basename(resolved)
    const disposition = mode === 'view' ? 'inline' : 'attachment'

    reply.header('Content-Type', mime)
    reply.header('Content-Length', st.size)
    reply.header('Content-Disposition', `${disposition}; filename="${filename}"`)
    return reply.send(createReadStream(resolved))
  })

  // DELETE /api/files?path=
  app.delete('/api/files', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const relPath = (request.query as { path?: string }).path
    if (!relPath) return reply.status(400).send({ error: 'path is required' })

    const resolved = resolve(filesDir(ws.path), relPath)
    assertInsideWorkspace(ws.path, resolved)

    try {
      const st = await statAsync(resolved)
      await rmAsync(resolved, { recursive: st.isDirectory(), force: true })
      await commitToWorkspace(ws.path, `Delete: ${relPath}`)
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }

    return { ok: true }
  })

  // POST /api/files/mkdir
  app.post('/api/files/mkdir', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const { path: relPath } = request.body as { path?: string }
    if (!relPath) return reply.status(400).send({ error: 'path is required' })

    const resolved = resolve(filesDir(ws.path), relPath)
    assertInsideWorkspace(ws.path, resolved)

    await mkdirAsync(resolved, { recursive: true })
    await commitToWorkspace(ws.path, `Create directory: ${relPath}`)

    return { ok: true, path: relPath }
  })

  // POST /api/files/move
  app.post('/api/files/move', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const ws = getWorkspace(request.user.userId)
    if (!ws) return reply.status(400).send({ error: 'No workspace' })

    const { from, to } = request.body as { from?: string; to?: string }
    if (!from || !to) return reply.status(400).send({ error: 'from and to are required' })

    const dir = filesDir(ws.path)
    const resolvedFrom = resolve(dir, from)
    const resolvedTo = resolve(dir, to)
    assertInsideWorkspace(ws.path, resolvedFrom)
    assertInsideWorkspace(ws.path, resolvedTo)

    await renameAsync(resolvedFrom, resolvedTo)
    await commitToWorkspace(ws.path, `Move: ${from} -> ${to}`)

    return { ok: true }
  })
}
