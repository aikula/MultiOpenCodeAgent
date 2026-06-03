import { execFile } from 'child_process'
import { readFile, writeFile, mkdir, rm, readdir } from 'fs/promises'
import { join } from 'path'

export async function readFileAsync(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return readFile(path, encoding)
}

export async function writeFileAsync(path: string, data: string | Buffer): Promise<void> {
  return writeFile(path, data)
}

export async function mkdirAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
  return mkdir(path, options)
}

export async function rmAsync(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
  return rm(path, options)
}

export async function readdirAsync(path: string, options?: { withFileTypes?: boolean }) {
  return readdir(path, options)
}

export async function execAsync(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, stdio: 'pipe' }, (err) => {
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
