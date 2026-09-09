import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { apiGet, apiPost } from '../api/client'
import { useDashboard } from '../context/DashboardContext'
import PaperUploader from '../components/PaperUploader'

async function authedDel(path) {
  const token = localStorage.getItem('papertrail_token')
  const res = await fetch(path, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) { window.location.href = '/'; throw new Error() }
}
async function authedPost(path, body) {
  const token = localStorage.getItem('papertrail_token')
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (res.status === 401) { window.location.href = '/'; throw new Error() }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail) }
  return res.json()
}

const STATUS = {
  pending:    'bg-slate-700 text-slate-400',
  processing: 'bg-yellow-900/60 text-yellow-300',
  complete:   'bg-green-900/60 text-green-300',
  failed:     'bg-red-900/60 text-red-400',
}

function relDate(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

// ── Add-to-group popover ───────────────────────────────────────────────────
function AddToGroupPopover({ paper, groups, onMutateGroups, onClose }) {
  const ref = useRef(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  async function toggle(group) {
    const inGroup = group.paper_ids.includes(paper.id)
    if (inGroup) {
      await authedDel(`/api/groups/${group.id}/papers/${paper.id}`)
    } else {
      await authedPost(`/api/groups/${group.id}/papers`, { paper_id: paper.id })
    }
    onMutateGroups()
  }

  async function createAndAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const g = await authedPost('/api/groups/', { name: newName.trim() })
      await authedPost(`/api/groups/${g.id}/papers`, { paper_id: paper.id })
      onMutateGroups()
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      <p className="px-3 py-1.5 text-slate-400 text-xs font-medium uppercase tracking-wide">Add to group</p>

      {groups.length === 0 && (
        <p className="px-3 py-2 text-slate-500 text-xs">No groups yet — create one below.</p>
      )}

      {groups.map(g => {
        const inGroup = g.paper_ids.includes(paper.id)
        return (
          <button
            key={g.id}
            onClick={() => toggle(g)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-700 transition-colors"
          >
            <span className={inGroup ? 'text-green-300' : 'text-slate-200'}>{g.name}</span>
            <span className="text-slate-500 text-xs">{inGroup ? '✓' : `${g.paper_ids.length}`}</span>
          </button>
        )
      })}

      <div className="border-t border-slate-700 mt-1 pt-1">
        <form onSubmit={createAndAdd} className="flex items-center gap-1 px-2 pb-1">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New group…"
            className="flex-1 bg-slate-700 text-white text-xs px-2 py-1.5 rounded-lg placeholder-slate-500 border border-slate-600 focus:outline-none focus:border-blue-500 min-w-0"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-2 py-1.5 rounded-lg shrink-0"
          >
            {creating ? '…' : '+ New'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Paper row ──────────────────────────────────────────────────────────────
function PaperRow({ paper, isActive, onClick, groups, onMutateGroups }) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const memberOf = groups.filter(g => g.paper_ids.includes(paper.id))

  return (
    <li className={`group/row flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors cursor-pointer ${isActive ? 'bg-slate-800 border-l-2 border-blue-500 pl-3.5' : ''}`}>
      {/* main clickable area */}
      <div className="flex-1 min-w-0" onClick={onClick}>
        <p className="text-white text-sm font-medium leading-snug line-clamp-2">
          {paper.title.replace(/\.pdf$/i, '')}
        </p>
        {paper.authors?.length > 0 && (
          <p className="text-slate-400 text-xs mt-0.5 truncate">
            {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS[paper.ingestion_status] || STATUS.pending}`}>
            {paper.ingestion_status}
          </span>
          <span className="text-slate-600 text-xs">{relDate(paper.created_at)}</span>
          {memberOf.length > 0 && (
            <span className="text-slate-500 text-xs">
              {memberOf.map(g => g.name).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* add-to-group button */}
      <div className="relative shrink-0 mt-0.5">
        <button
          onClick={e => { e.stopPropagation(); setPopoverOpen(o => !o) }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:text-white hover:bg-slate-700 transition-colors opacity-0 group-hover/row:opacity-100"
          title="Add to group"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>

        {popoverOpen && (
          <AddToGroupPopover
            paper={paper}
            groups={groups}
            onMutateGroups={onMutateGroups}
            onClose={() => setPopoverOpen(false)}
          />
        )}
      </div>
    </li>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const { activePaperId, setActivePaperId, mutatePapersRef } = useDashboard()
  const { data: papersData, mutate: mutatePapers } = useSWR('/api/papers/', apiGet)
  const { data: groupsData, mutate: mutateGroups } = useSWR('/api/groups/', apiGet)

  mutatePapersRef.current = mutatePapers

  const papers = papersData || []
  const groups = groupsData || []

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-800 shrink-0">
        <h1 className="text-white font-semibold text-lg">Library</h1>
        <p className="text-slate-400 text-xs mt-0.5">
          Click a paper to scope research queries to it. Hover a paper to add it to a group.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {papers.length === 0 ? (
          <p className="p-8 text-slate-500 text-sm text-center">No papers yet — upload one below.</p>
        ) : (
          <ul>
            {papers.map(p => (
              <PaperRow
                key={p.id}
                paper={p}
                isActive={activePaperId === p.id}
                onClick={() => setActivePaperId(activePaperId === p.id ? null : p.id)}
                groups={groups}
                onMutateGroups={mutateGroups}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-800 px-4 py-3">
        <PaperUploader onUploaded={() => mutatePapers()} />
      </div>
    </div>
  )
}
