import { useState } from 'react'
import useSWR from 'swr'
import { apiGet } from '../api/client'
import KnowledgeGraph from '../components/KnowledgeGraph'

async function authedFetch(path, options = {}) {
  const token = localStorage.getItem('papertrail_token')
  const headers = { ...options.headers, Authorization: `Bearer ${token}` }
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) { window.location.href = '/'; throw new Error() }
  if (res.status === 204) return null
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail) }
  return res.json()
}
const post = (path, body) => authedFetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const del = (path) => authedFetch(path, { method: 'DELETE' })
const patch = (path, body) => authedFetch(path, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export default function GraphPage() {
  const { data: groups, mutate: mutateGroups } = useSWR('/api/groups/', apiGet)
  const allGroups = groups || []

  const [selectedId, setSelectedId] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')

  const selectedGroup = allGroups.find(g => g.id === selectedId)

  async function createGroup(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const g = await post('/api/groups/', { name: newName.trim() })
      await mutateGroups()
      setSelectedId(g.id)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  async function deleteGroup(e, id) {
    e.stopPropagation()
    await del(`/api/groups/${id}`)
    if (selectedId === id) setSelectedId(null)
    await mutateGroups()
  }

  async function saveRename(id) {
    if (!renameVal.trim()) { setRenamingId(null); return }
    await patch(`/api/groups/${id}`, { name: renameVal.trim() })
    setRenamingId(null)
    await mutateGroups()
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: groups list ── */}
      <div className="w-60 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/50">
        <div className="px-4 py-4 border-b border-slate-800">
          <p className="text-white font-semibold text-sm">Graph Groups</p>
          <p className="text-slate-500 text-xs mt-0.5">Add papers in Library →</p>
        </div>

        {/* group list */}
        <ul className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {allGroups.map(g => (
            <li key={g.id}>
              <button
                onClick={() => setSelectedId(g.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors group/item ${
                  selectedId === g.id
                    ? 'bg-blue-600/20 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {/* playlist icon */}
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 text-slate-500">
                  <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 1.5h12A.5.5 0 0116.5 4v12a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V4A.5.5 0 014 3.5z" clipRule="evenodd" />
                  <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                </svg>

                {renamingId === g.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => saveRename(g.id)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(g.id); if (e.key === 'Escape') setRenamingId(null) }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-slate-700 text-white text-sm px-1.5 py-0.5 rounded border border-slate-500 focus:outline-none min-w-0"
                  />
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{g.name}</span>
                    <span className="text-slate-600 text-xs shrink-0">{g.paper_ids.length}</span>
                  </>
                )}

                {/* hover actions */}
                {renamingId !== g.id && (
                  <span className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); setRenamingId(g.id); setRenameVal(g.name) }}
                      className="text-slate-500 hover:text-slate-200 text-xs leading-none px-0.5"
                      title="Rename"
                    >✎</span>
                    <span
                      role="button"
                      onClick={e => deleteGroup(e, g.id)}
                      className="text-slate-500 hover:text-red-400 text-xs leading-none px-0.5"
                      title="Delete"
                    >×</span>
                  </span>
                )}
              </button>
            </li>
          ))}

          {allGroups.length === 0 && (
            <li className="px-3 py-6 text-slate-600 text-xs text-center leading-relaxed">
              No groups yet.<br />Create one below, then add<br />papers from the Library.
            </li>
          )}
        </ul>

        {/* create group */}
        <form onSubmit={createGroup} className="p-3 border-t border-slate-800 flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New group…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 min-w-0"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-2.5 py-1.5 rounded-lg shrink-0"
          >
            {creating ? '…' : 'Create'}
          </button>
        </form>
      </div>

      {/* ── Right: knowledge graph ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedGroup ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-slate-400 text-sm">Select a group to view its knowledge graph</p>
              <p className="text-slate-600 text-xs">Add papers to a group from the Library page</p>
            </div>
          </div>
        ) : selectedGroup.paper_ids.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-white font-medium">{selectedGroup.name}</p>
              <p className="text-slate-400 text-sm">This group has no papers yet.</p>
              <p className="text-slate-500 text-xs">Go to Library, hover a paper, click + to add it here.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-5 py-3 border-b border-slate-800 shrink-0 flex items-center gap-3">
              <div>
                <h2 className="text-white font-semibold">{selectedGroup.name}</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {selectedGroup.paper_ids.length} paper{selectedGroup.paper_ids.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <KnowledgeGraph groupId={selectedId} />
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
