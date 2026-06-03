import { useState, useEffect } from 'react'
import { api } from '../api/client'

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

  const load = async () => {
    const data = await api.listSkills()
    setSkills(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newSlug || !newContent) return
    await api.createSkill(newSlug, newContent)
    setNewSlug('')
    setNewContent('')
    load()
  }

  const startEdit = async (slug: string) => {
    const data = await api.getSkill(slug)
    if (data.content) {
      setEditing(slug)
      setEditContent(data.content)
    }
  }

  const saveEdit = async () => {
    if (!editing || !editContent) return
    await api.updateSkill(editing, editContent)
    setEditing(null)
    setEditContent('')
  }

  const remove = async (slug: string) => {
    await api.deleteSkill(slug)
    load()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Skills</h1>

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
            <button onClick={() => setEditing(null)} className="text-gray-500 text-sm hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <input
            value={newSlug} onChange={e => setNewSlug(e.target.value)}
            placeholder="Skill slug (e.g. my-skill)"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
          />
          <textarea
            value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="SKILL.md content"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-40 mb-2"
          />
          <button onClick={create} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
            Create Skill
          </button>
        </div>
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
      </div>
    </div>
  )
}
