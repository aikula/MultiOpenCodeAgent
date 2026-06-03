import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Reminder {
  id: string
  title: string
  description: string | null
  remindAt: string
  status: string
  channel: string
}

export function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [title, setTitle] = useState('')
  const [remindAt, setRemindAt] = useState('')

  const load = async () => {
    const data = await api.listReminders()
    setReminders(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!title || !remindAt) return
    await api.createReminder({ title, remindAt })
    setTitle('')
    setRemindAt('')
    load()
  }

  const cancel = async (id: string) => {
    await api.cancelReminder(id)
    load()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Reminders</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex gap-2 mb-3">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Reminder title"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <input
            type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button onClick={create} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {reminders.map(r => (
          <div key={r.id} className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
            <div>
              <p className="font-medium text-sm">{r.title}</p>
              <p className="text-xs text-gray-500">{new Date(r.remindAt).toLocaleString()} · {r.status}</p>
            </div>
            {r.status === 'scheduled' && (
              <button onClick={() => cancel(r.id)} className="text-red-500 text-sm hover:text-red-700">
                Cancel
              </button>
            )}
          </div>
        ))}
        {reminders.length === 0 && <p className="text-gray-400 text-sm text-center">No reminders yet</p>}
      </div>
    </div>
  )
}
