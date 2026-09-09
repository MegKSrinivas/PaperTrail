import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../api/client'
import PaperList from '../components/PaperList'
import PaperUploader from '../components/PaperUploader'
import ArXivSearch from '../components/ArXivSearch'
import QueryInterface from '../components/QueryInterface'
import FindingsPanel from '../components/FindingsPanel'
import KnowledgeGraph from '../components/KnowledgeGraph'

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-slate-800">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`flex-1 text-xs font-medium py-2 transition-colors ${
            active === tab
              ? 'text-white border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export default function ResearchDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [activePaperId, setActivePaperId] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [leftTab, setLeftTab] = useState('Library')
  const [rightTab, setRightTab] = useState('Findings')

  const mutatePapersRef = useRef(null)

  const { data: papersData } = useSWR('/api/papers/', apiGet)
  const papers = papersData || []

  function handleUploaded() {
    mutatePapersRef.current?.()
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-slate-800 shrink-0">
        <span className="text-white font-semibold tracking-tight">PaperTrail</span>

        <div className="flex items-center gap-3">
          {user?.picture_url && (
            <img
              src={user.picture_url}
              alt={user.name}
              className="w-7 h-7 rounded-full"
            />
          )}
          <span className="text-slate-400 text-sm hidden sm:block">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-sm transition-colors px-2 py-1 rounded hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </header>

      {/* 3-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — Library / ArXiv */}
        <aside className="w-80 shrink-0 flex flex-col border-r border-slate-800 overflow-hidden">
          <TabBar
            tabs={['Library', 'ArXiv']}
            active={leftTab}
            onChange={setLeftTab}
          />

          {leftTab === 'Library' ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <PaperList
                  activePaperId={activePaperId}
                  onSelectPaper={setActivePaperId}
                  swrRef={mutatePapersRef}
                />
              </div>
              <PaperUploader onUploaded={handleUploaded} />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <ArXivSearch onAdded={handleUploaded} />
            </div>
          )}
        </aside>

        {/* Center — Query interface */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-slate-800">
          {activePaperId && (
            <div className="flex items-center justify-between px-4 py-1.5 bg-blue-950/40 border-b border-blue-900/50 shrink-0">
              <span className="text-blue-300 text-xs">
                Scoped to: <span className="font-medium">
                  {papers.find((p) => p.id === activePaperId)?.title?.replace(/\.pdf$/i, '') || 'selected paper'}
                </span>
              </span>
              <button
                onClick={() => setActivePaperId(null)}
                className="text-blue-400 hover:text-white text-xs transition-colors"
              >
                Clear ×
              </button>
            </div>
          )}
          <QueryInterface
            activePaperId={activePaperId}
            onResult={setLastResult}
          />
        </main>

        {/* Right panel — Findings / Graph */}
        <aside className="w-96 shrink-0 flex flex-col overflow-hidden">
          <TabBar
            tabs={['Findings', 'Graph']}
            active={rightTab}
            onChange={setRightTab}
          />

          <div className="flex-1 overflow-hidden">
            {rightTab === 'Findings' ? (
              <FindingsPanel result={lastResult} papers={papers} />
            ) : (
              <KnowledgeGraph />
            )}
          </div>
        </aside>

      </div>
    </div>
  )
}
