import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'

interface FileEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isTextFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.yaml', '.yml', '.toml', '.ini', '.log', '.env'].includes(ext)
}

export function FilesPage() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [viewingFile, setViewingFile] = useState<{ name: string; content: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const data = await api.listFiles(path)
      setEntries(data.entries || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(currentPath) }, [currentPath, load])

  const navigate = (path: string) => {
    setCurrentPath(path)
    setDeleteConfirm(null)
    setViewingFile(null)
  }

  const pathSegments = currentPath.split('/').filter(Boolean)

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      await api.uploadFiles(Array.from(files), currentPath)
      await load(currentPath)
    } catch (err: any) {
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }, [currentPath])

  const handleDelete = async (path: string) => {
    try {
      await api.deleteFile(path)
      setDeleteConfirm(null)
      await load(currentPath)
    } catch (err: any) {
      alert(err.message || 'Delete failed')
    }
  }

  const handleView = async (entry: FileEntry) => {
    const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
    try {
      const content = await api.viewFile(filePath)
      setViewingFile({ name: entry.name, content })
    } catch (err: any) {
      alert(err.message || 'Failed to view file')
    }
  }

  const handleDownload = async (entry: FileEntry) => {
    const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
    await api.downloadFile(filePath)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    const path = currentPath ? `${currentPath}/${newFolderName.trim()}` : newFolderName.trim()
    try {
      await api.createDirectory(path)
      setShowNewFolder(false)
      setNewFolderName('')
      await load(currentPath)
    } catch (err: any) {
      alert(err.message || 'Failed to create folder')
    }
  }

  const handleRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) { setRenaming(null); return }
    const from = currentPath ? `${currentPath}/${oldName}` : oldName
    const to = currentPath ? `${currentPath}/${renameValue.trim()}` : renameValue.trim()
    try {
      await api.moveFile(from, to)
      setRenaming(null)
      await load(currentPath)
    } catch (err: any) {
      alert(err.message || 'Rename failed')
    }
  }

  return (
    <div
      className="max-w-4xl mx-auto p-6"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Files</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFolder(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            + Folder
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4 text-gray-600">
        <button onClick={() => navigate('')} className="hover:text-blue-600">root</button>
        {pathSegments.map((seg, i) => {
          const path = pathSegments.slice(0, i + 1).join('/')
          return (
            <span key={path} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => navigate(path)} className="hover:text-blue-600">{seg}</button>
            </span>
          )
        })}
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
            autoFocus
          />
          <button onClick={handleCreateFolder} className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm">Create</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} className="text-sm text-gray-500">Cancel</button>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-50 bg-opacity-80 flex items-center justify-center z-10 border-2 border-dashed border-blue-400 rounded-lg">
          <p className="text-blue-600 font-medium text-lg">Drop files here</p>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-500 text-sm">No files. Upload or drag files here.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {currentPath && (
            <button
              onClick={() => navigate(pathSegments.slice(0, -1).join('/'))}
              className="w-full text-left px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-3"
            >
              <span>..</span>
              <span>Back</span>
            </button>
          )}
          {entries.map((entry) => {
            const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
            return (
              <div key={entry.name} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-lg">{entry.type === 'directory' ? '📁' : '📄'}</span>
                  {renaming === entry.name ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(entry.name)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={() => setRenaming(null)}
                      className="border border-blue-400 rounded px-2 py-0.5 text-sm flex-1"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => entry.type === 'directory' ? navigate(entryPath) : undefined}
                      className={`text-sm truncate ${entry.type === 'directory' ? 'text-blue-600 hover:underline' : 'text-gray-900'}`}
                    >
                      {entry.name}
                    </button>
                  )}
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {entry.type === 'file' && formatSize(entry.size)}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {entry.type === 'file' && isTextFile(entry.name) && (
                    <button onClick={() => handleView(entry)} className="text-xs px-2 py-1 text-gray-500 hover:text-blue-600">View</button>
                  )}
                  {entry.type === 'file' && (
                    <button onClick={() => handleDownload(entry)} className="text-xs px-2 py-1 text-gray-500 hover:text-green-600">Download</button>
                  )}
                  <button
                    onClick={() => { setRenaming(entry.name); setRenameValue(entry.name) }}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-blue-600"
                  >
                    Rename
                  </button>
                  {deleteConfirm === entryPath ? (
                    <span className="flex items-center gap-1">
                      <button onClick={() => handleDelete(entryPath)} className="text-xs px-2 py-1 text-red-600">Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setDeleteConfirm(entryPath)} className="text-xs px-2 py-1 text-gray-500 hover:text-red-600">Delete</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* File viewer modal */}
      {viewingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-8">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-medium">{viewingFile.name}</h3>
              <button onClick={() => setViewingFile(null)} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>
            <pre className="p-4 overflow-auto flex-1 text-sm font-mono whitespace-pre-wrap break-all">
              {viewingFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
