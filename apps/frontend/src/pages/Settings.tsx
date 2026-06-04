import { useState, useEffect } from 'react'
import { api } from '../api/client'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [agentsMd, setAgentsMd] = useState('')
  const [saved, setSaved] = useState(false)
  const [loginCode, setLoginCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)

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

  const generateLoginCode = async () => {
    setCodeLoading(true)
    try {
      const data = await api.getLoginCode()
      setLoginCode(data.code)
    } finally {
      setCodeLoading(false)
    }
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

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="font-medium mb-3">Telegram</h2>
        <p className="text-sm text-gray-600 mb-3">
          Link your Telegram account to chat with your agent via the Telegram bot.
        </p>
        {!loginCode ? (
          <button
            onClick={generateLoginCode}
            disabled={codeLoading}
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {codeLoading ? 'Generating...' : 'Get Login Code'}
          </button>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Send this command to the Telegram bot:
            </p>
            <div className="bg-gray-100 rounded px-4 py-3 font-mono text-sm select-all break-all">
              /login {loginCode}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Code expires in 10 minutes.{' '}
              <button onClick={generateLoginCode} className="text-blue-600 underline">
                Generate new code
              </button>
            </p>
          </div>
        )}
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
