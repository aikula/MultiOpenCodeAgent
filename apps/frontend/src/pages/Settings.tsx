import { useState, useEffect } from 'react'
import { api } from '../api/client'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [agentsMd, setAgentsMd] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSettings().then(data => setSettings(data))
    api.getAgentsMd().then(data => setAgentsMd(data.content || ''))
  }, [])

  const saveSettings = async () => {
    await api.updateSettings({
      displayName: settings.displayName,
      language: settings.language,
      responseStyle: settings.responseStyle,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveAgentsMd = async () => {
    await api.updateAgentsMd(agentsMd)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="font-medium mb-3">Profile</h2>
        <label className="block text-sm text-gray-600 mb-1">Display Name</label>
        <input
          value={settings.displayName || ''} onChange={e => setSettings({ ...settings, displayName: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
        />
        <label className="block text-sm text-gray-600 mb-1">Language</label>
        <input
          value={settings.language || ''} onChange={e => setSettings({ ...settings, language: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
        />
        <label className="block text-sm text-gray-600 mb-1">Response Style</label>
        <input
          value={settings.responseStyle || ''} onChange={e => setSettings({ ...settings, responseStyle: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
        />
        <button onClick={saveSettings} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
          Save{saved && ' ✓'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium mb-3">AGENTS.md</h2>
        <textarea
          value={agentsMd} onChange={e => setAgentsMd(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono h-64 mb-2"
        />
        <button onClick={saveAgentsMd} className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700">
          Save AGENTS.md{saved && ' ✓'}
        </button>
      </div>
    </div>
  )
}
