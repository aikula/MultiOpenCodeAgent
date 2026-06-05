import { execFile } from 'child_process'
import { readFile, writeFile, mkdir, rm, readdir, stat, rename } from 'fs/promises'
import { type Dirent } from 'fs'
import { join } from 'path'

export async function readFileAsync(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return readFile(path, encoding)
}

export async function writeFileAsync(path: string, data: string | Buffer): Promise<void> {
  return writeFile(path, data)
}

export async function mkdirAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
  await mkdir(path, options)
}

export async function rmAsync(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
  return rm(path, options)
}

export function readdirAsync(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
export function readdirAsync(path: string, options?: { withFileTypes?: false }): Promise<string[]>
export async function readdirAsync(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | Dirent[]> {
  if (options?.withFileTypes) {
    return readdir(path, { withFileTypes: true })
  }
  return readdir(path)
}

export async function execAsync(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function commitToWorkspace(wsPath: string, message: string): Promise<void> {
  try {
    await execAsync('git', ['add', '-A'], wsPath)
    await execAsync('git', ['-c', 'user.name=MultiOpenCodeAgent', '-c', 'user.email=system@moca.local', 'commit', '--allow-empty-message', '-m', message], wsPath)
  } catch { /* nothing to commit or git not initialized */ }
}

export async function statAsync(path: string) {
  return stat(path)
}

export async function renameAsync(oldPath: string, newPath: string): Promise<void> {
  return rename(oldPath, newPath)
}

export async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += await getDirectorySize(full)
      } else if (entry.isFile()) {
        const s = await stat(full)
        total += s.size
      }
    }
  } catch { /* directory may not exist */ }
  return total
}
