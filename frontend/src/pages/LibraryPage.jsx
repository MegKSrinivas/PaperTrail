import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { apiGet, apiPost, apiDelete } from '../api/client'
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
function PaperRow({ paper, isActive, onClick, groups, onMutateGroups, onDelete }) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const memberOf = groups.filter(g => g.paper_ids.includes(paper.id))
  const showStatus = paper.ingestion_status !== 'complete'

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
          {showStatus && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS[paper.ingestion_status] || STATUS.pending}`}>
              {paper.ingestion_status}
            </span>
          )}
          <span className="text-slate-600 text-xs">{relDate(paper.created_at)}</span>
          {memberOf.length > 0 && (
            <span className="text-slate-500 text-xs">
              {memberOf.map(g => g.name).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* row actions */}
      <div className="relative shrink-0 mt-0.5 flex items-center gap-1 opacity-0 group-hover/row:opacity-100">
        {/* add-to-group */}
        <button
          onClick={e => { e.stopPropagation(); setPopoverOpen(o => !o) }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:text-white hover:bg-slate-700 transition-colors"
          title="Add to group"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>

        {/* delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(paper) }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-600 hover:text-red-400 hover:bg-red-900/30 transition-colors"
          title="Delete paper"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
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

// ── Delete confirmation dialog ─────────────────────────────────────────────
function DeleteDialog({ paper, onConfirm, onCancel, deleting, deleted }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {deleted ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-900/60 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-base">Paper deleted</h2>
                <p className="text-slate-400 text-sm mt-0.5 leading-snug">
                  <span className="text-slate-200">{paper.title.replace(/\.pdf$/i, '')}</span> has been removed from your library.
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-white font-semibold text-base">Delete paper?</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              <span className="text-slate-200 font-medium">{paper.title.replace(/\.pdf$/i, '')}</span>
              {' '}will be permanently removed from your library, including all extracted entities, relationships, and search vectors. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const { activePaperId, setActivePaperId, mutatePapersRef } = useDashboard()
  const { data: papersData, mutate: mutatePapers } = useSWR('/api/papers/', apiGet)
  const { data: groupsData, mutate: mutateGroups } = useSWR('/api/groups/', apiGet)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  mutatePapersRef.current = mutatePapers

  const papers = papersData || []
  const groups = groupsData || []

  async function confirmDelete() {
    setDeleting(true)
    try {
      await apiDelete(`/api/papers/${pendingDelete.id}`)
      if (activePaperId === pendingDelete.id) setActivePaperId(null)
      await mutatePapers()
      setDeleted(true)
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    } finally {
      setDeleting(false)
    }
  }

  function closeDialog() {
    setPendingDelete(null)
    setDeleted(false)
  }

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
                onDelete={setPendingDelete}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-800 px-4 py-3">
        <PaperUploader onUploaded={() => mutatePapers()} />
      </div>

      {pendingDelete && (
        <DeleteDialog
          paper={pendingDelete}
          onConfirm={confirmDelete}
          onCancel={() => !deleting && closeDialog()}
          deleting={deleting}
          deleted={deleted}
        />
      )}
    </div>
  )
}
