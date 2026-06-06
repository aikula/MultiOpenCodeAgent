import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [nav, setNav] = useState('chat')

  useEffect(() => {
    const match = [
      { id: 'chat', path: '/' },
      { id: 'calendar', path: '/calendar' },
      { id: 'reminders', path: '/reminders' },
      { id: 'skills', path: '/skills' },
      { id: 'files', path: '/files' },
      { id: 'settings', path: '/settings' },
      { id: 'admin', path: '/admin' },
    ].find(l => l.path === location.pathname)
    if (match) setNav(match.id)
  }, [location.pathname])

  if (!user) return <>{children}</>

  const links = [
    { id: 'chat', label: 'Chat', path: '/' },
    { id: 'calendar', label: 'Calendar', path: '/calendar' },
    { id: 'reminders', label: 'Reminders', path: '/reminders' },
    { id: 'skills', label: 'Skills', path: '/skills' },
    { id: 'files', label: 'Files', path: '/files' },
    { id: 'settings', label: 'Settings', path: '/settings' },
    ...(user.role === 'admin' ? [{ id: 'admin', label: 'Admin', path: '/admin' }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <nav className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="font-bold text-lg">MOCA</h1>
          <p className="text-xs text-gray-500 truncate">{user.email}</p>
        </div>
        <div className="flex-1 py-2">
          {links.map(l => (
            <button
              key={l.id}
              onClick={() => { setNav(l.id); navigate(l.path) }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                nav === l.id ? 'bg-gray-100 font-medium' : 'text-gray-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200 space-y-2">
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
            Log out
          </button>
          <div>
            <button onClick={() => navigate('/settings')} className="text-xs text-red-400 hover:text-red-600">
              Delete profile...
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
