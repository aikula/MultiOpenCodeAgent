import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface User {
  id: string
  email: string
  displayName: string | null
  role: string
  status: string
  language: string
  dailyQuotaLimit: number
  createdAt: string
}

interface Invite {
  id: string
  label: string | null
  status: string
  maxUses: number | null
  usedCount: number | null
  expiresAt: string | null
  createdAt: string
}

interface McpServer {
  name: string
  type: string
  status: string
  tools?: Array<{ name: string; description?: string }>
  error?: string
}

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [diagnostics, setDiagnostics] = useState<Record<string, any> | null>(null)
  const [newInviteLabel, setNewInviteLabel] = useState('')
  const [newInviteMaxUses, setNewInviteMaxUses] = useState('1')
  const [newInviteExpires, setNewInviteExpires] = useState('')
  const [lastCreatedCode, setLastCreatedCode] = useState('')
  const [tab, setTab] = useState<'users' | 'invites' | 'mcp' | 'diagnostics' | 'catalogs' | 'audit'>('users')
  const [quotaAmount, setQuotaAmount] = useState('10')
  const [catalogName, setCatalogName] = useState('')
  const [catalogUrl, setCatalogUrl] = useState('')

  const loadUsers = async () => {
    const data = await api.adminListUsers()
    setUsers(Array.isArray(data) ? data : [])
  }

  const loadInvites = async () => {
    try {
      const data = await api.adminListInvites()
      setInvites(Array.isArray(data) ? data : [])
    } catch { setInvites([]) }
  }

  const loadMcp = async () => {
    try {
      const data = await api.getMcpStatus()
      setMcpServers(Array.isArray(data?.servers) ? data.servers : [])
    } catch { setMcpServers([]) }
  }

  useEffect(() => { loadUsers(); loadInvites(); loadMcp() }, [])

  const blockUser = async (id: string, status: string) => {
    await api.adminUpdateUser(id, { status: status === 'blocked' ? 'active' : 'blocked' })
    loadUsers()
  }

  const grantQuota = async (id: string) => {
    await api.adminGrantQuota(id, Number(quotaAmount), 'admin_grant')
    loadUsers()
  }

  const createInvite = async () => {
    const data: any = { label: newInviteLabel || undefined, maxUses: Number(newInviteMaxUses) || 1 }
    if (newInviteExpires) data.expiresAt = newInviteExpires
    const result = await api.adminCreateInvite(data)
    setLastCreatedCode(result.code || '')
    setNewInviteLabel('')
    setNewInviteMaxUses('1')
    setNewInviteExpires('')
    loadInvites()
  }

  const disableInvite = async (id: string) => {
    await api.adminDisableInvite(id)
    loadInvites()
  }

  const addCatalog = async () => {
    if (!catalogName) return
    await api.adminAddCatalog(catalogName, 'json', catalogUrl || undefined)
    setCatalogName('')
    setCatalogUrl('')
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['users', 'invites', 'mcp', 'diagnostics', 'catalogs', 'audit'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {t === 'mcp' ? 'MCP Status' : t === 'diagnostics' ? 'Diagnostics' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div>
          <div className="flex gap-2 mb-4 items-center">
            <span className="text-sm text-gray-500">Quota amount:</span>
            <input type="number" value={quotaAmount} onChange={e => setQuotaAmount(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-20" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Limit</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2">{u.email}</td>
                  <td className="py-2">{u.role}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-2">{u.dailyQuotaLimit}</td>
                  <td className="py-2 space-x-2">
                    <button onClick={() => blockUser(u.id, u.status)}
                      className={`text-xs ${u.status === 'blocked' ? 'text-green-600' : 'text-red-600'}`}>
                      {u.status === 'blocked' ? 'Unblock' : 'Block'}
                    </button>
                    <button onClick={() => grantQuota(u.id)}
                      className="text-xs text-blue-600">+Quota</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invites' && (
        <div>
          <div className="bg-gray-50 rounded p-4 mb-4">
            <h3 className="text-sm font-semibold mb-2">Create invite code</h3>
            <div className="flex gap-2 mb-2">
              <input value={newInviteLabel} onChange={e => setNewInviteLabel(e.target.value)}
                placeholder="Label (e.g. MBA group)" className="border border-gray-300 rounded px-3 py-2 text-sm flex-1" />
              <input type="number" value={newInviteMaxUses} onChange={e => setNewInviteMaxUses(e.target.value)}
                placeholder="Max uses" className="border border-gray-300 rounded px-3 py-2 text-sm w-24" min={1} />
              <input type="datetime-local" value={newInviteExpires} onChange={e => setNewInviteExpires(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm" />
              <button onClick={createInvite} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">Create</button>
            </div>
            {lastCreatedCode && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-sm">
                <span className="font-mono font-bold">{lastCreatedCode}</span>
                <span className="text-gray-500 ml-2">(copy now — shown once)</span>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-2">Label</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Uses</th>
                <th className="pb-2">Expires</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => (
                <tr key={inv.id} className="border-b border-gray-100">
                  <td className="py-2">{inv.label || '—'}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${inv.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2">{inv.usedCount ?? 0}/{inv.maxUses ?? 1}</td>
                  <td className="py-2">{inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}</td>
                  <td className="py-2">
                    {inv.status === 'active' && (
                      <button onClick={() => disableInvite(inv.id)} className="text-xs text-red-600">Disable</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'mcp' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold">MCP Server Status</h3>
            <button onClick={loadMcp} className="text-xs text-blue-600">Refresh</button>
          </div>
          {mcpServers.length === 0 ? (
            <p className="text-gray-400 text-sm">No MCP servers configured or OpenCode unavailable.</p>
          ) : (
            <div className="space-y-3">
              {mcpServers.map(srv => (
                <div key={srv.name} className="border border-gray-200 rounded p-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${srv.status === 'connected' || srv.status === 'ready' ? 'bg-green-500' : 'bg-red-400'}`} />
                    <span className="font-medium text-sm">{srv.name}</span>
                    <span className="text-xs text-gray-500">{srv.type}</span>
                    <span className="text-xs text-gray-400 ml-auto">{srv.status}</span>
                  </div>
                  {srv.error && <p className="text-xs text-red-500 mt-1">{srv.error}</p>}
                  {srv.tools && srv.tools.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Tools: {srv.tools.map(t => t.name).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'diagnostics' && (
        <div>
          <button onClick={async () => {
            try { setDiagnostics(await api.adminDiagnostics()) } catch { setDiagnostics({ error: 'Failed to run diagnostics' }) }
          }} className="bg-blue-600 text-white rounded px-4 py-2 text-sm mb-4">Run diagnostics</button>
          {diagnostics && (
            <pre className="bg-gray-50 rounded p-4 text-xs overflow-auto max-h-[32rem]">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>
      )}

      {tab === 'catalogs' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input value={catalogName} onChange={e => setCatalogName(e.target.value)}
              placeholder="Catalog name" className="border border-gray-300 rounded px-3 py-2 text-sm flex-1" />
            <input value={catalogUrl} onChange={e => setCatalogUrl(e.target.value)}
              placeholder="Source URL (optional)" className="border border-gray-300 rounded px-3 py-2 text-sm flex-1" />
            <button onClick={addCatalog} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">Add</button>
          </div>
          <p className="text-gray-400 text-sm">Manage skill catalogs for marketplace import.</p>
        </div>
      )}

      {tab === 'audit' && (
        <p className="text-gray-400 text-sm">Audit log will appear here when admin actions are performed.</p>
      )}
    </div>
  )
}
