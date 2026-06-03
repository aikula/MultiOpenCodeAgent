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

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [tab, setTab] = useState<'users' | 'catalogs' | 'audit'>('users')
  const [quotaAmount, setQuotaAmount] = useState('10')
  const [catalogName, setCatalogName] = useState('')
  const [catalogUrl, setCatalogUrl] = useState('')

  const loadUsers = async () => {
    const data = await api.adminListUsers()
    setUsers(Array.isArray(data) ? data : [])
  }

  useEffect(() => { loadUsers() }, [])

  const blockUser = async (id: string, status: string) => {
    await api.adminUpdateUser(id, { status: status === 'blocked' ? 'active' : 'blocked' })
    loadUsers()
  }

  const grantQuota = async (id: string) => {
    await api.adminGrantQuota(id, Number(quotaAmount), 'admin_grant')
    loadUsers()
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

      <div className="flex gap-2 mb-6">
        {(['users', 'catalogs', 'audit'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
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
