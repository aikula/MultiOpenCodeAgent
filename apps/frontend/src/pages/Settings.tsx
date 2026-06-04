import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'

export function SettingsPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [agentsMd, setAgentsMd] = useState('')
  const [saved, setSaved] = useState(false)
  const [loginCode, setLoginCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

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

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (deletePassword.length === 0) {
      setDeleteError('Enter your password')
      return
    }
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Type DELETE to confirm')
      return
    }
    setDeleteLoading(true)
    try {
      await api.deleteAccount(deletePassword)
      logout()
      navigate('/register')
    } catch (err: any) {
      setDeleteError(err.message || 'Deletion failed')
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
        >
          Log out
        </button>
      </div>

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

      <div className="bg-white rounded-lg border border-red-200 p-4 mt-6">
        <h2 className="font-medium mb-1 text-red-700">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-3">
          Permanently delete your account, workspace, sessions, reminders, calendar events and memory.
          This action cannot be undone.
        </p>
        {!deleteOpen ? (
          <button
            onClick={() => setDeleteOpen(true)}
            className="bg-white text-red-700 border border-red-300 rounded px-4 py-2 text-sm hover:bg-red-50"
          >
            Delete my account
          </button>
        ) : (
          <div className="border border-red-200 rounded p-3 bg-red-50">
            <p className="text-sm text-red-800 mb-2 font-medium">
              This will erase all your data. Type DELETE below to confirm.
            </p>
            <label className="block text-xs text-gray-600 mb-1">Your password</label>
            <input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 bg-white"
              autoComplete="current-password"
            />
            <label className="block text-xs text-gray-600 mb-1">Type DELETE to confirm</label>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 bg-white font-mono"
            />
            {deleteError && (
              <p className="text-sm text-red-700 mb-2">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="bg-red-600 text-white rounded px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Permanently delete account'}
              </button>
              <button
                onClick={() => { setDeleteOpen(false); setDeleteError(''); setDeletePassword(''); setDeleteConfirm('') }}
                className="bg-white text-gray-700 border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
