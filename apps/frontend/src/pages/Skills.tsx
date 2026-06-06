import { useState, useEffect, useRef } from 'react'
import { api, ApiError } from '../api/client'

interface Skill {
  slug: string
  source: string
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [newSlug, setNewSlug] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Format as Skill
  const [showFormat, setShowFormat] = useState(false)
  const [fmtName, setFmtName] = useState('')
  const [fmtDesc, setFmtDesc] = useState('')
  const [fmtText, setFmtText] = useState('')

  // ZIP upload
  const zipRef = useRef<HTMLInputElement>(null)
  const [uploadResult, setUploadResult] = useState<{ installed: string[]; rejected: string[] } | null>(null)

  const load = async () => {
    const data = await api.listSkills()
    setSkills(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  const clearMessages = () => { setError(''); setSuccessMsg('') }

  const create = async () => {
    if (!newSlug || !newContent) return
    clearMessages()
    try {
      await api.createSkill(newSlug, newContent)
      setNewSlug('')
      setNewContent('')
      setSuccessMsg(`Skill "${newSlug}" created`)
      load()
    } catch (e: any) {
      if (e instanceof ApiError && e.details) {
        const details = e.details as Array<{ message: string }>
        setError(details.map(d => d.message).join('; '))
      } else {
        setError(e.message || 'Failed to create skill')
      }
    }
  }

  const startEdit = async (slug: string) => {
    clearMessages()
    const data = await api.getSkill(slug)
    if (data.content) {
      setEditing(slug)
      setEditContent(data.content)
    }
  }

  const saveEdit = async () => {
    if (!editing || !editContent) return
    clearMessages()
    try {
      await api.updateSkill(editing, editContent)
      setSuccessMsg(`Skill "${editing}" updated`)
      setEditing(null)
      setEditContent('')
    } catch (e: any) {
      if (e instanceof ApiError && e.details) {
        const details = e.details as Array<{ message: string }>
        setError(details.map(d => d.message).join('; '))
      } else {
        setError(e.message || 'Failed to update skill')
      }
    }
  }

  const remove = async (slug: string) => {
    clearMessages()
    await api.deleteSkill(slug)
    setSuccessMsg(`Skill "${slug}" deleted`)
    load()
  }

  const formatSkill = async () => {
    if (!fmtName || !fmtDesc || !fmtText) return
    clearMessages()
    try {
      const result = await api.formatSkill(fmtName, fmtDesc, fmtText)
      if (result.content) {
        setNewContent(result.content)
        if (!newSlug) setNewSlug(fmtName)
        setSuccessMsg('Formatted as SKILL.md')
        setShowFormat(false)
        setFmtName(''); setFmtDesc(''); setFmtText('')
      } else {
        setError(result.validation?.errors?.map((e: any) => e.message).join('; ') || 'Format failed')
      }
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleZipUpload = async () => {
    const file = zipRef.current?.files?.[0]
    if (!file) return
    clearMessages()
    try {
      const result = await api.uploadSkillArchive(file)
      setUploadResult(result)
      if (result.installed?.length > 0) {
        setSuccessMsg(`Installed: ${result.installed.join(', ')}`)
        load()
      }
      if (result.rejected?.length > 0) {
        setError(`Rejected: ${result.rejected.join('; ')}`)
      }
    } catch (e: any) {
      setError(e.message)
    }
    if (zipRef.current) zipRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Skills</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-4 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {editing ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="font-medium text-sm mb-2">Edit: {editing}</h2>
          <textarea
            value={editContent} onChange={e => setEditContent(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-64 mb-2"
          />
          <div className="flex gap-2">
            <button onClick={saveEdit} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
              Save
            </button>
            <button onClick={() => { setEditing(null); setEditContent('') }} className="text-gray-500 text-sm hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <input
              value={newSlug} onChange={e => { setNewSlug(e.target.value); clearMessages() }}
              placeholder="Skill slug (e.g. my-skill)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
            />
            <textarea
              value={newContent} onChange={e => { setNewContent(e.target.value); clearMessages() }}
              placeholder="SKILL.md content (must have YAML frontmatter with name and description)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-40 mb-2"
            />
            <div className="flex gap-2 items-center">
              <button onClick={create} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
                Create Skill
              </button>
              <button onClick={() => setShowFormat(!showFormat)} className="text-sm text-blue-600 hover:underline">
                Format as Skill
              </button>
            </div>
          </div>

          {showFormat && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
              <h3 className="text-sm font-semibold mb-2">Format plain text as SKILL.md</h3>
              <input value={fmtName} onChange={e => setFmtName(e.target.value)}
                placeholder="Skill name (e.g. my-skill)" className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2" />
              <input value={fmtDesc} onChange={e => setFmtDesc(e.target.value)}
                placeholder="Short description" className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2" />
              <textarea value={fmtText} onChange={e => setFmtText(e.target.value)}
                placeholder="Plain text content to convert" className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-24 mb-2" />
              <div className="flex gap-2">
                <button onClick={formatSkill} className="bg-green-600 text-white rounded px-4 py-2 text-sm hover:bg-green-700">
                  Format
                </button>
                <button onClick={() => setShowFormat(false)} className="text-gray-500 text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-semibold mb-2">Upload ZIP archive</h3>
            <p className="text-xs text-gray-500 mb-2">ZIP containing SKILL.md files in subdirectories. Valid skills will be installed, invalid ones rejected.</p>
            <div className="flex gap-2 items-center">
              <input ref={zipRef} type="file" accept=".zip" className="text-sm" />
              <button onClick={handleZipUpload} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
                Upload
              </button>
            </div>
            {uploadResult && (
              <div className="mt-2 text-xs">
                {uploadResult.installed?.length > 0 && (
                  <p className="text-green-700">Installed: {uploadResult.installed.join(', ')}</p>
                )}
                {uploadResult.rejected?.length > 0 && (
                  <p className="text-red-600">Rejected: {uploadResult.rejected.join('; ')}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        {skills.map(s => (
          <div key={s.slug} className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
            <div>
              <p className="font-medium text-sm">{s.slug}</p>
              <p className="text-xs text-gray-500">{s.source}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(s.slug)} className="text-blue-600 text-sm hover:underline">Edit</button>
              <button onClick={() => remove(s.slug)} className="text-red-500 text-sm hover:text-red-700">Delete</button>
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-4">No skills yet. Create one above or upload a ZIP.</p>
        )}
      </div>
    </div>
  )
}
