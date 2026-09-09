import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { apiGet, apiPost } from '../api/client'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function ArXivSearch({ onAdded }) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState({})
  const debouncedQuery = useDebounce(query, 500)

  const shouldFetch = debouncedQuery.trim().length >= 3
  const { data, error, isLoading } = useSWR(
    shouldFetch ? `/api/arxiv/search?query=${encodeURIComponent(debouncedQuery)}&max_results=10` : null,
    apiGet
  )

  const { data: libraryData, mutate: mutateLibrary } = useSWR('/api/papers/', apiGet)
  const libraryArxivIds = new Set(
    (libraryData || []).map((p) => p.arxiv_id).filter(Boolean)
  )

  async function addPaper(paper) {
    setAdding((prev) => ({ ...prev, [paper.arxiv_id]: true }))
    try {
      await apiPost('/api/arxiv/add', {
        arxiv_id: paper.arxiv_id,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        pdf_url: paper.pdf_url,
      })
      await mutateLibrary()
      onAdded?.()
    } catch (e) {
      if (e.status === 409) {
        await mutateLibrary()
      } else {
        alert(`Failed to add paper: ${e.message}`)
      }
    } finally {
      setAdding((prev) => ({ ...prev, [paper.arxiv_id]: false }))
    }
  }

  const results = data?.results || []

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-800">
        <input
          type="text"
          placeholder="Search ArXiv (min 3 chars)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!shouldFetch && (
          <p className="p-4 text-slate-500 text-sm text-center">Type at least 3 characters to search.</p>
        )}
        {shouldFetch && isLoading && (
          <p className="p-4 text-slate-400 text-sm text-center">Searching…</p>
        )}
        {shouldFetch && error && (
          <p className="p-4 text-red-400 text-sm">Search failed.</p>
        )}
        {results.length === 0 && shouldFetch && !isLoading && !error && (
          <p className="p-4 text-slate-500 text-sm text-center">No results.</p>
        )}

        <ul className="divide-y divide-slate-800">
          {results.map((paper) => {
            const inLibrary = libraryArxivIds.has(paper.arxiv_id)
            const isAdding = adding[paper.arxiv_id]
            return (
              <li key={paper.arxiv_id} className="p-3">
                <p className="text-white text-sm font-medium leading-snug">{paper.title}</p>
                <p className="text-slate-400 text-xs mt-0.5 truncate">
                  {paper.authors?.slice(0, 3).join(', ')}
                  {paper.authors?.length > 3 ? ' et al.' : ''}
                </p>
                {paper.abstract && (
                  <p className="text-slate-500 text-xs mt-1 line-clamp-2">{paper.abstract}</p>
                )}
                <button
                  onClick={() => !inLibrary && !isAdding && addPaper(paper)}
                  disabled={inLibrary || isAdding}
                  className={`mt-2 text-xs px-2 py-1 rounded font-medium transition-colors ${
                    inLibrary
                      ? 'bg-green-900/60 text-green-400 border border-green-800 cursor-default'
                      : isAdding
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-700 hover:bg-blue-600 text-white cursor-pointer'
                  }`}
                >
                  {inLibrary ? 'Already in Library' : isAdding ? 'Adding…' : 'Add to Library'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
