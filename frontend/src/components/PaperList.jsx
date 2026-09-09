import useSWR from 'swr'
import { apiGet } from '../api/client'

const STATUS_STYLES = {
  pending: 'bg-slate-700 text-slate-300',
  processing: 'bg-yellow-900 text-yellow-300',
  complete: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
}

function relativeDate(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function PaperList({ activePaperId, onSelectPaper, swrRef }) {
  const { data, error, isLoading, mutate } = useSWR('/api/papers/', apiGet)

  if (swrRef) swrRef.current = mutate

  if (isLoading) {
    return <div className="p-4 text-slate-400 text-sm">Loading papers…</div>
  }
  if (error) {
    return <div className="p-4 text-red-400 text-sm">Failed to load papers.</div>
  }

  const papers = data || []

  if (papers.length === 0) {
    return (
      <div className="p-4 text-slate-500 text-sm text-center">
        No papers yet — upload one or search ArXiv.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-800">
      {papers.map((p) => (
        <li
          key={p.id}
          onClick={() => onSelectPaper(activePaperId === p.id ? null : p.id)}
          className={`p-3 cursor-pointer transition-colors hover:bg-slate-800 ${
            activePaperId === p.id ? 'bg-slate-800 border-l-2 border-blue-500' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-white text-sm font-medium leading-snug line-clamp-2 flex-1">
              {p.title.replace(/\.pdf$/i, '')}
            </p>
            <span
              className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                STATUS_STYLES[p.ingestion_status] || STATUS_STYLES.pending
              }`}
            >
              {p.ingestion_status}
            </span>
          </div>
          {p.authors?.length > 0 && (
            <p className="text-slate-400 text-xs mt-0.5 truncate">
              {p.authors.slice(0, 3).join(', ')}
              {p.authors.length > 3 ? ' et al.' : ''}
            </p>
          )}
          <p className="text-slate-600 text-xs mt-0.5">{relativeDate(p.created_at)}</p>
        </li>
      ))}
    </ul>
  )
}
