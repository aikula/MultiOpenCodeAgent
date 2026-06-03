import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface CalendarEvent {
  id: string
  title: string
  startsAt: string | null
  endsAt: string | null
  location: string | null
  description: string | null
}

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const load = async () => {
    const data = await api.listEvents()
    setEvents(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!title) return
    await api.createEvent({ title, startsAt: startsAt || undefined, endsAt: endsAt || undefined })
    setTitle('')
    setStartsAt('')
    setEndsAt('')
    load()
  }

  const remove = async (id: string) => {
    await api.deleteEvent(id)
    load()
  }

  const showBrief = async () => {
    const today = new Date().toISOString().split('T')[0]
    const data = await api.calendarBrief(today)
    alert(data.brief || 'No events today')
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <button onClick={showBrief} className="text-sm text-blue-600 hover:underline">
          Today's brief
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Event title"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2"
        />
        <div className="flex gap-2 mb-3">
          <input
            type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
            placeholder="Start"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <input
            type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
            placeholder="End"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <button onClick={create} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
          Add Event
        </button>
      </div>

      <div className="space-y-2">
        {events.map(ev => (
          <div key={ev.id} className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
            <div>
              <p className="font-medium text-sm">{ev.title}</p>
              <p className="text-xs text-gray-500">
                {ev.startsAt ? new Date(ev.startsAt).toLocaleString() : 'No time'}
                {ev.endsAt ? ` — ${new Date(ev.endsAt).toLocaleTimeString()}` : ''}
                {ev.location ? ` @ ${ev.location}` : ''}
              </p>
            </div>
            <button onClick={() => remove(ev.id)} className="text-red-500 text-sm hover:text-red-700">
              Delete
            </button>
          </div>
        ))}
        {events.length === 0 && <p className="text-gray-400 text-sm text-center">No events yet</p>}
      </div>
    </div>
  )
}
