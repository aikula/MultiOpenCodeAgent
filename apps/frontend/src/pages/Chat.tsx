import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'

interface Session {
  id: string
  title: string | null
  isMain: boolean
  source: string
  createdAt: string
}

interface Message {
  id: string
  role: string
  content: string | null
  channel: string
  createdAt: string
}

export function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.listSessions().then(data => {
      if (Array.isArray(data)) {
        setSessions(data)
        const main = data.find((s: Session) => s.isMain)
        if (main) setActiveSession(main.id)
        else if (data.length > 0) setActiveSession(data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (activeSession) {
      api.getMessages(activeSession).then(data => {
        setMessages(Array.isArray(data) ? data : [])
      })
    }
  }, [activeSession])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const createSession = async () => {
    const data = await api.createSession()
    if (data.id) {
      setSessions(prev => [...prev, data])
      setActiveSession(data.id)
    }
  }

  const send = async () => {
    if (!input.trim() || !activeSession || sending) return
    setSending(true)
    try {
      const data = await api.sendMessage(activeSession, input.trim())
      setMessages(prev => [
        ...prev,
        { id: data.userMessage, role: 'user', content: input.trim(), channel: 'web', createdAt: new Date().toISOString() },
        { id: data.assistantMessage, role: 'assistant', content: data.content, channel: 'web', createdAt: new Date().toISOString() },
      ])
      setInput('')
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const setMain = async (id: string) => {
    await api.setMainSession(id)
    setSessions(prev => prev.map(s => ({ ...s, isMain: s.id === id })))
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={createSession}
            className="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm hover:bg-blue-700"
          >
            + New Session
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              onDoubleClick={() => setMain(s.id)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 ${
                activeSession === s.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{s.title || 'Untitled'}</span>
                {s.isMain && <span className="text-xs text-blue-500">main</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-gray-400 text-center mt-20">Send a message to start</p>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-400">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Type a message..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
              disabled={sending || !activeSession}
            />
            <button
              onClick={send}
              disabled={sending || !activeSession}
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
