import { useDashboard } from '../context/DashboardContext'
import ArXivSearch from '../components/ArXivSearch'

export default function ArXivPage() {
  const { mutatePapersRef } = useDashboard()

  function handleAdded() {
    mutatePapersRef.current?.()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-800 shrink-0">
        <h1 className="text-white font-semibold text-lg">ArXiv Search</h1>
        <p className="text-slate-400 text-sm mt-0.5">Search and add papers from ArXiv to your library.</p>
      </div>

      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full">
        <ArXivSearch onAdded={handleAdded} />
      </div>
    </div>
  )
}
