import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api/client'
import { useDashboard } from '../context/DashboardContext'
import QueryInterface from '../components/QueryInterface'
import FindingsPanel from '../components/FindingsPanel'

export default function ResearchPage() {
  const { activePaperId, setActivePaperId, lastResult, setLastResult } = useDashboard()
  const { data } = useSWR('/api/papers/', apiGet)
  const papers = data || []
  const navigate = useNavigate()

  const activePaper = papers.find((p) => p.id === activePaperId)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Query interface */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-slate-800">
        <div className="px-4 py-3 border-b border-slate-800 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-white font-semibold text-base">Research</h1>
            {activePaper ? (
              <p className="text-blue-300 text-xs mt-0.5">
                Scoped to: <span className="font-medium">{activePaper.title.replace(/\.pdf$/i, '')}</span>
              </p>
            ) : (
              <p className="text-slate-400 text-xs mt-0.5">Searching across all papers</p>
            )}
          </div>
          <div className="flex gap-2">
            {activePaper && (
              <button
                onClick={() => setActivePaperId(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
              >
                Clear scope ×
              </button>
            )}
            <button
              onClick={() => navigate('/library')}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
            >
              {activePaper ? 'Change paper →' : 'Select a paper →'}
            </button>
          </div>
        </div>

        <QueryInterface
          activePaperId={activePaperId}
          onResult={setLastResult}
        />
      </div>

      {/* Findings */}
      <div className="w-96 shrink-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 shrink-0">
          <h2 className="text-white font-semibold text-base">Findings</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <FindingsPanel result={lastResult} papers={papers} />
        </div>
      </div>
    </div>
  )
}
