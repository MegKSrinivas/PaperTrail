import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/library',  label: 'Library',  icon: '📄' },
  { to: '/arxiv',    label: 'ArXiv',    icon: '🔍' },
  { to: '/research', label: 'Research', icon: '🔬' },
  { to: '/graph',    label: 'Graph',    icon: '🕸️' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar */}
      <nav className="w-48 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900">
        <div className="px-4 py-4 border-b border-slate-800">
          <span className="text-white font-semibold tracking-tight">PaperTrail</span>
        </div>

        <ul className="flex-1 py-3 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-300 font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <span>{icon}</span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="px-3 py-3 border-t border-slate-800 space-y-2">
          {user?.picture_url && (
            <div className="flex items-center gap-2 px-1">
              <img src={user.picture_url} alt={user.name} className="w-6 h-6 rounded-full" />
              <span className="text-slate-400 text-xs truncate">{user.name}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-slate-400 hover:text-white text-xs rounded-lg hover:bg-slate-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
